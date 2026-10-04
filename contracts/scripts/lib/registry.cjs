// Idempotent institution and signer registration. Re-running reads state first and skips work that is
// already done, so no duplicate transaction is sent silently.
const { ethers } = require('ethers');
const { ToolError, account, heldRoles } = require('./roles.cjs');

function issuerIdOf(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0{64}$/i.test(value)) throw new ToolError('issuerId harus bytes32 bukan nol.');
  return value.toLowerCase();
}

async function send(transaction, confirmations, eventName, contract) {
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new ToolError(`Transaksi ${transaction.hash} gagal.`);
  const event = receipt.logs.map(log => { try { return contract.interface.parseLog(log); } catch { return null; } }).find(parsed => parsed?.name === eventName);
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
    event: event ? { name: event.name, args: event.args.map(value => (typeof value === 'bigint' ? value.toString() : value)) } : null };
}

/** setIssuer(issuerId, name, active) only when the registry differs from the requested state. */
async function registerIssuer(contract, { issuerId, name, active = true }, { execute = false, confirmations = 1 } = {}) {
  const id = issuerIdOf(issuerId);
  if (typeof name !== 'string' || !name.trim()) throw new ToolError('Nama institusi wajib diisi.');
  if (Buffer.byteLength(name, 'utf8') > 200) throw new ToolError('Nama institusi melebihi 200 byte UTF-8.');
  const current = await contract.issuers(id);
  const base = { action: 'setIssuer', issuerId: id, name, active };
  if (current.exists && current.name === name && current.active === active) return { ...base, status: 'skipped', reason: 'Registry sudah sesuai.' };
  if (current.exists && current.name !== name) base.previousName = current.name;
  if (!execute) return { ...base, status: 'planned' };
  return { ...base, status: 'executed', ...await send(await contract.setIssuer(id, name, active), confirmations, 'IssuerUpdated', contract) };
}

/** setSigner(issuerId, wallet, true) only when the wallet is not already the active signer of this institution. */
async function registerSigner(contract, { issuerId, signer }, { execute = false, confirmations = 1 } = {}) {
  const id = issuerIdOf(issuerId); const wallet = account(signer, 'Signer');
  const base = { action: 'setSigner', issuerId: id, signer: wallet, active: true };
  if (!(await contract.issuers(id)).exists) {
    if (!execute) return { ...base, status: 'planned', reason: 'Menunggu registrasi institusi pada langkah sebelumnya.' };
    throw new ToolError('Institusi belum terdaftar.');
  }
  const state = await contract.getSigner(wallet);
  if (state.active && state.issuerId.toLowerCase() === id) return { ...base, status: 'skipped', reason: 'Signer sudah aktif untuk institusi ini.' };
  if (state.active) throw new ToolError(`Ditolak sebelum transaksi: ${wallet} masih signer aktif institusi ${state.issuerId}.`);
  const roles = await heldRoles(contract, wallet);
  if (roles.length) throw new ToolError(`Ditolak sebelum transaksi: ${wallet} memegang ${roles.join(', ')} dan tidak boleh menjadi signer.`);
  if (!execute) return { ...base, status: 'planned' };
  return { ...base, status: 'executed', ...await send(await contract.setSigner(id, wallet, true), confirmations, 'SignerUpdated', contract) };
}

async function register(contract, { issuerId, name, signer }, options = {}) {
  const issuer = await registerIssuer(contract, { issuerId, name, active: true }, options);
  const signerResult = signer ? await registerSigner(contract, { issuerId, signer }, options) : null;
  const state = await contract.issuers(issuerIdOf(issuerId));
  const signerState = signer ? await contract.getSigner(account(signer)) : null;
  return {
    actions: [issuer, signerResult].filter(Boolean),
    state: { issuer: { exists: state.exists, name: state.name, active: state.active },
      signer: signerState && { wallet: account(signer), issuerId: signerState.issuerId, active: signerState.active, authorizationId: signerState.authorizationId.toString() } },
  };
}

module.exports = { issuerIdOf, register, registerIssuer, registerSigner, randomIssuerId: () => ethers.hexlify(ethers.randomBytes(32)) };
