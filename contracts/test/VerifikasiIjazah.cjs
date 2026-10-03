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
  let admin, issuer, attestor, relayer, reader, outsider, spares, contract, address, id, issuerId, nonce0;
  const values = [(1n << 255n) + 91n, (1n << 200n) + 42n, (1n << 128n) + 7n, (1n << 64n) + 33n];
  const random = () => ethers.hexlify(ethers.randomBytes(32));
  async function encrypt(signer, inputs = values) {
    const builder = fhevm.createEncryptedInput(address, signer.address);
    inputs.forEach(value => builder.add256(value));
    return builder.encrypt();
  }
  const domain = () => ({ name: 'VerifikasiIjazah', version: '1', chainId: 31337, verifyingContract: address });
  /** Off-chain counterpart of credentialIdFor (S-03). */
  const deriveId = (issuer_, signer_, nonce_) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'bytes32', 'address', 'uint256'], [31337, address, issuer_, signer_, nonce_]));
  async function authorization(overrides = {}, signer = issuer) {
    const encrypted = await encrypt(signer);
    const block = await ethers.provider.getBlock('latest');
    const nonce = overrides.nonce ?? nonce0;
    const payloadIssuer = overrides.issuerId ?? issuerId;
    const payload = { credentialId: deriveId(payloadIssuer, signer.address, nonce), issuerId: payloadIssuer, signer: signer.address, publicDataHash: random(),
      encryptedAttributesHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint32', 'bytes32[4]'], [1, encrypted.handles])),
      schemaVersion: 1, encodingVersion: 1, disclosurePolicyVersion: 1, nonce, issuanceDeadline: block.timestamp + 600,
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
  async function request(inputs = values, overrides = {}, signer, caller = relayer) {
    const encrypted = await encrypt(caller, inputs);
    const block = await ethers.provider.getBlock('latest');
    const attestation = {
      requestId: random(), credentialId: id, uploadCommitment: random(), schemaVersion: 'academic-diploma-v1',
      encodingVersion: 'sha256-euint256-v1', normalizerVersion: 'academic-normalizer-v1', ocrConfigHash: random(),
      inputHandlesHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[4]'], [encrypted.handles])),
      relayer: caller.address, resultReader: reader.address, nonce: BigInt(random()), deadline: block.timestamp + 600,
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
    [admin, issuer, attestor, relayer, reader, outsider, ...spares] = await ethers.getSigners();
    contract = await ethers.deployContract('VerifikasiIjazah', [admin.address, attestor.address, relayer.address, reader.address]);
    await contract.waitForDeployment();
    address = await contract.getAddress(); issuerId = random(); nonce0 = BigInt(random());
    id = deriveId(issuerId, issuer.address, nonce0);
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

  it('S-03: binds the credential ID to institution, signer and nonce so another signer cannot occupy it', async () => {
    const otherIssuer = random();
    await (await contract.setIssuer(otherIssuer, 'Kampus lain', true)).wait();
    await (await contract.setSigner(otherIssuer, outsider.address, true)).wait();
    // A prepares an issuance; its credential ID is visible in the mempool before inclusion.
    const victim = await authorization();
    // B front-runs with A's ID inside B's own, correctly signed authorization for B's institution.
    const squat = await authorization({ issuerId: otherIssuer, credentialId: victim.payload.credentialId }, outsider);
    await assert.rejects(sendIssuance(squat, outsider), /CredentialIdMismatch/);
    await (await sendIssuance(victim)).wait();
    assert.equal((await contract.getCredential(victim.payload.credentialId)).issuerId, issuerId);
    assert.equal(await contract.credentialIdFor(issuerId, issuer.address, victim.payload.nonce), victim.payload.credentialId);
    // B can still issue its own credential under its own derived ID.
    await (await sendIssuance(await authorization({ issuerId: otherIssuer, nonce: 7n }, outsider), outsider)).wait();
  });

  describe('S-01/S-02: role separation, rotation and administrator continuity', () => {
    const ADMIN = ethers.ZeroHash;
    const role = name => ethers.id(name);

    it('rejects a deployment that places two roles on one address', async () => {
      for (const roles of [[admin, admin, relayer, reader], [admin, attestor, attestor, reader], [admin, attestor, relayer, relayer], [admin, attestor, relayer, admin]]) {
        await assert.rejects(ethers.deployContract('VerifikasiIjazah', roles.map(account => account.address)), /RoleConflict/);
      }
    });

    it('rejects grants that combine roles or make a signer a service account, in both directions', async () => {
      await assert.rejects(contract.grantRole(role('RELAYER_ROLE'), attestor.address), /RoleConflict/);
      await assert.rejects(contract.grantRole(role('RESULT_READER_ROLE'), relayer.address), /RoleConflict/);
      await assert.rejects(contract.grantRole(ADMIN, reader.address), /RoleConflict/);
      await assert.rejects(contract.grantRole(role('ATTESTOR_ROLE'), admin.address), /RoleConflict/);
      // An active institution signer cannot receive a service role, and a service account cannot become a signer.
      await assert.rejects(contract.grantRole(role('RELAYER_ROLE'), issuer.address), /RoleConflict/);
      await assert.rejects(contract.grantRole(ADMIN, issuer.address), /RoleConflict/);
      for (const service of [admin, attestor, relayer, reader]) {
        await assert.rejects(contract.setSigner(issuerId, service.address, true), /RoleConflict/);
      }
      await assert.rejects(contract.grantRole(role('UNKNOWN_ROLE'), spares[0].address), /InvalidRole/);
      // Once deactivated, the former signer may hold a service role; it then cannot be reactivated as signer.
      await (await contract.setSigner(issuerId, issuer.address, false)).wait();
      await (await contract.grantRole(role('RELAYER_ROLE'), issuer.address)).wait();
      await assert.rejects(contract.setSigner(issuerId, issuer.address, true), /RoleConflict/);
    });

    it('rotates relayer, attestor and reader: revoked accounts fail and replacements work', async () => {
      await issue();
      const [newRelayer, newAttestor, newReader] = spares;
      for (const [name, account] of [['RELAYER_ROLE', newRelayer], ['ATTESTOR_ROLE', newAttestor], ['RESULT_READER_ROLE', newReader]]) {
        await (await contract.grantRole(role(name), account.address)).wait();
      }
      const before = await request();
      await (await send(before)).wait();
      await (await contract.revokeRole(role('RELAYER_ROLE'), relayer.address)).wait();
      await (await contract.revokeRole(role('ATTESTOR_ROLE'), attestor.address)).wait();
      await (await contract.revokeRole(role('RESULT_READER_ROLE'), reader.address)).wait();
      await assert.rejects(send(await request()), /AccessControlUnauthorizedAccount/);
      // Revoked attestor (with valid relayer and reader), then revoked reader (with valid relayer and attestor).
      await assert.rejects(send(await request(values, { resultReader: newReader.address }, attestor, newRelayer), newRelayer), /InvalidAttestation/);
      await assert.rejects(send(await request(values, {}, newAttestor, newRelayer), newRelayer), /InvalidAttestation/);
      const after = await request(values, { resultReader: newReader.address }, newAttestor, newRelayer);
      await (await send(after, newRelayer)).wait();
      const fresh = await contract.getComparison(after.attestation.requestId);
      assert.equal(await fhevm.userDecryptEbool(fresh.allMatch, address, newReader), true);
      await assert.rejects(fhevm.userDecryptEbool(fresh.allMatch, address, reader));
      // Residual risk, documented: revoking RESULT_READER_ROLE does not remove ACL grants on earlier results.
      const old = await contract.getComparison(before.attestation.requestId);
      assert.equal(await fhevm.userDecryptEbool(old.allMatch, address, reader), true);
    });

    it('transfers the administrator without ever leaving the contract without one', async () => {
      const newAdmin = spares[3];
      await assert.rejects(contract.renounceRole(ADMIN, admin.address), /LastAdminRemoval/);
      await assert.rejects(contract.revokeRole(ADMIN, admin.address), /LastAdminRemoval/);
      await (await contract.grantRole(ADMIN, newAdmin.address)).wait();
      assert.equal(await contract.adminCount(), 2n);
      await (await contract.renounceRole(ADMIN, admin.address)).wait();
      assert.equal(await contract.adminCount(), 1n);
      await assert.rejects(contract.setIssuer(issuerId, 'Admin lama', true), /AccessControlUnauthorizedAccount/);
      await (await contract.connect(newAdmin).setIssuer(issuerId, 'Universitas Contoh — sintetis', true)).wait();
      await assert.rejects(contract.connect(newAdmin).renounceRole(ADMIN, newAdmin.address), /LastAdminRemoval/);
    });
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
