import { Transaction, Wallet, ZeroHash, getAddress, hexlify, randomBytes, type JsonRpcProvider, type TypedDataField } from 'ethers';
import {
  ATTESTATION_TYPES, ENCODING_VERSION, FIELD_KEYS, NORMALIZER_VERSION, SCHEMA_VERSION,
  attestationDomain, attributeDigests, digestToUint256, hashInputHandles, requireHex32, type VerificationAttestation,
} from '@verifikasi/domain';
import { ChainConfigurationError, assertChainConfig, checkedProvider, contractInterface, credentialContract, readCredential, readIssuer } from './shared';
import type { ChainConfig, CredentialSummary, ResumeComparisonInput, VerificationInput, VerificationOutput } from './types';

export type { ChainConfig, CredentialMetadata, CredentialSummary, IssuerMetadata, ResumeComparisonInput, VerificationInput, VerificationOutput } from './types';

const FHE_TIMEOUT_MS = 60_000;

export function serverChainConfig(): ChainConfig {
  return assertChainConfig({
    rpcUrl: process.env.RPC_URL ?? '', chainId: Number(process.env.CHAIN_ID ?? '11155111'),
    contractAddress: process.env.CREDENTIAL_CONTRACT_ADDRESS ?? '', confirmations: Number(process.env.CHAIN_CONFIRMATIONS ?? '2'),
    deploymentBlock: Number(process.env.CONTRACT_DEPLOYMENT_BLOCK ?? '0'),
  });
}
function secret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) throw new ChainConfigurationError(`${name} belum valid.`);
  return value.startsWith('0x') ? value : `0x${value}`;
}

export async function lookupCredential(id: string) {
  const config = serverChainConfig();
  return readCredential(config, await checkedProvider(config), id);
}

export async function getIssuer(wallet: string) {
  const config = serverChainConfig();
  const provider = await checkedProvider(config);
  return readIssuer(credentialContract(config.contractAddress, provider), wallet,
    Math.max(0, await provider.getBlockNumber() - (config.confirmations! - 1)));
}

export async function portalState(wallet: string, offset = 0) {
  const config = serverChainConfig();
  const provider = await checkedProvider(config);
  const blockTag = Math.max(0, await provider.getBlockNumber() - ((config.confirmations ?? 2) - 1));
  const contract = credentialContract(config.contractAddress, provider);
  const [issuer, admin] = await Promise.all([
    readIssuer(contract, wallet, blockTag),
    contract.getFunction('hasRole')('0x' + '00'.repeat(32), wallet, { blockTag }),
  ]);
  const result = await contract.getFunction('getIssuerCredentials')(issuer.issuerId, offset, 20, { blockTag });
  // The list only shows issue date and status. One read per row at the same confirmed block replaces
  // the record page's full verification (about seven calls and a log query per credential).
  const rows = await Promise.all((result.ids as string[]).map(async (id): Promise<CredentialSummary | null> => {
    const credential = await contract.getFunction('getCredential')(id, { blockTag });
    return credential.issuerId === ZeroHash ? null : { credentialId: id, issuedAt: new Date(Number(credential.issuedAt) * 1000).toISOString(), revoked: credential.revokedAt !== 0n, confirmed: true };
  }));
  const credentials = rows.filter((row): row is CredentialSummary => row !== null);
  return { wallet, issuer, admin: Boolean(admin), credentials, total: Number(result.total), offset };
}

async function resumePrepared(provider: JsonRpcProvider, config: ChainConfig, relayerAddress: string, input: ResumeComparisonInput): Promise<string> {
  const requestId = requireHex32(input.requestId, 'requestId');
  const credentialId = requireHex32(input.credentialId, 'credentialId');
  const commitment = requireHex32(input.uploadCommitment, 'uploadCommitment');
  const transactionHash = requireHex32(input.transactionHash, 'transactionHash');
  const parsed = Transaction.from(input.serializedTransaction);
  if (parsed.hash !== transactionHash || parsed.chainId !== BigInt(config.chainId) || parsed.value !== 0n ||
    !parsed.to || getAddress(parsed.to) !== config.contractAddress || parsed.from !== relayerAddress) {
    throw new Error('Transaksi tersimpan tidak sesuai pekerjaan.');
  }
  const decoded = contractInterface.parseTransaction({ data: parsed.data, value: parsed.value });
  if (decoded?.name !== 'verify' || decoded.args[0].requestId !== requestId || decoded.args[0].credentialId !== credentialId ||
    decoded.args[0].uploadCommitment !== commitment || getAddress(decoded.args[0].relayer) !== relayerAddress) {
    throw new Error('Binding transaksi tersimpan tidak sesuai pekerjaan.');
  }
  // Validation happens even for a confirmed hash: a mismatched persisted record
  // must not be mistaken for a successful recovery of this job.
  if (await provider.getTransactionReceipt(transactionHash)) return transactionHash;
  if (await provider.getTransaction(transactionHash)) return transactionHash;
  await input.beforeBroadcast?.();
  // Reuse the original nonce, ciphertext handles, attestation, signature and hash.
  // If RPC times out, leave the persisted transaction unresolved for the next retry.
  await provider.broadcastTransaction(input.serializedTransaction);
  return transactionHash;
}

/** Recover a prepared-but-unsent transaction while holding the global relayer
 * lease, before another job can allocate the same pending account nonce. */
export async function resumeComparisonTransaction(input: ResumeComparisonInput): Promise<string> {
  const config = serverChainConfig();
  const relayer = new Wallet(secret('RELAYER_PRIVATE_KEY'));
  return resumePrepared(await checkedProvider(config), config, relayer.address, input);
}

/** Trusted OCR pipeline only. Never expose this method as a public attribute-guess endpoint.
 * The caller must hold a distributed per-relayer lock through transaction submission.
 * Persist onPreparedTransaction output atomically before it resolves for restart-safe retries.
 */
export async function submitComparison(input: VerificationInput): Promise<string> {
  if (Boolean(input.transactionHash) !== Boolean(input.serializedTransaction)) throw new Error('Transaksi tersimpan belum lengkap.');
  if (input.transactionHash && input.serializedTransaction) {
    const hash = await resumeComparisonTransaction({ ...input, transactionHash: input.transactionHash, serializedTransaction: input.serializedTransaction });
    await input.onTransaction?.(hash);
    return hash;
  }
  const config = serverChainConfig();
  const provider = await checkedProvider(config);
  const requestId = requireHex32(input.requestId, 'requestId');
  const credentialId = requireHex32(input.credentialId, 'credentialId');
  const relayer = new Wallet(secret('RELAYER_PRIVATE_KEY'), provider);
  const attestor = new Wallet(secret('ATTESTOR_PRIVATE_KEY'));
  const reader = new Wallet(secret('RESULT_READER_PRIVATE_KEY'));
  const contract = credentialContract(config.contractAddress, relayer);

  let transactionHash = input.transactionHash;
  let serialized = input.serializedTransaction;
  // Handles are public metadata; only the specifically attested reader can decrypt them.
  const used = Boolean(await contract.getFunction('requestUsed')(requestId));
  if (used && !transactionHash) {
    const logs = await contract.queryFilter(contract.filters.ComparisonRequested!(requestId), config.deploymentBlock ?? 0, 'latest');
    const log = logs.at(-1);
    if (!log) throw new Error('Transaksi pekerjaan tercatat tetapi receipt belum dapat ditemukan.');
    transactionHash = log.transactionHash;
  }
  if (!used && !transactionHash) {
    const metadata = await readCredential(config, provider, credentialId);
    if (!metadata || !metadata.confirmed || !metadata.historicalSignerAuthorized || metadata.revoked || !metadata.issuerActive) {
      throw new Error('Rekaman belum aktif, belum terkonfirmasi, atau tidak ditemukan.');
    }
    const { createInstance, SepoliaConfig } = await import('@zama-fhe/relayer-sdk/node');
    const instance = await createInstance({ ...SepoliaConfig, network: config.rpcUrl });
    const digests = attributeDigests(credentialId, input.attributes);
    const builder = instance.createEncryptedInput(config.contractAddress, relayer.address);
    FIELD_KEYS.forEach(key => builder.add256(digestToUint256(digests[key])));
    const encrypted = await builder.encrypt({ timeout: FHE_TIMEOUT_MS, signal: AbortSignal.timeout(FHE_TIMEOUT_MS) });
    const handles = encrypted.handles.map(handle => hexlify(handle));
    const block = await provider.getBlock('latest');
    if (!block) throw new Error('Blok terbaru tidak tersedia.');
    const attestation: VerificationAttestation = {
      requestId, credentialId, uploadCommitment: requireHex32(input.uploadCommitment), schemaVersion: SCHEMA_VERSION,
      encodingVersion: ENCODING_VERSION, normalizerVersion: NORMALIZER_VERSION, ocrConfigHash: requireHex32(input.ocrConfigHash),
      inputHandlesHash: hashInputHandles(handles), relayer: relayer.address, resultReader: reader.address,
      nonce: BigInt(hexlify(randomBytes(32))), deadline: BigInt(block.timestamp + 900),
    };
    const signature = await attestor.signTypedData(attestationDomain(config.chainId, config.contractAddress), ATTESTATION_TYPES, attestation);
    const transaction = await contract.getFunction('verify').populateTransaction(attestation, handles, encrypted.inputProof, signature);
    serialized = await relayer.signTransaction(await relayer.populateTransaction(transaction));
    transactionHash = Transaction.from(serialized).hash ?? undefined;
    if (!transactionHash) throw new Error('Hash transaksi belum tersedia.');
    await input.onPreparedTransaction?.({ hash: transactionHash, serialized });
  }
  if (!transactionHash) throw new Error('Transaksi pekerjaan belum tersedia.');
  if (serialized) await resumePrepared(provider, config, relayer.address, { ...input, transactionHash, serializedTransaction: serialized });
  await input.onTransaction?.(transactionHash);
  return transactionHash;
}

/** One bounded poll: Workflow sleeps between calls instead of holding an HTTP request open. */
export async function readComparison(input: Pick<VerificationInput, 'requestId' | 'credentialId' | 'uploadCommitment'> & { transactionHash: string }): Promise<VerificationOutput | null> {
  const config = serverChainConfig();
  const provider = await checkedProvider(config);
  const requestId = requireHex32(input.requestId, 'requestId');
  const credentialId = requireHex32(input.credentialId, 'credentialId');
  const transactionHash = input.transactionHash;
  const receipt = await provider.getTransactionReceipt(transactionHash);
  if (!receipt || await receipt.confirmations() < (config.confirmations ?? 2)) return null;
  if (receipt.status !== 1) throw new Error('Transaksi pencocokan ditolak.');
  const reader = new Wallet(secret('RESULT_READER_PRIVATE_KEY'));
  const contract = credentialContract(config.contractAddress, provider);
  const result = await contract.getFunction('getComparison')(requestId, { blockTag: receipt.blockNumber });
  if (result.credentialId !== credentialId || result.uploadCommitment !== input.uploadCommitment ||
    getAddress(result.resultReader) !== reader.address) throw new Error('Hasil chain tidak sesuai binding pekerjaan.');
  const handles: string[] = [...result.fields, result.allMatch];
  const { createInstance, SepoliaConfig } = await import('@zama-fhe/relayer-sdk/node');
  const instance = await createInstance({ ...SepoliaConfig, network: config.rpcUrl });
  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000) - 60;
  const typed = instance.createEIP712(keypair.publicKey, [config.contractAddress], startTimestamp, 1);
  const types: Record<string, TypedDataField[]> = {};
  for (const [key, fields] of Object.entries(typed.types)) {
    if (key !== 'EIP712Domain') types[key] = fields.map(field => ({ ...field }));
  }
  const signature = await reader.signTypedData(typed.domain, types, typed.message);
  const decrypted = await instance.userDecrypt(handles.map(handle => ({ handle, contractAddress: config.contractAddress })),
    keypair.privateKey, keypair.publicKey, signature, [config.contractAddress], reader.address, startTimestamp, 1,
    { timeout: FHE_TIMEOUT_MS, signal: AbortSignal.timeout(FHE_TIMEOUT_MS) });
  const bool = (handle: string): boolean => {
    const value = decrypted[handle as `0x${string}`];
    if (typeof value !== 'boolean') throw new Error('Hasil dekripsi bukan nilai boolean yang valid.');
    return value;
  };
  const matches = Object.fromEntries(FIELD_KEYS.map((field, index) => [field, bool(handles[index]!)])) as VerificationOutput['matches'];
  const allMatch = bool(handles[4]!);
  if (allMatch !== Object.values(matches).every(Boolean)) throw new Error('Hasil agregat tidak konsisten.');
  // Revocation or deactivation while FHE ran must override a positive comparison.
  const metadata = await readCredential(config, provider, credentialId);
  if (!metadata) throw new Error('Status akhir rekaman tidak tersedia.');
  return { matches, allMatch, metadata, transactionHash, chainId: config.chainId, contractAddress: config.contractAddress,
    checkedBlock: metadata.checkedBlock, checkedAt: metadata.checkedAt };
}

/** Compatibility for the local polling worker. Hosted work uses the two phases above. */
export async function verifyAttributes(input: VerificationInput): Promise<VerificationOutput> {
  const transactionHash = await submitComparison(input);
  const deadline = Date.now() + 180_000;
  do {
    const result = await readComparison({ ...input, transactionHash });
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 2000));
  } while (Date.now() < deadline);
  throw new Error('Transaksi masih menunggu konfirmasi. Ulangi pekerjaan yang sama.');
}
