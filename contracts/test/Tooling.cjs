const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const hre = require('hardhat');
const { ethers, fhevm } = hre;
const roles = require('../scripts/lib/roles.cjs');
const deployment = require('../scripts/lib/deployment.cjs');
const registry = require('../scripts/lib/registry.cjs');

describe('UAS tooling: deployment, registration and role rotation — local mock (not testnet evidence)', function () {
  this.timeout(120000);
  let admin, attestor, relayer, reader, signer, spareA, spareB, recordDir, values;
  const nonceOf = account => ethers.provider.getTransactionCount(account.address);

  beforeEach(async () => {
    assert.equal(fhevm.isMock, true, 'Tooling tests must never execute against a public network');
    [admin, attestor, relayer, reader, signer, spareA, spareB] = await ethers.getSigners();
    recordDir = mkdtempSync(join(tmpdir(), 'verifikasi-records-'));
    values = { ADMIN_ADDRESS: admin.address, ATTESTOR_ADDRESS: attestor.address, RELAYER_ADDRESS: relayer.address,
      RESULT_READER_ADDRESS: reader.address, PLANNED_SIGNER_ADDRESSES: signer.address };
  });
  afterEach(() => rmSync(recordDir, { recursive: true, force: true }));

  async function deployed() {
    const result = await deployment.deploy(hre, { values, expectedChainId: 31337, confirmations: 1, execute: true, recordDir });
    return { ...result, contract: await ethers.getContractAt('VerifikasiIjazah', result.record.contract.address, admin) };
  }

  it('rejects a bad deployment configuration before sending any transaction', async () => {
    const before = await nonceOf(admin);
    assert.throws(() => deployment.roleAddresses({ ...values, RELAYER_ADDRESS: attestor.address }), /empat alamat berbeda/);
    assert.throws(() => deployment.roleAddresses({ ...values, PLANNED_SIGNER_ADDRESSES: relayer.address }), /signer institusi/);
    assert.throws(() => deployment.roleAddresses({ ...values, ADMIN_ADDRESS: ethers.ZeroAddress }), /alamat nol/);
    await assert.rejects(deployment.deploy(hre, { values, expectedChainId: 11155111, execute: true, recordDir }), /tidak sama dengan --expected-chain-id/);
    await assert.rejects(deployment.deploy(hre, { values, execute: true, recordDir }), /expected-chain-id/);
    const dryRun = await deployment.deploy(hre, { values, expectedChainId: 31337, recordDir });
    assert.equal(dryRun.executed, false);
    assert.ok(BigInt(dryRun.plan.estimatedGas) > 0n);
    assert.equal(await nonceOf(admin), before, 'no deployment transaction was sent');
  });

  it('deploys, verifies role holders and writes a non-secret record', async () => {
    const { record, path } = await deployed();
    const stored = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(stored, JSON.parse(JSON.stringify(record)));
    assert.equal(stored.chainId, 31337);
    assert.equal(stored.contract.eip712.version, '2');
    assert.deepEqual(stored.roles, { DEFAULT_ADMIN_ROLE: [admin.address], ATTESTOR_ROLE: [attestor.address],
      RELAYER_ROLE: [relayer.address], RESULT_READER_ROLE: [reader.address] });
    assert.equal(stored.build.viaIR, true); assert.equal(stored.build.evmVersion, 'cancun');
    assert.equal(stored.build.optimizer.runs, 200);
    assert.match(stored.build.sourceSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(stored.dependencies, { hardhat: '2.28.6', '@openzeppelin/contracts': '5.6.1', '@fhevm/solidity': '0.11.1', '@fhevm/hardhat-plugin': '0.4.2', '@zama-fhe/relayer-sdk': '0.4.1', ethers: '6.16.0', solc: '0.8.28' });
    assert.equal(JSON.parse(readFileSync(join(path, '..', 'latest.json'), 'utf8')).address, stored.contract.address);
    assert.doesNotMatch(JSON.stringify(stored), /private|mnemonic|PRIVATE_KEY/i);
  });

  it('registers institution and signer idempotently and refuses a service account as signer', async () => {
    const { contract } = await deployed();
    const issuerId = registry.randomIssuerId();
    const before = await nonceOf(admin);
    const planned = await registry.register(contract, { issuerId, name: 'Universitas Contoh — sintetis', signer: signer.address });
    assert.deepEqual(planned.actions.map(action => action.status), ['planned', 'planned']);
    assert.equal(await nonceOf(admin), before);
    const first = await registry.register(contract, { issuerId, name: 'Universitas Contoh — sintetis', signer: signer.address }, { execute: true });
    assert.deepEqual(first.actions.map(action => action.status), ['executed', 'executed']);
    assert.equal(first.actions[0].event.name, 'IssuerUpdated');
    assert.equal(first.state.signer.active, true);
    const afterFirst = await nonceOf(admin);
    const second = await registry.register(contract, { issuerId, name: 'Universitas Contoh — sintetis', signer: signer.address }, { execute: true });
    assert.deepEqual(second.actions.map(action => action.status), ['skipped', 'skipped']);
    assert.equal(await nonceOf(admin), afterFirst, 're-running sends no duplicate transaction');
    await assert.rejects(registry.registerSigner(contract, { issuerId, signer: relayer.address }, { execute: true }), /tidak boleh menjadi signer/);
    assert.equal(await nonceOf(admin), afterFirst);
  });

  it('shows holders from events, blocks conflicting grants locally and rotates a service role', async () => {
    const { contract, record } = await deployed();
    const shown = await roles.readRoles(contract, { fromBlock: record.deployment.blockNumber });
    assert.deepEqual(shown.roles.RELAYER_ROLE, [relayer.address]);
    assert.equal(shown.adminCount, '1');
    assert.equal(shown.history.filter(entry => entry.event === 'RoleGranted').length, 4);
    const before = await nonceOf(admin);
    await assert.rejects(roles.grant(contract, 'RELAYER_ROLE', attestor.address, { execute: true }), /Ditolak sebelum transaksi/);
    await assert.rejects(roles.revoke(contract, 'DEFAULT_ADMIN_ROLE', admin.address, { execute: true }), /administrator terakhir/);
    await assert.rejects(roles.grant(contract, 'OWNER_ROLE', spareA.address), /Peran tidak dikenal/);
    assert.equal(await nonceOf(admin), before, 'rejected operations send no transaction');
    const granted = await roles.grant(contract, 'RELAYER_ROLE', spareA.address, { execute: true });
    const revoked = await roles.revoke(contract, 'RELAYER_ROLE', relayer.address, { execute: true });
    assert.equal(granted.executed && revoked.executed, true);
    const after = await roles.readRoles(contract, { fromBlock: record.deployment.blockNumber });
    assert.deepEqual(after.roles.RELAYER_ROLE, [spareA.address]);
    assert.equal(after.history.at(-1).event, 'RoleRevoked');
  });

  it('transfers the administrator by granting and verifying before renouncing', async () => {
    const { contract } = await deployed();
    const before = await nonceOf(admin);
    const plan = await roles.transferAdmin(contract, spareB.address);
    assert.equal(plan.executed, false);
    assert.equal(await nonceOf(admin), before);
    await assert.rejects(roles.transferAdmin(contract, relayer.address, { execute: true }), /sudah memegang RELAYER_ROLE/);
    const done = await roles.transferAdmin(contract, spareB.address, { execute: true });
    assert.ok(done.grant.blockNumber < done.renounce.blockNumber);
    assert.equal(await contract.hasRole(ethers.ZeroHash, admin.address), false);
    assert.equal(await contract.hasRole(ethers.ZeroHash, spareB.address), true);
    assert.equal(await contract.adminCount(), 1n);
  });
});
