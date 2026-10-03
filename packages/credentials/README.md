# Credential proof protocol v1

The shared EIP-712 implementation for issuer signing and public record verification. Public profile fields are an exact whitelist; graduation date stays private. `hashPublicProfile` uses ABI encoding, never JSON serialization. `hashEncryptedAttributes` hashes `abi.encode(uint32 encodingVersion, bytes32[4] inputHandles)` in the domain field order (name, diploma number, study program, graduation date).

Use `credentialDomain` only with trusted network and contract configuration. `validateSignedCredential` verifies domain, profile hash, signature, payload versions and optional chain bindings. It intentionally does not expire a previously issued record at `issuanceDeadline`, consume a nonce, contact RPC, or decrypt reference values. Callers must separately check successful confirmed-chain reads, the historical signer authorization, current issuer status and revocation.

`nonce` and `issuanceDeadline` are decimal strings for lossless JSON. On-chain issuance checks both values and validates the FHE input proof. Payload e-sign is required in addition to the issuer's transaction signature. The protocol currently accepts EOA signatures only.

Run `pnpm --filter @verifikasi/credentials test` and `pnpm --filter @verifikasi/credentials typecheck` from the monorepo root. Tests are deterministic local cryptography checks and do not claim public testnet validation.
