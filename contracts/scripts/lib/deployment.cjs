// Reproducible deployment of VerifikasiIjazah with a persistent, non-secret record (UAS C.3/C.4, FX-02).
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { ethers } = require('ethers');
const { ToolError, account, assertChain, readRoles } = require('./roles.cjs');

const CONTRACTS_DIR = resolve(__dirname, '..', '..');
const ROLE_ENV = ['ADMIN_ADDRESS', 'ATTESTOR_ADDRESS', 'RELAYER_ADDRESS', 'RESULT_READER_ADDRESS'];

/** Constructor roles from explicit values; all four must be distinct and non-zero (S-01 policy). */
function roleAddresses(values) {
  const roles = ROLE_ENV.map(name => account(values[name], name));
  if (new Set(roles).size !== roles.length) throw new ToolError('Ditolak sebelum transaksi: ADMIN, ATTESTOR, RELAYER dan RESULT_READER harus empat alamat berbeda.');
  const signers = (values.PLANNED_SIGNER_ADDRESSES || '').split(',').map(item => item.trim()).filter(Boolean).map(item => account(item, 'PLANNED_SIGNER_ADDRESSES'));
  const overlap = signers.filter(signer => roles.includes(signer));
  if (overlap.length) throw new ToolError(`Ditolak sebelum transaksi: signer institusi ${overlap.join(', ')} juga dipakai sebagai peran layanan/admin.`);
  return { admin: roles[0], attestor: roles[1], relayer: roles[2], reader: roles[3], plannedSigners: signers };
}

/** Read the installed manifest directly: some packages (ethers, @fhevm/hardhat-plugin) do not export ./package.json. */
function packageVersion(name) {
  try { return JSON.parse(readFileSync(join(CONTRACTS_DIR, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version ?? null; }
  catch { return null; }
}

function git(args) {
  try { return execFileSync('git', args, { cwd: CONTRACTS_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

/** Compiler settings and identities of the exact artifact being deployed. */
async function buildIdentity(hre) {
  const artifact = await hre.artifacts.readArtifact('VerifikasiIjazah');
  const buildInfo = await hre.artifacts.getBuildInfo('src/VerifikasiIjazah.sol:VerifikasiIjazah');
  const settings = hre.config.solidity.compilers[0].settings;
  const source = readFileSync(join(CONTRACTS_DIR, 'src', 'VerifikasiIjazah.sol'));
  return {
    solc: { version: buildInfo?.solcVersion ?? hre.config.solidity.compilers[0].version, longVersion: buildInfo?.solcLongVersion ?? null },
    optimizer: settings.optimizer, viaIR: Boolean(settings.viaIR), evmVersion: settings.evmVersion,
    buildInfoId: buildInfo?.id ?? null,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    creationBytecodeKeccak256: ethers.keccak256(artifact.bytecode),
    deployedBytecodeKeccak256: ethers.keccak256(artifact.deployedBytecode),
  };
}

function dependencies() {
  return Object.fromEntries(['hardhat', '@openzeppelin/contracts', '@fhevm/solidity', '@fhevm/hardhat-plugin', '@zama-fhe/relayer-sdk', 'ethers', 'solc']
    .map(name => [name, packageVersion(name)]));
}

/** Everything that can be checked without sending a transaction. */
async function preflight(hre, { values, expectedChainId }) {
  const chainId = await assertChain(hre.ethers.provider, expectedChainId);
  const roles = roleAddresses(values);
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new ToolError('Akun deployer belum dikonfigurasi (DEPLOYER_PRIVATE_KEY).');
  const factory = await hre.ethers.getContractFactory('VerifikasiIjazah', deployer);
  const request = await factory.getDeployTransaction(roles.admin, roles.attestor, roles.relayer, roles.reader);
  const gas = await hre.ethers.provider.estimateGas({ ...request, from: deployer.address });
  const fee = await hre.ethers.provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const required = gas * price;
  if (balance < required) throw new ToolError(`Saldo deployer ${ethers.formatEther(balance)} ETH kurang dari estimasi ${ethers.formatEther(required)} ETH.`);
  return { chainId: Number(chainId), network: hre.network.name, deployer: deployer.address, roles, estimatedGas: gas.toString(),
    maxFeePerGas: price.toString(), estimatedCostWei: required.toString(), deployerBalanceWei: balance.toString() };
}

async function deploy(hre, { values, expectedChainId, confirmations = 2, execute = false, recordDir }) {
  const plan = await preflight(hre, { values, expectedChainId });
  if (!execute) return { executed: false, plan };
  const [deployer] = await hre.ethers.getSigners();
  const { admin, attestor, relayer, reader } = plan.roles;
  const contract = await hre.ethers.deployContract('VerifikasiIjazah', [admin, attestor, relayer, reader], deployer);
  const transaction = contract.deploymentTransaction();
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new ToolError(`Deployment ${transaction.hash} gagal.`);
  const address = ethers.getAddress(receipt.contractAddress);
  const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
  const deployed = await hre.ethers.getContractAt('VerifikasiIjazah', address);
  const roles = await readRoles(deployed, { fromBlock: receipt.blockNumber });
  const expected = { DEFAULT_ADMIN_ROLE: [admin], ATTESTOR_ROLE: [attestor], RELAYER_ROLE: [relayer], RESULT_READER_ROLE: [reader] };
  if (JSON.stringify(roles.roles) !== JSON.stringify(expected)) throw new ToolError('Pemegang peran setelah deployment tidak sesuai konstruktor.');
  const record = {
    schema: 'verifikasi-deployment-record/v1',
    network: hre.network.name, chainId: plan.chainId,
    contract: { name: 'VerifikasiIjazah', address, eip712: { name: 'VerifikasiIjazah', version: await eip712Version(deployed) } },
    deployment: { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
      blockTimestampUtc: new Date(block.timestamp * 1000).toISOString(), deployer: deployer.address,
      gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: (receipt.gasPrice ?? 0n).toString(), confirmations },
    constructorArgs: [admin, attestor, relayer, reader],
    roles: roles.roles, adminCount: roles.adminCount, plannedSigners: plan.roles.plannedSigners,
    build: await buildIdentity(hre), dependencies: dependencies(),
    source: { gitCommit: git(['rev-parse', 'HEAD']), gitDirtyTrackedFiles: (git(['status', '--porcelain', '--untracked-files=no']) || '').split('\n').filter(Boolean).length },
    registrations: [], sourceVerification: null,
    recordedAtUtc: new Date().toISOString(),
  };
  const path = writeRecord(recordDir, record);
  return { executed: true, plan, record, path };
}

async function eip712Version(contract) {
  try { return (await contract.eip712Domain()).version; } catch { return null; }
}

function recordPath(recordDir, network, address) {
  return join(recordDir ?? join(CONTRACTS_DIR, 'deployments'), network, `${ethers.getAddress(address)}.json`);
}

/** Records never contain keys: only addresses, hashes, settings and public receipts. */
function writeRecord(recordDir, record) {
  const path = recordPath(recordDir, record.network, record.contract.address);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  writeFileSync(join(resolve(path, '..'), 'latest.json'), JSON.stringify({ address: record.contract.address, record: `${record.contract.address}.json` }, null, 2) + '\n');
  return path;
}

function readRecord(recordDir, network, address) {
  const path = recordPath(recordDir, network, address);
  if (!existsSync(path)) throw new ToolError(`Record deployment tidak ditemukan: ${path}`);
  return { path, record: JSON.parse(readFileSync(path, 'utf8')) };
}

function updateRecord(recordDir, network, address, update) {
  const { path, record } = readRecord(recordDir, network, address);
  update(record);
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  return { path, record };
}

module.exports = { ROLE_ENV, buildIdentity, deploy, preflight, readRecord, recordPath, roleAddresses, updateRecord, writeRecord };
