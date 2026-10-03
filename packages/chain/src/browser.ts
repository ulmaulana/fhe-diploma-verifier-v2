import { BrowserProvider, ZeroAddress, getAddress, hexlify, isError, randomBytes, type Eip1193Provider, type TransactionReceipt } from 'ethers';
import { FIELD_KEYS, attributeDigests, digestToUint256, normalizeAttributes, requireHex32, type DiplomaAttributes } from '@verifikasi/domain';
import {
  CREDENTIAL_ENCODING_VERSION, CREDENTIAL_SCHEMA_VERSION, DISCLOSURE_POLICY_VERSION,
  credentialAuthorizationTypes, credentialDomain, credentialDigest, deriveCredentialId, hashEncryptedAttributes, hashIssuerName, hashPublicProfile,
  validateSignedCredential, type CredentialAuthorization, type CredentialDomain, type CredentialPublicProfile as PublicProfile,
} from '@verifikasi/credentials';
import { ChainConfigurationError, contractInterface, credentialContract, readIssuer } from './shared';

export interface BrowserChainConfig { chainId: number; contractAddress: string; confirmations?: number }
/** The credential ID is derived on-chain from institution, signer and nonce (S-03); callers do not choose it. */
export interface PrepareCredentialInput { attributes: DiplomaAttributes; profile: PublicProfile }
export interface PreparedCredential {
  readonly authorization: CredentialAuthorization;
  readonly domain: CredentialDomain;
  readonly profile: PublicProfile;
  readonly inputHandles: readonly string[];
  readonly inputProof: string;
}
export interface SignedPreparedCredential extends PreparedCredential { readonly signature: string }

async function connected(provider: Eip1193Provider, config: BrowserChainConfig) {
  if (config.chainId !== 11155111) throw new ChainConfigurationError('Pilih jaringan Sepolia.');
  if (getAddress(config.contractAddress) === ZeroAddress) throw new ChainConfigurationError('Alamat kontrak tidak valid.');
  await provider.request({ method: 'eth_requestAccounts' });
  const browser = new BrowserProvider(provider);
  if ((await browser.getNetwork()).chainId !== 11155111n) throw new ChainConfigurationError('Wallet harus memakai Sepolia (11155111).');
  const signer = await browser.getSigner();
  return { browser, signer, contract: credentialContract(getAddress(config.contractAddress), signer) };
}

function freezePrepared(prepared: PreparedCredential): PreparedCredential {
  return Object.freeze({ authorization: Object.freeze({ ...prepared.authorization }), domain: Object.freeze({ ...prepared.domain }),
    profile: Object.freeze({ ...prepared.profile }), inputHandles: Object.freeze([...prepared.inputHandles]), inputProof: prepared.inputProof });
}

/** Validate a snapshot without re-encrypting or changing the values being approved. */
function checkedPrepared(config: BrowserChainConfig, prepared: PreparedCredential): PreparedCredential {
  const frozen = freezePrepared(prepared);
  const domain = credentialDomain(config);
  if (credentialDigest(frozen.authorization, frozen.domain) !== credentialDigest(frozen.authorization, domain) ||
    hashPublicProfile(frozen.profile) !== frozen.authorization.publicDataHash ||
    hashEncryptedAttributes(frozen.inputHandles, frozen.authorization.encodingVersion) !== frozen.authorization.encryptedAttributesHash ||
    frozen.profile.issuerId.toLowerCase() !== frozen.authorization.issuerId.toLowerCase() ||
    hashIssuerName(frozen.profile.issuerDisplayName) !== frozen.authorization.issuerNameHash ||
    deriveCredentialId(config, frozen.authorization.issuerId, frozen.authorization.signer, frozen.authorization.nonce) !== frozen.authorization.credentialId.toLowerCase() ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(frozen.inputProof)) throw new Error('Snapshot penerbitan berubah. Siapkan dan sahkan kembali kredensial.');
  return frozen;
}

async function assertSubmissionAllowed(connection: Awaited<ReturnType<typeof connected>>, prepared: PreparedCredential) {
  if (getAddress(prepared.authorization.signer) !== connection.signer.address) throw new Error('Gunakan wallet yang mengesahkan kredensial ini.');
  const issuer = await readIssuer(connection.contract, connection.signer.address);
  if (!issuer.exists || !issuer.active || !issuer.signerActive || issuer.issuerId.toLowerCase() !== prepared.authorization.issuerId.toLowerCase() ||
    issuer.name !== prepared.profile.issuerDisplayName || hashIssuerName(issuer.name) !== prepared.authorization.issuerNameHash) {
    throw new Error('Kewenangan atau identitas penerbit berubah. Siapkan kembali kredensial.');
  }
  const [block, nonceUsed] = await Promise.all([
    connection.browser.getBlock('latest'),
    connection.contract.getFunction('issuanceNonceUsed')(connection.signer.address, prepared.authorization.nonce),
  ]);
  if (!block || BigInt(block.timestamp) > BigInt(prepared.authorization.issuanceDeadline)) throw new Error('Batas waktu penerbitan berakhir. Siapkan dan sahkan kembali kredensial.');
  if (nonceUsed) throw new Error('Otorisasi penerbitan sudah digunakan. Periksa rekaman yang sudah diterbitkan.');
}

/** Encrypt once, before review and e-sign. Private graduation data never leaves this preparation step as plaintext. */
export async function prepareCredential(provider: Eip1193Provider, config: BrowserChainConfig, input: PrepareCredentialInput): Promise<PreparedCredential> {
  const profile = Object.freeze({ ...input.profile });
  const publicDataHash = hashPublicProfile(profile);
  const attributes = normalizeAttributes(input.attributes);
  const publicAttributes = normalizeAttributes({ full_name: profile.fullName, diploma_number: profile.diplomaNumber,
    study_program: profile.studyProgram, graduation_date: attributes.graduation_date });
  if (FIELD_KEYS.some(key => attributes[key] !== publicAttributes[key])) throw new Error('Profil publik tidak sesuai atribut penerbitan.');
  const connection = await connected(provider, config);
  const issuer = await readIssuer(connection.contract, connection.signer.address);
  if (!issuer.active || !issuer.signerActive || issuer.issuerId.toLowerCase() !== profile.issuerId.toLowerCase() || issuer.name !== profile.issuerDisplayName) {
    throw new Error('Profil kampus tidak sesuai registry penerbit yang berwenang.');
  }
  const nonce = BigInt(hexlify(randomBytes(32))).toString();
  const credentialId = deriveCredentialId(config, profile.issuerId, connection.signer.address, nonce);
  const { createInstance, initSDK, SepoliaConfig } = await import('@zama-fhe/relayer-sdk/web');
  await initSDK();
  const instance = await createInstance({ ...SepoliaConfig, network: provider });
  const digests = attributeDigests(credentialId, attributes);
  const builder = instance.createEncryptedInput(getAddress(config.contractAddress), connection.signer.address);
  FIELD_KEYS.forEach(key => builder.add256(digestToUint256(digests[key])));
  const encrypted = await builder.encrypt({ timeout: 60_000, signal: AbortSignal.timeout(60_000) });
  const inputHandles = encrypted.handles.map(handle => hexlify(handle));
  const block = await connection.browser.getBlock('latest');
  if (!block) throw new Error('Blok terbaru belum tersedia.');
  const authorization: CredentialAuthorization = {
    credentialId, issuerId: profile.issuerId, signer: connection.signer.address,
    issuerNameHash: hashIssuerName(issuer.name), publicDataHash, encryptedAttributesHash: hashEncryptedAttributes(inputHandles, CREDENTIAL_ENCODING_VERSION),
    schemaVersion: CREDENTIAL_SCHEMA_VERSION, encodingVersion: CREDENTIAL_ENCODING_VERSION,
    disclosurePolicyVersion: DISCLOSURE_POLICY_VERSION,
    nonce, issuanceDeadline: String(block.timestamp + 900),
  };
  return checkedPrepared(config, { authorization, profile, domain: credentialDomain(config), inputHandles, inputProof: hexlify(encrypted.inputProof) });
}

/** An explicit wallet message signature. This does not send a transaction. */
export async function signPreparedCredential(provider: Eip1193Provider, config: BrowserChainConfig, prepared: PreparedCredential): Promise<SignedPreparedCredential> {
  const frozen = checkedPrepared(config, prepared);
  const connection = await connected(provider, config);
  await assertSubmissionAllowed(connection, frozen);
  const signature = await connection.signer.signTypedData(credentialDomain(config), credentialAuthorizationTypes, frozen.authorization);
  validateSignedCredential({ authorization: frozen.authorization, profile: frozen.profile, domain: frozen.domain, signature }, credentialDomain(config));
  return Object.freeze({ ...frozen, signature });
}

/** A separate transaction confirmation, using exactly the handles and e-sign that were reviewed. */
export async function submitCredential(provider: Eip1193Provider, config: BrowserChainConfig, signed: SignedPreparedCredential,
  options: { onSubmitted?: (transactionHash: string) => void } = {}) {
  const prepared = checkedPrepared(config, signed);
  const signature = signed.signature;
  validateSignedCredential({ authorization: prepared.authorization, profile: prepared.profile, domain: prepared.domain, signature }, credentialDomain(config));
  const connection = await connected(provider, config);
  await assertSubmissionAllowed(connection, prepared);
  const transaction = await connection.contract.getFunction('issueCredential')(prepared.authorization, signature, prepared.inputHandles, prepared.inputProof);
  options.onSubmitted?.(transaction.hash as string);
  const expectedData = contractInterface.encodeFunctionData('issueCredential', [prepared.authorization, signature, prepared.inputHandles, prepared.inputProof]);
  let pending = transaction;
  let receipt: TransactionReceipt | null;
  for (;;) {
    try { receipt = await pending.wait(Math.max(2, config.confirmations ?? 2)); break; }
    catch (error) {
      if (!isError(error, 'TRANSACTION_REPLACED') || error.cancelled) throw error;
      const replacement = error.replacement;
      // A wallet fee speed-up has a new hash, but must preserve the exact issuance.
      // Never recover a cancellation or a replacement that authorizes other data.
      if (replacement.hash === pending.hash || getAddress(replacement.from) !== connection.signer.address ||
        !replacement.to || getAddress(replacement.to) !== getAddress(config.contractAddress) ||
        replacement.chainId !== BigInt(config.chainId) || replacement.value !== 0n || replacement.data.toLowerCase() !== expectedData.toLowerCase()) throw error;
      pending = replacement;
      options.onSubmitted?.(replacement.hash);
    }
  }
  if (!receipt || receipt.status !== 1) throw new Error('Penerbitan belum terkonfirmasi.');
  return { credentialId: prepared.authorization.credentialId, transactionHash: receipt.hash as string, blockNumber: receipt.blockNumber as number };
}

export async function revokeCredential(provider: Eip1193Provider, config: BrowserChainConfig, credentialId: string) {
  requireHex32(credentialId);
  const { contract } = await connected(provider, config);
  const transaction = await contract.getFunction('revoke')(credentialId);
  const receipt = await transaction.wait(Math.max(2, config.confirmations ?? 2));
  if (!receipt || receipt.status !== 1) throw new Error('Pencabutan belum terkonfirmasi.');
  return { transactionHash: receipt.hash as string, blockNumber: receipt.blockNumber as number };
}

export async function setIssuer(provider: Eip1193Provider, config: BrowserChainConfig, issuerId: string, name: string, active: boolean) {
  const { contract } = await connected(provider, config);
  const transaction = await contract.getFunction('setIssuer')(requireHex32(issuerId), name.trim(), active);
  const receipt = await transaction.wait(Math.max(2, config.confirmations ?? 2));
  if (!receipt || receipt.status !== 1) throw new Error('Perubahan penerbit belum terkonfirmasi.');
  return { transactionHash: receipt.hash as string, blockNumber: receipt.blockNumber as number };
}

export async function setSigner(provider: Eip1193Provider, config: BrowserChainConfig, issuerId: string, wallet: string, active: boolean) {
  const { contract } = await connected(provider, config);
  const transaction = await contract.getFunction('setSigner')(requireHex32(issuerId), getAddress(wallet), active);
  const receipt = await transaction.wait(Math.max(2, config.confirmations ?? 2));
  if (!receipt || receipt.status !== 1) throw new Error('Perubahan penandatangan belum terkonfirmasi.');
  return { transactionHash: receipt.hash as string, blockNumber: receipt.blockNumber as number };
}
