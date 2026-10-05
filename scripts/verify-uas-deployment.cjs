const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {parseEnv} = require('node:util');
const {Contract, JsonRpcProvider, FetchRequest, ZeroAddress, ZeroHash, id} = require('../contracts/node_modules/ethers');

async function main() {
  const root = path.resolve(__dirname, '..');
  const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  const latest = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deployments/sepolia/latest.json')));
  const record = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deployments/sepolia', latest.record)));
  if (record.contract.address !== env.CREDENTIAL_CONTRACT_ADDRESS) throw new Error('ACTIVE_CONTRACT_MISMATCH');
  const request = new FetchRequest(env.RPC_URL); request.timeout = 20_000;
  const provider = new JsonRpcProvider(request, undefined, {batchMaxCount: 1});
  try {
    if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('SEPOLIA_REQUIRED');
    const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/generated/VerifikasiIjazah.json')));
    const contract = new Contract(record.contract.address, artifact.abi || artifact, provider);
    const info = JSON.parse(fs.readFileSync(path.join(root, 'contracts/artifacts/build-info', record.build.buildInfoId + '.json')));
    const compiled = info.output.contracts['src/VerifikasiIjazah.sol'].VerifikasiIjazah.evm.deployedBytecode;
    const mask = value => {
      let result = value.replace(/^0x/, '');
      for (const ranges of Object.values(compiled.immutableReferences)) for (const range of ranges) {
        const offset = range.start * 2; const length = range.length * 2;
        result = result.slice(0, offset) + '0'.repeat(length) + result.slice(offset + length);
      }
      return result;
    };
    const bytecodeMatches = mask(await provider.getCode(record.contract.address)) === mask(compiled.object);
    if (!bytecodeMatches) throw new Error('DEPLOYED_BYTECODE_MISMATCH');
    const sourceHash = createHash('sha256').update(fs.readFileSync(path.join(root, 'contracts/src/VerifikasiIjazah.sol'))).digest('hex');
    if (sourceHash !== record.build.sourceSha256) throw new Error('DEPLOYED_SOURCE_MISMATCH');
    const checks = [];
    const expectRevert = async (name, invoke, expected) => {
      try { await invoke(); throw new Error('EXPECTED_REVERT_MISSING'); }
      catch (error) {
        const data = error.data || error.info?.error?.data;
        const decoded = typeof data === 'string' ? contract.interface.parseError(data)?.name : error.revert?.name;
        if (decoded !== expected) throw new Error('DEPLOYMENT_REVERT_CHECK_FAILED');
        checks.push({name, expected, actual: decoded, passed: true});
      }
    };
    for (const [name, role] of [['admin', ZeroHash], ['attestor', id('ATTESTOR_ROLE')],
      ['relayer', id('RELAYER_ROLE')], ['result_reader', id('RESULT_READER_ROLE')]]) {
      await expectRevert(`zero-${name}`, () => contract.grantRole.staticCall(role, ZeroAddress, {from: env.ADMIN_ADDRESS}), 'InvalidAddress');
    }
    await expectRevert('last-admin-revoke', () => contract.revokeRole.staticCall(ZeroHash, env.ADMIN_ADDRESS,
      {from: env.ADMIN_ADDRESS}), 'LastAdminRemoval');
    await expectRevert('last-admin-renounce', () => contract.renounceRole.staticCall(ZeroHash, env.ADMIN_ADDRESS,
      {from: env.ADMIN_ADDRESS}), 'LastAdminRemoval');
    const domain = await contract.eip712Domain();
    if (domain.name !== 'VerifikasiIjazah' || domain.version !== '2' || domain.chainId !== 11155111n ||
      domain.verifyingContract.toLowerCase() !== record.contract.address.toLowerCase()) throw new Error('EIP712_DOMAIN_MISMATCH');
    const evidence = {checkedAtUtc: new Date().toISOString(), chainId: 11155111, address: record.contract.address,
      deploymentBlock: record.deployment.blockNumber, checkedBlock: await provider.getBlockNumber(), sourceSha256: sourceHash,
      bytecodeMatches, immutableRangesMaskedOnly: true, signingDomainVersion: domain.version,
      adminCount: String(await contract.adminCount()), checks, method: 'read-only eth_call; no transaction broadcast'};
    const out = path.join(root, 'docs/uas/evidence/pemenuhan-komponen/2026-10-05/deployment-validation.json');
    fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({address: evidence.address, bytecodeMatches, readOnlyChecksPassed: checks.length, adminCount: evidence.adminCount}));
  } finally { provider.destroy(); }
}
main().catch(error => {
  const category = /^[A-Z0-9_]+$/.test(error.message) ? error.message : error.code || error.name;
  console.error(JSON.stringify({stage: 'deployment-validation', category})); process.exitCode = 1;
});
