const assert = require('node:assert/strict');
const { ethers, fhevm } = require('hardhat');
const { FhevmType } = require('@fhevm/hardhat-plugin');

const types = { Verification: [
  ['requestId', 'bytes32'], ['credentialId', 'bytes32'], ['uploadCommitment', 'bytes32'],
  ['schemaVersion', 'string'], ['encodingVersion', 'string'], ['normalizerVersion', 'string'],
  ['ocrConfigHash', 'bytes32'], ['inputHandlesHash', 'bytes32'], ['relayer', 'address'],
  ['resultReader', 'address'], ['nonce', 'uint256'], ['deadline', 'uint256'],
].map(([name, type]) => ({ name, type })) };
const credentialTypes = { CredentialAuthorization: [
  ['credentialId', 'bytes32'], ['issuerId', 'bytes32'], ['signer', 'address'], ['publicDataHash', 'bytes32'],
  ['encryptedAttributesHash', 'bytes32'], ['schemaVersion', 'uint32'], ['encodingVersion', 'uint32'],
  ['disclosurePolicyVersion', 'uint32'], ['nonce', 'uint256'], ['issuanceDeadline', 'uint256'],
].map(([name, type]) => ({ name, type })) };

describe('VerifikasiIjazah — local FHEVM mock (not testnet evidence)', function () {
  this.timeout(120000);
  let admin, issuer, attestor, relayer, reader, outsider, contract, address, id, issuerId;
  const values = [(1n << 255n) + 91n, (1n << 200n) + 42n, (1n << 128n) + 7n, (1n << 64n) + 33n];
  const random = () => ethers.hexlify(ethers.randomBytes(32));
  async function encrypt(signer, inputs = values) {
    const builder = fhevm.createEncryptedInput(address, signer.address);
    inputs.forEach(value => builder.add256(value));
    return builder.encrypt();
  }
  const domain = () => ({ name: 'VerifikasiIjazah', version: '1', chainId: 31337, verifyingContract: address });
  async function authorization(overrides = {}, signer = issuer) {
    const encrypted = await encrypt(signer);
    const block = await ethers.provider.getBlock('latest');
    const payload = { credentialId: id, issuerId, signer: signer.address, publicDataHash: random(),
      encryptedAttributesHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint32', 'bytes32[4]'], [1, encrypted.handles])),
      schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce: BigInt(random()), issuanceDeadline: block.timestamp + 600,
      ...overrides };
    return { payload, encrypted, signature: await signer.signTypedData(domain(), credentialTypes, payload) };
  }
  async function sendIssuance(req, caller = issuer) {
    return contract.connect(caller).issueCredential(req.payload, req.signature, req.encrypted.handles, req.encrypted.inputProof);
  }
  async function issue() {
    const req = await authorization();
    await (await sendIssuance(req)).wait();
    return req;
  }
  async function request(inputs = values, overrides = {}, signer) {
    const encrypted = await encrypt(relayer, inputs);
    const block = await ethers.provider.getBlock('latest');
    const attestation = {
      requestId: random(), credentialId: id, uploadCommitment: random(), schemaVersion: 'academic-diploma-v1',
      encodingVersion: 'sha256-euint256-v1', normalizerVersion: 'academic-normalizer-v1', ocrConfigHash: random(),
      inputHandlesHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[4]'], [encrypted.handles])),
      relayer: relayer.address, resultReader: reader.address, nonce: BigInt(random()), deadline: block.timestamp + 600,
      ...overrides,
    };
    const signature = await (signer || attestor).signTypedData(
      { name: 'VerifikasiIjazah', version: '1', chainId: 31337, verifyingContract: address }, types, attestation);
    return { attestation, encrypted, signature };
  }
  async function send(req, caller = relayer) {
    return contract.connect(caller).verify(req.attestation, req.encrypted.handles, req.encrypted.inputProof, req.signature);
  }
  beforeEach(async () => {
    assert.equal(fhevm.isMock, true, 'This suite must never execute against a public network');
    [admin, issuer, attestor, relayer, reader, outsider] = await ethers.getSigners();
    contract = await ethers.deployContract('VerifikasiIjazah', [admin.address, attestor.address, relayer.address, reader.address]);
    await contract.waitForDeployment();
    address = await contract.getAddress(); id = random(); issuerId = random();
    await (await contract.setIssuer(issuerId, 'Universitas Contoh — sintetis', true)).wait();
    await (await contract.setSigner(issuerId, issuer.address, true)).wait();
  });
  it('rejects unauthorized registry updates, issuance and revocation', async () => {
    await assert.rejects(contract.connect(outsider).setIssuer(issuerId, 'Fake', true));
    await assert.rejects(contract.connect(outsider).setSigner(issuerId, outsider.address, true));
    await assert.rejects(sendIssuance(await authorization({}, outsider), outsider), /UnauthorizedIssuer/);
    await issue();
    await assert.rejects(contract.connect(outsider).revoke(id), /UnauthorizedIssuer/);
    await assert.rejects(sendIssuance(await authorization()), /CredentialAlreadyExists/);
  });
  it('compares all 256 digest bits and decrypts only for the result reader', async () => {
    await issue();
    const req = await request();
    await (await send(req)).wait();
    const result = await contract.getComparison(req.attestation.requestId);
    for (const handle of [...result.fields, result.allMatch]) {
      assert.equal(await fhevm.userDecryptEbool(handle, address, reader), true);
      await assert.rejects(fhevm.userDecryptEbool(handle, address, outsider));
      await assert.rejects(fhevm.userDecryptEbool(handle, address, relayer));
    }
  });
  it('S-05: grants no account a decrypt permission on reference values, including the issuing signer', async () => {
    await issue();
    const credential = await contract.getCredential(id);
    for (const attribute of credential.attributes) {
      for (const denied of [issuer, reader, relayer, admin, attestor, outsider]) {
        await assert.rejects(fhevm.userDecryptEuint(FhevmType.euint256, attribute, address, denied));
      }
    }
    // The contract keeps its own permission: comparisons against the references still work.
    const req = await request();
    await (await send(req)).wait();
    const result = await contract.getComparison(req.attestation.requestId);
    assert.equal(await fhevm.userDecryptEbool(result.allMatch, address, reader), true);
  });
  it('detects a change in each field, including high digest bits', async () => {
    await issue();
    for (let changed = 0; changed < 4; changed++) {
      const altered = [...values]; altered[changed] ^= 1n << 255n;
      const req = await request(altered);
      await (await send(req)).wait();
      const result = await contract.getComparison(req.attestation.requestId);
      for (let index = 0; index < 4; index++) {
        assert.equal(await fhevm.userDecryptEbool(result.fields[index], address, reader), index !== changed);
      }
      assert.equal(await fhevm.userDecryptEbool(result.allMatch, address, reader), false);
    }
  });
  it('rejects replay of request IDs and attestor nonces', async () => {
    await issue(); const req = await request(); await (await send(req)).wait();
    await assert.rejects(send(req), /ReplayedRequest/);
    const second = await request(values, { nonce: req.attestation.nonce });
    await assert.rejects(send(second), /ReplayedNonce/);
  });
  it('rejects incorrect signer, domain, relayer, deadline and altered input bindings', async () => {
    await issue();
    await assert.rejects(send(await request(values, {}, outsider)), /InvalidAttestation/);
    await assert.rejects(send(await request(values, { relayer: outsider.address })), /InvalidAttestation/);
    await assert.rejects(send(await request(values, { deadline: 1 })), /ExpiredAttestation/);
    await assert.rejects(send(await request(values, { inputHandlesHash: random() })), /InvalidAttestation/);
    const wrongDomain = await request();
    wrongDomain.signature = await attestor.signTypedData({ name: 'VerifikasiIjazah', version: '1', chainId: 1,
      verifyingContract: address }, types, wrongDomain.attestation);
    await assert.rejects(send(wrongDomain), /InvalidAttestation/);
    const wrongProof = await request(); wrongProof.encrypted.inputProof = '0xdeadbeef';
    await assert.rejects(send(wrongProof));
    const altered = await request(); altered.attestation.uploadCommitment = random();
    await assert.rejects(send(altered), /InvalidAttestation/);
  });
  it('disables comparisons for revoked credentials and inactive issuers', async () => {
    await issue();
    await (await contract.setIssuer(issuerId, 'Universitas Contoh', false)).wait();
    await assert.rejects(send(await request()), /CredentialInactive/);
    await (await contract.connect(issuer).revoke(id)).wait();
    await (await contract.setIssuer(issuerId, 'Universitas Contoh', true)).wait();
    await assert.rejects(send(await request()), /CredentialInactive/);
    await assert.rejects(contract.connect(issuer).revoke(id), /CredentialInactive/);
  });

  it('requires a credential payload signature even when the transaction is signed by the authorized wallet', async () => {
    assert.equal(contract.interface.getFunction('issue'), null, 'There must be no legacy issuance bypass');
    const req = await authorization();
    for (const signature of ['0x', '0xdeadbeef', await outsider.signTypedData(domain(), credentialTypes, req.payload)]) {
      await assert.rejects(sendIssuance({ ...req, signature }));
    }
    assert.equal(await contract.issuanceNonceUsed(issuer.address, req.payload.nonce), false);
    await (await sendIssuance(req)).wait();
    const record = await contract.getCredential(id);
    assert.equal(record.credentialDigest, ethers.TypedDataEncoder.hash(domain(), credentialTypes, req.payload));
    assert.equal(record.credentialDigest, await contract.hashCredentialAuthorization(req.payload));
    assert.equal(record.publicDataHash, req.payload.publicDataHash);
    assert.equal(record.encryptedAttributesHash, req.payload.encryptedAttributesHash);
    assert.equal(record.signer, issuer.address);
    assert.equal(record.issuerId, issuerId);
    assert.equal(record.issuerNameHash, ethers.keccak256(ethers.toUtf8Bytes('Universitas Contoh — sintetis')));
    assert.ok(record.issuedBlock > 0n);
  });

  it('rejects payload tampering, cross-domain signatures and ordered ciphertext substitutions', async () => {
    const req = await authorization();
    for (const changed of [{ publicDataHash: random() }, { credentialId: random() }, { nonce: 1n }, { issuanceDeadline: req.payload.issuanceDeadline + 1 }]) {
      await assert.rejects(sendIssuance({ ...req, payload: { ...req.payload, ...changed } }), /InvalidCredentialAuthorization/);
    }
    for (const changed of [{ chainId: 1 }, { verifyingContract: outsider.address }, { version: '2' }, { name: 'OtherApp' }]) {
      const signature = await issuer.signTypedData({ ...domain(), ...changed }, credentialTypes, req.payload);
      await assert.rejects(sendIssuance({ ...req, signature }), /InvalidCredentialAuthorization/);
    }
    await assert.rejects(sendIssuance({ ...req, encrypted: { ...req.encrypted, handles: [...req.encrypted.handles].reverse() } }), /InvalidCredentialAuthorization/);
    await assert.rejects(sendIssuance({ ...req, payload: { ...req.payload, issuerId: random() } }), /UnauthorizedIssuer/);
    await assert.rejects(sendIssuance({ ...req, payload: { ...req.payload, signer: outsider.address } }), /InvalidCredentialAuthorization/);
    await contract.setSigner(issuerId, outsider.address, true);
    await assert.rejects(sendIssuance(req, outsider), /InvalidCredentialAuthorization/);
    await assert.rejects(sendIssuance(await authorization({ encodingVersion: 2 })), /InvalidVersion/);
    await assert.rejects(sendIssuance(await authorization({ disclosurePolicyVersion: 2 })), /InvalidVersion/);
  });

  it('rejects issuance replay and expiration without expiring already issued records', async () => {
    const req = await issue();
    await assert.rejects(sendIssuance(req), /CredentialAlreadyExists/);
    await assert.rejects(sendIssuance(await authorization({ credentialId: random(), nonce: req.payload.nonce })), /ReplayedNonce/);
    await assert.rejects(sendIssuance(await authorization({ credentialId: random(), issuanceDeadline: 1 })), /ExpiredCredentialAuthorization/);
    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(req.payload.issuanceDeadline) + 100]);
    await ethers.provider.send('evm_mine', []);
    const record = await contract.getCredential(id);
    assert.equal(record.revokedAt, 0n);
    assert.equal(record.credentialDigest, ethers.TypedDataEncoder.hash(domain(), credentialTypes, req.payload));
    await (await send(await request())).wait();
  });

  it('S-09: maps malformed and malleable signatures to the contract domain errors', async () => {
    const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const malleable = (signature) => {
      const parsed = ethers.Signature.from(signature);
      const s = ethers.toBeHex(SECP256K1_N - BigInt(parsed.s), 32);
      return ethers.concat([parsed.r, s, parsed.v === 27 ? '0x1c' : '0x1b']);
    };
    const req = await authorization();
    for (const signature of ['0x', '0xdeadbeef', ethers.hexlify(new Uint8Array(65)), malleable(req.signature)]) {
      await assert.rejects(sendIssuance({ ...req, signature }), /InvalidCredentialAuthorization/);
    }
    await (await sendIssuance(req)).wait();
    const attestation = await request();
    for (const signature of ['0x', '0xdeadbeef', ethers.hexlify(new Uint8Array(65)), malleable(attestation.signature)]) {
      await assert.rejects(send({ ...attestation, signature }), /InvalidAttestation/);
    }
    await (await send(attestation)).wait();
  });

  it('S-10: validates registry input by byte length with specific errors', async () => {
    await assert.rejects(contract.setIssuer(ethers.ZeroHash, 'Kampus', true), /InvalidIssuer/);
    await assert.rejects(contract.setIssuer(random(), '', true), /InvalidIssuer/);
    await (await contract.setIssuer(random(), 'a'.repeat(200), true)).wait();
    await assert.rejects(contract.setIssuer(random(), 'a'.repeat(201), true), /InvalidIssuer/);
    // Two-byte UTF-8: 100 characters fit (200 bytes), 101 characters exceed the byte limit.
    await (await contract.setIssuer(random(), 'é'.repeat(100), true)).wait();
    await assert.rejects(contract.setIssuer(random(), 'é'.repeat(101), true), /InvalidIssuer/);
    // Four-byte UTF-8: 50 characters fit, 51 do not, although both are far below 200 characters.
    await (await contract.setIssuer(random(), '🎓'.repeat(50), true)).wait();
    await assert.rejects(contract.setIssuer(random(), '🎓'.repeat(51), true), /InvalidIssuer/);
    await assert.rejects(contract.setSigner(random(), outsider.address, true), /InvalidIssuer/);
    await assert.rejects(contract.setSigner(issuerId, ethers.ZeroAddress, true), /InvalidAddress/);
  });

  it('S-10: rejects signer updates that would not change state instead of succeeding silently', async () => {
    await assert.rejects(contract.setSigner(issuerId, issuer.address, true), /SignerAlreadyActive/);
    await assert.rejects(contract.setSigner(issuerId, outsider.address, false), /SignerNotActive/);
    await (await contract.setSigner(issuerId, issuer.address, false)).wait();
    await assert.rejects(contract.setSigner(issuerId, issuer.address, false), /SignerNotActive/);
    const otherIssuer = random();
    await (await contract.setIssuer(otherIssuer, 'Kampus lain', true)).wait();
    await (await contract.setSigner(otherIssuer, outsider.address, true)).wait();
    // An active signer of another institution is neither re-assigned nor deactivated through this issuer.
    await assert.rejects(contract.setSigner(issuerId, outsider.address, false), /UnauthorizedIssuer/);
    await assert.rejects(contract.setSigner(issuerId, outsider.address, true), /UnauthorizedIssuer/);
  });

  it('rolls back both nonce and record when FHE input proof fails', async () => {
    const req = await authorization();
    await assert.rejects(sendIssuance({ ...req, encrypted: { ...req.encrypted, inputProof: '0xdeadbeef' } }));
    assert.equal(await contract.issuanceNonceUsed(issuer.address, req.payload.nonce), false);
    assert.equal((await contract.getCredential(id)).signer, ethers.ZeroAddress);
    await (await sendIssuance(req)).wait();
  });

  it('retains historical signer evidence after rotation and permits the replacement to revoke', async () => {
    await issue();
    const before = await contract.getCredential(id);
    await (await contract.setSigner(issuerId, issuer.address, false)).wait();
    await (await contract.setSigner(issuerId, outsider.address, true)).wait();
    const historical = await contract.signerAuthorizations(before.signerAuthorizationId);
    assert.equal(historical.signer, issuer.address);
    assert.equal(historical.issuerId, issuerId);
    assert.ok(historical.authorizedAt <= before.issuedAt && historical.revokedAt >= before.issuedAt);
    assert.equal((await contract.getCredential(id)).credentialDigest, before.credentialDigest);
    assert.equal((await contract.getSigner(issuer.address)).active, false);
    await assert.rejects(sendIssuance(await authorization({ credentialId: random() })), /UnauthorizedIssuer/);
    await assert.rejects(contract.connect(issuer).revoke(id), /UnauthorizedIssuer/);
    await (await send(await request())).wait();
    const listed = await contract.getIssuerCredentials(issuerId, 0, 100);
    assert.deepEqual([...listed.ids], [id]);
    await (await contract.setIssuer(issuerId, 'Nama kampus baru', false)).wait();
    assert.equal((await contract.getCredential(id)).issuerNameHash, before.issuerNameHash);
    await (await contract.connect(outsider).revoke(id)).wait();
    assert.ok((await contract.getCredential(id)).revokedBlock > 0n);
  });

  it('retains every authorization period and rejects cross-institution signer reassignment while active', async () => {
    const otherIssuer = random();
    await contract.setIssuer(otherIssuer, 'Kampus lain', true);
    await assert.rejects(contract.setSigner(otherIssuer, issuer.address, true), /UnauthorizedIssuer/);
    const first = await contract.getSigner(issuer.address);
    await contract.setSigner(issuerId, issuer.address, false);
    await contract.setSigner(issuerId, issuer.address, true);
    const second = await contract.getSigner(issuer.address);
    assert.notEqual(first.authorizationId, second.authorizationId);
    assert.ok((await contract.signerAuthorizations(first.authorizationId)).revokedAt > 0n);
    assert.equal((await contract.signerAuthorizations(second.authorizationId)).revokedAt, 0n);
  });
});
