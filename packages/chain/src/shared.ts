import { Contract, FetchRequest, Interface, JsonRpcProvider, Network, ZeroAddress, ZeroHash, getAddress, type ContractRunner } from 'ethers';
import artifact from '@verifikasi/contracts/abi';
import { ENCODING_VERSION, SCHEMA_VERSION, requireHex32 } from '@verifikasi/domain';
import { CREDENTIAL_ENCODING_VERSION, CREDENTIAL_SCHEMA_VERSION, DISCLOSURE_POLICY_VERSION } from '@verifikasi/credentials';
import type { ChainConfig, CredentialMetadata, IssuerMetadata } from './types';

export class ChainConfigurationError extends Error {
  readonly code = 'CHAIN_CONFIGURATION_INVALID';
  constructor(message = 'Layanan blockchain belum dikonfigurasi.') { super(message); this.name = 'ChainConfigurationError'; }
}
export function assertChainConfig(config: ChainConfig): ChainConfig {
  if (config.chainId !== 11155111) throw new ChainConfigurationError('MVP hanya mendukung Sepolia (11155111).');
  if (!config.rpcUrl || !/^https?:\/\//.test(config.rpcUrl)) throw new ChainConfigurationError('RPC_URL belum valid.');
  try { if (getAddress(config.contractAddress) === ZeroAddress) throw new Error(); }
  catch { throw new ChainConfigurationError('CREDENTIAL_CONTRACT_ADDRESS belum valid.'); }
  if (config.confirmations != null && (!Number.isSafeInteger(config.confirmations) || config.confirmations < 1)) {
    throw new ChainConfigurationError('CHAIN_CONFIRMATIONS harus berupa bilangan bulat positif.');
  }
  if (config.deploymentBlock != null && (!Number.isSafeInteger(config.deploymentBlock) || config.deploymentBlock < 0)) {
    throw new ChainConfigurationError('CONTRACT_DEPLOYMENT_BLOCK harus berupa bilangan bulat nonnegatif.');
  }
  return { ...config, contractAddress: getAddress(config.contractAddress), confirmations: Math.max(2, config.confirmations ?? 2) };
}
export const contractInterface = new Interface(artifact.abi);
export function credentialContract(address: string, runner: ContractRunner): Contract {
  return new Contract(address, artifact.abi, runner);
}
/** EIP-1474 "limit exceeded"; other -32005 errors (e.g. oversized log queries) are not retryable. */
function rateLimited(item: unknown): boolean {
  const error = item && typeof item === 'object' ? ('error' in item ? item.error : item) : null;
  return !!error && typeof error === 'object' && 'code' in error && error.code === -32005 &&
    'message' in error && /too many requests|rate limit/i.test(String(error.message));
}
/** Infura rejects over-quota calls with HTTP 200 and id-less error objects, which ethers reports as
 * BAD_DATA without retrying. Throttle such responses so ethers backs off within the request timeout.
 * Only a response rejected in full is retried: a partially executed batch must not be replayed. */
export function rpcRequest(url: string): FetchRequest {
  const request = new FetchRequest(url);
  request.timeout = 20_000;
  request.processFunc = async (_request, response) => {
    let body: unknown;
    try { body = response.bodyJson; } catch { return response; }
    const items = Array.isArray(body) ? body : [body];
    if (items.length > 0 && items.every(rateLimited)) response.throwThrottleError('RPC rate limited');
    return response;
  };
  return request;
}
const providers = new Map<string, Promise<JsonRpcProvider>>();
/** One verified provider per configuration and process. A static network stops ethers from sending
 * eth_chainId before every call, and unbatched calls keep each rate-limit reply retryable on its own. */
export function checkedProvider(config: ChainConfig): Promise<JsonRpcProvider> {
  const key = JSON.stringify([config.rpcUrl, config.chainId, config.contractAddress]);
  let pending = providers.get(key);
  if (!pending) {
    pending = connectProvider(config);
    providers.set(key, pending);
    pending.catch(() => { if (providers.get(key) === pending) providers.delete(key); });
  }
  return pending;
}
async function connectProvider(config: ChainConfig): Promise<JsonRpcProvider> {
  const network = Network.from(config.chainId);
  const provider = new JsonRpcProvider(rpcRequest(config.rpcUrl), network, { staticNetwork: network, batchMaxCount: 1 });
  try {
    if (BigInt(await provider.send('eth_chainId', [])) !== BigInt(config.chainId)) throw new ChainConfigurationError('Chain ID RPC tidak sesuai konfigurasi.');
    if (await provider.getCode(config.contractAddress) === '0x') throw new ChainConfigurationError('Kontrak tidak ditemukan pada alamat yang dikonfigurasi.');
    return provider;
  } catch (error) { provider.destroy(); throw error; }
}
export async function readIssuer(contract: Contract, wallet: string, blockTag?: number): Promise<IssuerMetadata> {
  const address = getAddress(wallet);
  const options = blockTag == null ? {} : { blockTag };
  const signer = await contract.getFunction('getSigner')(address, options);
  const entry = await contract.getFunction('issuers')(signer.issuerId, options);
  return { wallet: address, issuerId: signer.issuerId, name: String(entry.name), active: Boolean(entry.active),
    exists: Boolean(entry.exists), signerActive: Boolean(signer.active), authorizationId: String(signer.authorizationId) };
}
export async function readCredential(config: ChainConfig, provider: JsonRpcProvider, id: string): Promise<CredentialMetadata | null> {
  id = requireHex32(id, 'credentialId');
  const head = await provider.getBlockNumber();
  let checkedBlock = Math.max(0, head - (Math.max(2, config.confirmations ?? 2) - 1));
  const contract = credentialContract(config.contractAddress, provider);
  let credential = await contract.getFunction('getCredential')(id, { blockTag: checkedBlock });
  let confirmed = true;
  if (credential.issuerId === ZeroHash) {
    // An issuance in the unconfirmed tip is PENDING, not NOT_FOUND.
    if (head === checkedBlock) return null;
    credential = await contract.getFunction('getCredential')(id, { blockTag: head });
    if (credential.issuerId === ZeroHash) return null;
    checkedBlock = head;
    confirmed = false;
  }
  if (credential.signer === ZeroAddress) throw new Error('Signer penerbitan tidak tersedia.');
  const [issuer, historical, block, schema, encoding] = await Promise.all([
    contract.getFunction('issuers')(credential.issuerId, { blockTag: checkedBlock }),
    contract.getFunction('signerAuthorizations')(credential.signerAuthorizationId, { blockTag: checkedBlock }),
    provider.getBlock(checkedBlock),
    contract.getFunction('SCHEMA_VERSION')({ blockTag: checkedBlock }), contract.getFunction('ENCODING_VERSION')({ blockTag: checkedBlock }),
  ]);
  if (!block?.hash) throw new Error('Blok status tidak tersedia.');
  if (schema !== SCHEMA_VERSION || encoding !== ENCODING_VERSION) throw new Error('Versi kontrak tidak didukung.');
  if (Number(credential.schemaVersion) !== CREDENTIAL_SCHEMA_VERSION ||
    Number(credential.encodingVersion) !== CREDENTIAL_ENCODING_VERSION ||
    Number(credential.disclosurePolicyVersion) !== DISCLOSURE_POLICY_VERSION) throw new Error('Versi kredensial tidak didukung.');
  const issuanceBlock = Number(credential.issuedBlock);
  if (!Number.isSafeInteger(issuanceBlock) || issuanceBlock <= 0 || issuanceBlock > checkedBlock) throw new Error('Blok penerbitan tidak valid.');
  // The immutable issuance block makes this a bounded single-block RPC query.
  const logs = await contract.queryFilter(contract.filters.CredentialIssued!(id), issuanceBlock, issuanceBlock);
  const issued = logs.find(log => 'args' in log && log.args.credentialId === id);
  if (!issued) throw new Error('Bukti transaksi penerbitan tidak tersedia.');
  // Revocation status comes from contract state. The transaction hash is supplementary: a failed or empty
  // single-block log lookup keeps the record REVOKED and reports the hash as unavailable (never guessed).
  let revocationTransactionHash: string | null = null;
  if (credential.revokedAt !== 0n) {
    try {
      const revokedBlock = Number(credential.revokedBlock);
      const revokedLogs = await contract.queryFilter(contract.filters.CredentialRevoked!(id), revokedBlock, revokedBlock);
      const revoked = revokedLogs.find(log => getAddress(log.address) === config.contractAddress && 'args' in log && log.args.credentialId === id);
      revocationTransactionHash = revoked?.transactionHash ?? null;
    } catch { revocationTransactionHash = null; }
  }
  const historicalSignerAuthorized = BigInt(credential.signerAuthorizationId) > 0n &&
    historical.issuerId === credential.issuerId && getAddress(historical.signer) === getAddress(credential.signer) &&
    historical.authorizedAt <= credential.issuedAt && (historical.revokedAt === 0n || historical.revokedAt >= credential.issuedAt);
  return {
    credentialId: id, issuer: getAddress(credential.signer), issuerId: credential.issuerId, signer: getAddress(credential.signer),
    issuerName: String(issuer.name), issuerActive: Boolean(issuer.exists && issuer.active), historicalSignerAuthorized,
    revoked: credential.revokedAt !== 0n, issuedAt: new Date(Number(credential.issuedAt) * 1000).toISOString(),
    revokedAt: credential.revokedAt === 0n ? null : new Date(Number(credential.revokedAt) * 1000).toISOString(),
    schemaVersion: Number(credential.schemaVersion), encodingVersion: Number(credential.encodingVersion),
    disclosurePolicyVersion: Number(credential.disclosurePolicyVersion), credentialDigest: credential.credentialDigest,
    publicDataHash: credential.publicDataHash, encryptedAttributesHash: credential.encryptedAttributesHash,
    issuerNameHash: credential.issuerNameHash, signerAuthorizationId: String(credential.signerAuthorizationId),
    issuanceBlock, issuanceTransactionHash: issued.transactionHash,
    revocationBlock: credential.revokedAt === 0n ? null : Number(credential.revokedBlock), revocationTransactionHash, confirmed,
    checkedBlock, checkedBlockHash: block.hash,
    checkedAt: new Date(block.timestamp * 1000).toISOString(), chainId: config.chainId, contractAddress: config.contractAddress,
  };
}
