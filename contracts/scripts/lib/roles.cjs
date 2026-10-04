// Role inspection and rotation for VerifikasiIjazah (audit S-01/S-02). Read-only by default; every write
// requires an explicit execute flag, checks policy before sending, and verifies the resulting state.
const { ethers } = require('ethers');

const ROLE_NAMES = ['DEFAULT_ADMIN_ROLE', 'ATTESTOR_ROLE', 'RELAYER_ROLE', 'RESULT_READER_ROLE'];
const roleId = name => {
  if (!ROLE_NAMES.includes(name)) throw new ToolError(`Peran tidak dikenal: ${name}. Pilihan: ${ROLE_NAMES.join(', ')}`);
  return name === 'DEFAULT_ADMIN_ROLE' ? ethers.ZeroHash : ethers.id(name);
};
const roleName = id => ROLE_NAMES.find(name => (name === 'DEFAULT_ADMIN_ROLE' ? ethers.ZeroHash : ethers.id(name)) === id) || id;

class ToolError extends Error {
  constructor(message) { super(message); this.name = 'ToolError'; }
}

function account(value, label = 'alamat') {
  if (typeof value !== 'string' || !ethers.isAddress(value)) throw new ToolError(`${label} tidak valid.`);
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new ToolError(`${label} tidak boleh alamat nol.`);
  return address;
}

/** Refuse writes unless the RPC chain equals the chain the operator explicitly expects. */
async function assertChain(provider, expectedChainId) {
  const actual = (await provider.getNetwork()).chainId;
  if (expectedChainId == null) throw new ToolError('Operasi tulis memerlukan --expected-chain-id.');
  if (actual !== BigInt(expectedChainId)) throw new ToolError(`Chain ID RPC ${actual} tidak sama dengan --expected-chain-id ${expectedChainId}.`);
  if (actual === 1n) throw new ToolError('Mainnet tidak diizinkan untuk tugas ini.');
  return actual;
}

async function queryChunked(contract, filter, fromBlock, toBlock, chunk = 9_000) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    logs.push(...await contract.queryFilter(filter, start, Math.min(toBlock, start + chunk - 1)));
  }
  return logs;
}

/** AccessControl has no member enumeration: candidates come from RoleGranted events, confirmed with hasRole. */
async function readRoles(contract, { fromBlock = 0, toBlock } = {}) {
  const provider = contract.runner.provider ?? contract.runner;
  const head = toBlock ?? await provider.getBlockNumber();
  const granted = await queryChunked(contract, contract.filters.RoleGranted(), fromBlock, head);
  const revoked = await queryChunked(contract, contract.filters.RoleRevoked(), fromBlock, head);
  const candidates = new Map(ROLE_NAMES.map(name => [name, new Set()]));
  for (const log of granted) candidates.get(roleName(log.args.role))?.add(ethers.getAddress(log.args.account));
  const roles = {};
  for (const name of ROLE_NAMES) {
    roles[name] = [];
    for (const holder of candidates.get(name)) if (await contract.hasRole(roleId(name), holder, { blockTag: head })) roles[name].push(holder);
  }
  const signerLogs = await queryChunked(contract, contract.filters.SignerUpdated(), fromBlock, head);
  const signers = [];
  for (const wallet of new Set(signerLogs.map(log => ethers.getAddress(log.args.signer)))) {
    const state = await contract.getSigner(wallet, { blockTag: head });
    signers.push({ wallet, issuerId: state.issuerId, active: state.active, authorizationId: state.authorizationId.toString() });
  }
  let adminCount = null;
  try { adminCount = (await contract.adminCount({ blockTag: head })).toString(); } catch { /* v1 contract */ }
  return {
    blockNumber: head, roles, signers, adminCount,
    events: { roleGranted: granted.length, roleRevoked: revoked.length, signerUpdated: signerLogs.length },
    history: [...granted.map(log => ({ event: 'RoleGranted', log })), ...revoked.map(log => ({ event: 'RoleRevoked', log }))]
      .sort((a, b) => a.log.blockNumber - b.log.blockNumber || a.log.index - b.log.index)
      .map(({ event, log }) => ({ event, role: roleName(log.args.role), account: log.args.account, sender: log.args.sender,
        blockNumber: log.blockNumber, transactionHash: log.transactionHash })),
  };
}

async function heldRoles(contract, address) {
  const held = [];
  for (const name of ROLE_NAMES) if (await contract.hasRole(roleId(name), address)) held.push(name);
  return held;
}

/** Local policy check mirroring the contract (role exclusivity, no active signer) before any transaction. */
async function grantPlan(contract, name, target) {
  const role = roleId(name); const address = account(target, 'Akun penerima');
  if (await contract.hasRole(role, address)) return { action: 'grant', role: name, account: address, noop: true, reason: 'Akun sudah memegang peran ini.' };
  const others = (await heldRoles(contract, address)).filter(other => other !== name);
  if (others.length) throw new ToolError(`Ditolak sebelum transaksi: ${address} sudah memegang ${others.join(', ')}. Satu akun hanya boleh satu peran.`);
  if ((await contract.getSigner(address)).active) throw new ToolError(`Ditolak sebelum transaksi: ${address} adalah signer institusi aktif.`);
  return { action: 'grant', role: name, account: address, noop: false };
}

async function revokePlan(contract, name, target) {
  const role = roleId(name); const address = account(target, 'Akun');
  if (!await contract.hasRole(role, address)) return { action: 'revoke', role: name, account: address, noop: true, reason: 'Akun tidak memegang peran ini.' };
  if (name === 'DEFAULT_ADMIN_ROLE' && (await contract.adminCount()) <= 1n) {
    throw new ToolError('Ditolak sebelum transaksi: ini administrator terakhir. Gunakan transfer-admin agar admin baru diberikan lebih dulu.');
  }
  return { action: 'revoke', role: name, account: address, noop: false };
}

async function confirm(transaction, confirmations) {
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new ToolError(`Transaksi ${transaction.hash} gagal.`);
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

async function grant(contract, name, target, { execute = false, confirmations = 1 } = {}) {
  const plan = await grantPlan(contract, name, target);
  if (plan.noop || !execute) return { ...plan, executed: false };
  const result = await confirm(await contract.grantRole(roleId(name), plan.account), confirmations);
  if (!await contract.hasRole(roleId(name), plan.account)) throw new ToolError('Grant terkonfirmasi, tetapi hasRole masih false.');
  return { ...plan, executed: true, ...result };
}

async function revoke(contract, name, target, { execute = false, confirmations = 1 } = {}) {
  const plan = await revokePlan(contract, name, target);
  if (plan.noop || !execute) return { ...plan, executed: false };
  const result = await confirm(await contract.revokeRole(roleId(name), plan.account), confirmations);
  if (await contract.hasRole(roleId(name), plan.account)) throw new ToolError('Revoke terkonfirmasi, tetapi hasRole masih true.');
  return { ...plan, executed: true, ...result };
}

/** Grant to the new administrator, verify, and only then renounce the caller's own admin role. */
async function transferAdmin(contract, newAdmin, { execute = false, confirmations = 1 } = {}) {
  const current = account(await contract.runner.getAddress(), 'Admin pemanggil');
  if (!await contract.hasRole(ethers.ZeroHash, current)) throw new ToolError(`${current} bukan administrator.`);
  const target = account(newAdmin, 'Admin baru');
  if (target === current) throw new ToolError('Admin baru sama dengan admin saat ini.');
  const plan = await grantPlan(contract, 'DEFAULT_ADMIN_ROLE', target);
  const steps = { action: 'transfer-admin', from: current, to: target, steps: ['grantRole(DEFAULT_ADMIN_ROLE, to)', 'verify hasRole(to)', 'renounceRole(DEFAULT_ADMIN_ROLE, from)', 'verify'] };
  if (!execute) return { ...steps, executed: false };
  const granted = plan.noop ? null : await confirm(await contract.grantRole(ethers.ZeroHash, target), confirmations);
  if (!await contract.hasRole(ethers.ZeroHash, target)) throw new ToolError('Admin baru belum terverifikasi; admin lama tidak dilepas.');
  const renounced = await confirm(await contract.renounceRole(ethers.ZeroHash, current), confirmations);
  if (await contract.hasRole(ethers.ZeroHash, current) || !await contract.hasRole(ethers.ZeroHash, target)) throw new ToolError('Status admin setelah transfer tidak sesuai.');
  return { ...steps, executed: true, grant: granted, renounce: renounced };
}

module.exports = { ROLE_NAMES, ToolError, account, assertChain, grant, grantPlan, heldRoles, readRoles, revoke, revokePlan, roleId, roleName, transferAdmin };
