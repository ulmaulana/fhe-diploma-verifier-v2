# Credential proof protocol v2

The shared EIP-712 implementation for issuer signing and public record verification. Public profile fields are an exact whitelist; graduation date stays private. `hashPublicProfile` uses ABI encoding, never JSON serialization. `hashEncryptedAttributes` hashes `abi.encode(uint32 encodingVersion, bytes32[4] inputHandles)` in the domain field order (name, diploma number, study program, graduation date).

Protocol v2 (EIP-712 domain `VerifikasiIjazah` version `"2"`) adds two rules that the contract enforces on-chain:

- `issuerNameHash = keccak256(UTF-8 institution name)` is part of the signed `CredentialAuthorization`. The contract rejects the issuance (`IssuerNameChanged`) when the registry name changed between review and inclusion (audit finding S-04).
- `credentialId = keccak256(abi.encode(chainId, contract, issuerId, signer, nonce))` (`deriveCredentialId`, mirrored by `credentialIdFor` in the contract). A signer of another institution cannot occupy an ID seen in the mempool (S-03).

Use `credentialDomain` only with trusted network and contract configuration. `validateSignedCredential` verifies domain, profile hash, institution name hash, credential ID derivation, signature, payload versions and optional chain bindings. It intentionally does not expire a previously issued record at `issuanceDeadline`, consume a nonce, contact RPC, or decrypt reference values. Callers must separately check successful confirmed-chain reads, the historical signer authorization, current issuer status and revocation.

Records issued on the earlier v1 contract (domain version `"1"`, no `issuerNameHash`, free-form ID) are validated only by `validateLegacySignedCredentialV1` with `legacyCredentialDomainV1`, built from a server-trusted legacy contract address. A v1 proof is never accepted on the v2 path and vice versa.

`nonce` and `issuanceDeadline` are decimal strings for lossless JSON. On-chain issuance checks both values and validates the FHE input proof. Payload e-sign is required in addition to the issuer's transaction signature. The protocol currently accepts EOA signatures only.

Run `pnpm --filter @verifikasi/credentials test` and `pnpm --filter @verifikasi/credentials typecheck` from the monorepo root. Tests are deterministic local cryptography checks and do not claim public testnet validation.
