// Hardhat tasks for UAS operations. Every task is read-only or a dry-run unless --execute is passed.
// Usage examples are in docs/uas/DEPLOYMENT_RECORD.md.
const { task, types } = require('hardhat/config');
const roles = require('./lib/roles.cjs');
const deployment = require('./lib/deployment.cjs');
const registry = require('./lib/registry.cjs');
const { verifyOnSourcify } = require('./lib/sourcify.cjs');

/** Printed output must never contain secrets; an RPC URL may embed an API key. */
function sanitize(text) {
  let value = String(text);
  for (const name of ['RPC_URL', 'DEPLOYER_PRIVATE_KEY', 'RELAYER_PRIVATE_KEY', 'ATTESTOR_PRIVATE_KEY', 'RESULT_READER_PRIVATE_KEY', 'ETHERSCAN_API_KEY']) {
    const secret = process.env[name]?.trim();
    if (secret && secret.length > 8) value = value.split(secret).join(`<${name}>`);
  }
  return value;
}
const print = value => console.log(sanitize(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item), 2)));

function run(action) {
  return async (args, hre) => {
    try { print(await action(args, hre)); }
    catch (error) {
      console.error(sanitize(`${error.name || 'Error'}: ${error.shortMessage || error.message}`));
      process.exitCode = 1;
    }
  };
}

async function contractAt(hre, address) {
  const target = roles.account(address || process.env.CREDENTIAL_CONTRACT_ADDRESS, 'Alamat kontrak (--address atau CREDENTIAL_CONTRACT_ADDRESS)');
  if (await hre.ethers.provider.getCode(target) === '0x') throw new roles.ToolError(`Tidak ada kontrak di ${target}.`);
  const [signer] = await hre.ethers.getSigners();
  return hre.ethers.getContractAt('VerifikasiIjazah', target, signer);
}

task('uas:roles', 'Tampilkan atau ubah pemegang peran (dry-run kecuali --execute)')
  .addOptionalParam('address', 'Alamat kontrak (default CREDENTIAL_CONTRACT_ADDRESS)')
  .addOptionalParam('action', 'show | grant | revoke | transfer-admin', 'show')
  .addOptionalParam('role', 'DEFAULT_ADMIN_ROLE | ATTESTOR_ROLE | RELAYER_ROLE | RESULT_READER_ROLE')
  .addOptionalParam('account', 'Akun yang diberi atau dicabut perannya')
  .addOptionalParam('to', 'Admin baru untuk transfer-admin')
  .addOptionalParam('fromBlock', 'Blok awal pencarian event (default CONTRACT_DEPLOYMENT_BLOCK)', undefined, types.int)
  .addOptionalParam('expectedChainId', 'Wajib untuk operasi tulis', undefined, types.int)
  .addOptionalParam('confirmations', 'Konfirmasi receipt', 2, types.int)
  .addFlag('execute', 'Kirim transaksi (tanpa flag hanya rencana)')
  .setAction(run(async (args, hre) => {
    const contract = await contractAt(hre, args.address);
    const network = { name: hre.network.name, chainId: (await hre.ethers.provider.getNetwork()).chainId.toString() };
    if (args.action === 'show') {
      const fromBlock = args.fromBlock ?? Number(process.env.CONTRACT_DEPLOYMENT_BLOCK || 0);
      return { network, contract: await contract.getAddress(), ...await roles.readRoles(contract, { fromBlock }) };
    }
    if (args.execute) await roles.assertChain(hre.ethers.provider, args.expectedChainId);
    const options = { execute: args.execute, confirmations: args.confirmations };
    const caller = await contract.runner.getAddress();
    if (args.action === 'grant') return { network, caller, ...await roles.grant(contract, args.role, args.account, options) };
    if (args.action === 'revoke') return { network, caller, ...await roles.revoke(contract, args.role, args.account, options) };
    if (args.action === 'transfer-admin') return { network, caller, ...await roles.transferAdmin(contract, args.to, options) };
    throw new roles.ToolError(`Aksi tidak dikenal: ${args.action}`);
  }));

task('uas:deploy', 'Deploy VerifikasiIjazah dengan pemeriksaan peran dan record (dry-run kecuali --execute)')
  .addParam('expectedChainId', 'Chain ID yang diharapkan', undefined, types.int)
  .addOptionalParam('confirmations', 'Konfirmasi deployment', 2, types.int)
  .addOptionalParam('recordDir', 'Folder record (default contracts/deployments)')
  .addFlag('execute', 'Kirim transaksi deployment')
  .setAction(run(async (args, hre) => {
    const result = await deployment.deploy(hre, { values: process.env, expectedChainId: args.expectedChainId,
      confirmations: args.confirmations, execute: args.execute, recordDir: args.recordDir });
    return result.executed ? { executed: true, recordPath: result.path, record: result.record } : result;
  }));

task('uas:register', 'Daftarkan institusi dan signer secara idempoten (dry-run kecuali --execute)')
  .addOptionalParam('address', 'Alamat kontrak (default CREDENTIAL_CONTRACT_ADDRESS)')
  .addParam('issuerId', 'bytes32 ID institusi')
  .addParam('name', 'Nama institusi (maks. 200 byte UTF-8)')
  .addOptionalParam('signer', 'Wallet signer institusi')
  .addOptionalParam('expectedChainId', 'Wajib untuk --execute', undefined, types.int)
  .addOptionalParam('confirmations', 'Konfirmasi receipt', 2, types.int)
  .addOptionalParam('recordDir', 'Folder record (default contracts/deployments)')
  .addFlag('execute', 'Kirim transaksi')
  .setAction(run(async (args, hre) => {
    const contract = await contractAt(hre, args.address);
    if (args.execute) await roles.assertChain(hre.ethers.provider, args.expectedChainId);
    const result = await registry.register(contract, { issuerId: args.issuerId, name: args.name, signer: args.signer },
      { execute: args.execute, confirmations: args.confirmations });
    const executed = result.actions.filter(action => action.status === 'executed');
    if (executed.length) {
      const { path } = deployment.updateRecord(args.recordDir, hre.network.name, await contract.getAddress(), record => {
        record.registrations.push(...executed.map(action => ({ ...action, recordedAtUtc: new Date().toISOString() })));
      });
      result.recordPath = path;
    }
    return result;
  }));

task('uas:verify-source', 'Verifikasi source di Sourcify (API v2) dan, bila ETHERSCAN_API_KEY ada, di Etherscan')
  .addOptionalParam('address', 'Alamat kontrak (default CREDENTIAL_CONTRACT_ADDRESS)')
  .addOptionalParam('recordDir', 'Folder record (default contracts/deployments)')
  .setAction(run(async (args, hre) => {
    const address = roles.account(args.address || process.env.CREDENTIAL_CONTRACT_ADDRESS, 'Alamat kontrak');
    const { record } = deployment.readRecord(args.recordDir, hre.network.name, address);
    const attempts = [];
    try {
      attempts.push(await verifyOnSourcify(hre, { address, chainId: record.chainId, creationTransactionHash: record.deployment.transactionHash }));
    } catch (error) {
      attempts.push({ provider: 'sourcify-v2', status: `failed: ${sanitize(error.message).slice(0, 300)}` });
    }
    if (process.env.ETHERSCAN_API_KEY) {
      try { await hre.run('verify:verify', { address, constructorArguments: record.constructorArgs }); attempts.push({ provider: 'etherscan', status: 'submitted-or-verified' }); }
      catch (error) { attempts.push({ provider: 'etherscan', status: `failed: ${sanitize(error.shortMessage || error.message).slice(0, 300)}` }); }
    }
    const checkedAtUtc = new Date().toISOString();
    const { path } = deployment.updateRecord(args.recordDir, hre.network.name, address, entry => {
      // Keep earlier attempts (including failures) for traceability.
      const previous = Array.isArray(entry.sourceVerification?.attempts) ? entry.sourceVerification.attempts
        : entry.sourceVerification ? [entry.sourceVerification] : [];
      entry.sourceVerification = { attempts: [...previous, ...attempts.map(attempt => ({ ...attempt, checkedAtUtc }))] };
    });
    return { address, attempts, recordPath: path };
  }));

module.exports = { sanitize };
