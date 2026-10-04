import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { contractInterface, rpcRequest } from '@verifikasi/chain';
import { Contract, JsonRpcProvider, Wallet, getBytes, hexlify, randomBytes } from 'ethers';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateDiploma } from '../../src/server/diploma-pdf';

/** Opt-in end-to-end run on Ethereum Sepolia: real contract, real Zama FHE, real OCR, synthetic data and
 * dedicated test wallets. Skipped unless SEPOLIA_E2E=1. Private keys stay in the Node test process; the
 * browser only receives signatures and transaction hashes. Nothing secret is written to the evidence. */
const enabled = process.env.SEPOLIA_E2E === '1';
test.skip(!enabled, 'Set SEPOLIA_E2E=1, RPC_URL, SEPOLIA_E2E_ADMIN_KEY and SEPOLIA_E2E_SIGNER_KEY to run on Sepolia.');
test.describe.configure({ mode: 'serial' });

const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const WALLET_NAME = 'Dompet Uji Sepolia';
const evidenceDir = path.resolve(process.env.SEPOLIA_E2E_EVIDENCE_DIR || 'test-results/sepolia-evidence');
const rpc = enabled ? new JsonRpcProvider(rpcRequest(process.env.RPC_URL!), 11155111, { staticNetwork: true, batchMaxCount: 1 }) : null;
const admin = enabled ? new Wallet(process.env.SEPOLIA_E2E_ADMIN_KEY!, rpc) : null;
const signer = enabled ? new Wallet(process.env.SEPOLIA_E2E_SIGNER_KEY!, rpc) : null;

type Profile = { fullName: string; diplomaNumber: string; studyProgram: string; graduationDate: string };
const people: Record<'A' | 'B' | 'C', Profile> = {
  A: { fullName: 'ANDI PRATAMA', diplomaNumber: 'UAS/2026/A001', studyProgram: 'INFORMATIKA', graduationDate: '2026-08-15' },
  B: { fullName: 'BUDI SANTOSO', diplomaNumber: 'UAS/2026/B002', studyProgram: 'SISTEM INFORMASI', graduationDate: '2026-07-20' },
  C: { fullName: 'CITRA LESTARI', diplomaNumber: 'UAS/2026/C003', studyProgram: 'INFORMATIKA', graduationDate: '2026-06-10' },
};
const issuerName = process.env.SEPOLIA_E2E_ISSUER_NAME || 'Universitas Sintetis UAS (Uji)';
const issuerId = process.env.SEPOLIA_E2E_ISSUER_ID || hexlify(randomBytes(32));
if (enabled && (!/^0x[0-9a-fA-F]{64}$/.test(issuerId) || /^0x0{64}$/.test(issuerId))) {
  throw new Error('SEPOLIA_E2E_ISSUER_ID must be a nonzero bytes32.');
}
const issued: Partial<Record<'A' | 'B' | 'C', { credentialId: string; pdf: string }>> = {};
const sent: { from: string; to?: string; selector?: string; hash: string; atUtc: string }[] = [];
const evidence: { startedAtUtc: string; origin: string; chainId: number; issuerId: string; issuerName: string; admin?: string; signer?: string;
  steps: Record<string, unknown>[]; transactionsSentByBrowserWallet: typeof sent } = {
  startedAtUtc: new Date().toISOString(), origin: ORIGIN, chainId: 11155111, issuerId, issuerName, steps: [], transactionsSentByBrowserWallet: sent,
};
let context: BrowserContext; let page: Page;

function record(step: string, data: Record<string, unknown>) {
  evidence.steps.push({ step, atUtc: new Date().toISOString(), ...data });
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, 'sepolia-e2e-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
}
const shot = (name: string) => page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true, animations: 'disabled' });
const walletOf = (address: string) => [admin!, signer!].find(wallet => wallet.address.toLowerCase() === address.toLowerCase());

/** JSON-RPC errors keep code and revert data, so the app decodes contract errors as it would with a real wallet. */
function rpcError(error: unknown) {
  const source = (error as { info?: { error?: unknown }; error?: unknown })?.info?.error ?? (error as { error?: unknown })?.error ?? error;
  const value = source as { code?: number; message?: string; data?: unknown };
  return { error: { code: typeof value?.code === 'number' ? value.code : -32603, message: value?.message || String(error), data: value?.data } };
}

async function installBridgedWallet() {
  await context.exposeFunction('__sepoliaRpc', async (method: string, params: unknown[]) => {
    try { return { result: await rpc!.send(method, params) }; } catch (error) { return rpcError(error); }
  });
  await context.exposeFunction('__sepoliaPersonalSign', async (address: string, message: string) =>
    walletOf(address)!.signMessage(/^0x[0-9a-fA-F]*$/.test(message) ? getBytes(message) : message));
  await context.exposeFunction('__sepoliaSignTyped', async (address: string, json: string) => {
    const { domain, types, message } = JSON.parse(json); delete types.EIP712Domain;
    return walletOf(address)!.signTypedData(domain, types, message);
  });
  await context.exposeFunction('__sepoliaSendTx', async (address: string, tx: { to?: string; data?: string; value?: string; gas?: string }) => {
    try {
      const response = await walletOf(address)!.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, ...(tx.gas ? { gasLimit: BigInt(tx.gas) } : {}) });
      sent.push({ from: address, to: tx.to, selector: tx.data?.slice(0, 10), hash: response.hash, atUtc: new Date().toISOString() });
      return { result: response.hash };
    } catch (error) { return rpcError(error); }
  });
  await context.addInitScript(({ addresses, name }) => {
    type Bridge = { result?: unknown; error?: { code: number; message: string; data?: unknown } };
    const w = window as unknown as Record<string, (...args: unknown[]) => Promise<unknown>> & { __sepoliaWallet: unknown };
    const unwrap = (value: Bridge) => { if (value.error) throw Object.assign(new Error(value.error.message), value.error); return value.result; };
    const stateKey = 'verifikasi-sepolia-wallet';
    const saved = JSON.parse(sessionStorage.getItem(stateKey) || 'null') as { address: string; chainId: string; authorized: boolean } | null;
    let address = saved?.address ?? addresses[0]!; let chainId = saved?.chainId ?? '0xaa36a7'; let authorized = saved?.authorized ?? false;
    const requests: string[] = JSON.parse(sessionStorage.getItem(`${stateKey}-requests`) || '[]');
    const persist = () => { sessionStorage.setItem(stateKey, JSON.stringify({ address, chainId, authorized })); sessionStorage.setItem(`${stateKey}-requests`, JSON.stringify(requests)); };
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(listener => listener(value));
    const permissions = () => [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [address] }] }];
    const provider = {
      on(event: string, listener: (value: unknown) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); return provider; },
      removeListener(event: string, listener: (value: unknown) => void) { listeners.get(event)?.delete(listener); return provider; },
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        requests.push(method); persist();
        switch (method) {
          case 'eth_accounts': return authorized ? [address] : [];
          case 'eth_requestAccounts': authorized = true; persist(); return [address];
          case 'eth_chainId': return chainId;
          case 'net_version': return String(parseInt(chainId, 16));
          case 'wallet_requestPermissions': authorized = true; persist(); return permissions();
          case 'wallet_getPermissions': return authorized ? permissions() : [];
          case 'wallet_revokePermissions': authorized = false; persist(); return null;
          case 'wallet_switchEthereumChain': chainId = (params[0] as { chainId: string }).chainId; persist(); emit('chainChanged', chainId); return null;
          case 'personal_sign': return w.__sepoliaPersonalSign!(String(params[1]), String(params[0]));
          case 'eth_signTypedData_v4': return w.__sepoliaSignTyped!(String(params[0]), String(params[1]));
          case 'eth_sendTransaction': {
            const tx = params[0] as { from?: string };
            if (chainId !== '0xaa36a7') throw Object.assign(new Error('Wrong network'), { code: 4901 });
            if (tx.from && tx.from.toLowerCase() !== address.toLowerCase()) throw Object.assign(new Error('Wrong account'), { code: 4100 });
            return unwrap(await w.__sepoliaSendTx!(address, tx) as Bridge);
          }
          default:
            if (chainId !== '0xaa36a7') throw Object.assign(new Error('Fixture wallet only bridges Sepolia'), { code: 4901 });
            return unwrap(await w.__sepoliaRpc!(method, params) as Bridge);
        }
      },
    };
    w.__sepoliaWallet = {
      requests,
      setAccount(value: string) { address = value; persist(); emit('accountsChanged', [address]); },
      setChain(value: string) { chainId = value; persist(); emit('chainChanged', chainId); },
    } as unknown as never;
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({
      info: { uuid: '3b0f6c92-6b8f-4d39-9d2c-5a7f8e1e0c11', name, rdns: 'test.verifikasi.sepolia',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="%2306b6d4"/></svg>' }, provider,
    }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  }, { addresses: [admin!.address, signer!.address], name: WALLET_NAME });
  // RPC goes through the Node bridge. The browser may reach only this app, the Zama relayer, and the Zama
  // bucket that /v2/keyurl points to for the FHE public key and CRS.
  await context.route(/^https?:\/\//, route => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) || /(^|\.)zama\.(cloud|ai|org)$/.test(host)
      || /^zama-[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(host) ? route.continue() : route.abort();
  });
}

const sessionWallet = async () => (await (await context.request.get('/api/portal/session')).json()).wallet as string | null;
async function signIn(expected: string) {
  await page.goto('/penerbit');
  const connect = page.getByRole('button', { name: 'Hubungkan wallet', exact: true });
  const reconnect = page.getByRole('button', { name: 'Masuk dengan wallet', exact: true });
  // The portal button reads "Menyiapkan wallet…" until the wallet state is restored; branch only after that.
  await expect(connect.or(reconnect)).toBeVisible({ timeout: 60_000 });
  if (await connect.isVisible()) {
    await connect.click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(WALLET_NAME) }).click();
  } else await reconnect.click();
  const send = page.getByRole('button', { name: 'Kirim pesan', exact: true });
  await expect(send).toBeEnabled({ timeout: 60_000 });
  await send.click();
  await expect.poll(sessionWallet, { timeout: 60_000 }).toBe(expected);
}
const hashIn = (text: string | null) => text?.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null;
async function latestJob() { return (await (await context.request.get('/api/verifications')).json()).jobs[0]; }
async function registryState() {
  const contract = new Contract(process.env.CREDENTIAL_CONTRACT_ADDRESS!, contractInterface, rpc);
  const confirmations = Math.max(2, Number(process.env.CHAIN_CONFIRMATIONS || '2'));
  const checkedBlock = Math.max(0, await rpc!.getBlockNumber() - (confirmations - 1));
  const [issuer, authorization] = await Promise.all([
    contract.getFunction('issuers')(issuerId, { blockTag: checkedBlock }),
    contract.getFunction('getSigner')(signer!.address, { blockTag: checkedBlock }),
  ]);
  return { checkedBlock, issuer: { name: String(issuer.name), active: Boolean(issuer.active), exists: Boolean(issuer.exists) },
    signer: { issuerId: String(authorization.issuerId).toLowerCase(), active: Boolean(authorization.active), authorizationId: String(authorization.authorizationId) } };
}
const browserTransactionRequests = () => page.evaluate(() =>
  (window as unknown as { __sepoliaWallet: { requests: string[] } }).__sepoliaWallet.requests.filter(method => method === 'eth_sendTransaction').length);

async function upload(name: string, file: string, expectedHeading: string, target?: string) {
  const before = sent.length;
  await page.goto(target ? `/verifikasi?credentialId=${target}` : '/verifikasi');
  await page.getByLabel('Pilih berkas ijazah').setInputFiles(file);
  const started = Date.now();
  await page.getByRole('button', { name: 'Verifikasi Dokumen', exact: true }).click();
  await expect(page.getByRole('heading', { name: expectedHeading, exact: true })).toBeVisible({ timeout: 12 * 60_000 });
  const job = await latestJob();
  await shot(`upload-${name}`);
  record(`upload-${name}`, { expected: expectedHeading, decision: job.decision, status: job.status, reason: job.reason, requestId: job.id,
    credentialId: job.credentialId, comparisonTxHash: job.txHash ?? null, issuanceTxHash: job.issuanceTxHash ?? null, checkedBlock: job.checkedBlock ?? null,
    fields: job.fields.map((field: { key: string; status: string; confidence: number }) => ({ key: field.key, status: field.status, confidence: field.confidence })),
    createdAt: job.createdAt, checkedAt: job.checkedAt, uiSecondsToResult: Math.round((Date.now() - started) / 1000),
    browserTransactionsDuringUpload: sent.length - before });
  expect(sent.length, 'the browser wallet sends no transaction while checking a document').toBe(before);
  return job;
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(evidenceDir, { recursive: true });
  expect(BigInt(await rpc!.send('eth_chainId', [])), 'the configured RPC must be Ethereum Sepolia').toBe(11155111n);
  evidence.admin = admin!.address; evidence.signer = signer!.address;
  context = await browser.newContext({ baseURL: ORIGIN, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    ...(process.env.SEPOLIA_E2E_VIDEO === '1' ? { recordVideo: { dir: path.join(evidenceDir, 'video-raw'), size: { width: 1280, height: 900 } } } : {}) });
  await installBridgedWallet();
  page = await context.newPage();
});
test.afterAll(async () => {
  const video = page?.video();
  rpc?.destroy();
  await context?.close();
  if (video) {
    const fileName = 'Video_Demo_Sepolia.webm';
    await video.saveAs(path.join(evidenceDir, fileName));
    await video.delete();
    record('video', { fileName, format: 'webm', method: 'Playwright browser recording of this real Sepolia UI run with synthetic credentials' });
  }
  record('finished', {});
});

test('wallet on Sepolia signs in; switching to another network invalidates the session', async () => {
  test.setTimeout(5 * 60_000);
  await signIn(admin!.address);
  await page.evaluate(() => (window as unknown as { __sepoliaWallet: { setChain: (id: string) => void } }).__sepoliaWallet.setChain('0x1'));
  await expect.poll(sessionWallet, { timeout: 30_000 }).toBeNull();
  await page.evaluate(() => (window as unknown as { __sepoliaWallet: { setChain: (id: string) => void } }).__sepoliaWallet.setChain('0xaa36a7'));
  await signIn(admin!.address);
  await shot('01-admin-signed-in');
  record('wallet-network', { admin: admin!.address, wrongNetworkInvalidatedSession: true });
});

test('administrator registers or reuses the synthetic institution and signer, and the portal rejects a no-op', async () => {
  test.setTimeout(10 * 60_000);
  const initial = await registryState();
  // Fail before a registry write if a supplied ID or wallet belongs to a different institution.
  if (initial.issuer.exists) expect(initial.issuer).toEqual({ name: issuerName, active: true, exists: true });
  if (initial.signer.active) expect(initial.signer.issuerId).toBe(issuerId.toLowerCase());
  const beforeRegistry = sent.length;
  const issuerForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Administrasi institusi', exact: true }) });
  await issuerForm.getByLabel('ID institusi (bytes32)').fill(issuerId);
  await issuerForm.getByLabel('Nama institusi terverifikasi').fill(issuerName);
  let setIssuerTx: string | null = null;
  if (!initial.issuer.exists) {
    await issuerForm.getByRole('button', { name: 'Simpan institusi', exact: true }).click();
    const issuerTx = page.getByText(/^Transaksi registry institusi:/);
    await expect(issuerTx).toBeVisible({ timeout: 5 * 60_000 });
    setIssuerTx = hashIn(await issuerTx.textContent());
    expect(setIssuerTx).toMatch(/^0x[0-9a-fA-F]{64}$/);
  }
  const signerForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Wallet penandatangan', exact: true }) });
  await signerForm.getByLabel('ID institusi (bytes32)').fill(issuerId);
  await signerForm.getByLabel('Alamat wallet pejabat').fill(signer!.address);
  let setSignerTx: string | null = null;
  if (!initial.signer.active) {
    await signerForm.getByRole('button', { name: 'Simpan kewenangan wallet', exact: true }).click();
    const signerTx = page.getByText(/^Transaksi kewenangan penandatangan:/);
    await expect(signerTx).toBeVisible({ timeout: 5 * 60_000 });
    setSignerTx = hashIn(await signerTx.textContent());
    expect(setSignerTx).toMatch(/^0x[0-9a-fA-F]{64}$/);
  }
  const registered = await registryState();
  expect(registered.issuer).toEqual({ name: issuerName, active: true, exists: true });
  expect(registered.signer).toMatchObject({ issuerId: issuerId.toLowerCase(), active: true });
  expect(BigInt(registered.signer.authorizationId)).toBeGreaterThan(0n);
  if (initial.signer.active) expect(registered.signer).toEqual(initial.signer);
  expect(sent.length - beforeRegistry).toBe(Number(!initial.issuer.exists) + Number(!initial.signer.active));
  await shot(setIssuerTx || setSignerTx ? '02-registry-transactions' : '02-registry-existing-state');
  // Repeating the activation is a no-op that the contract rejects; the portal must not claim a change.
  const before = sent.length;
  const requestsBefore = await browserTransactionRequests();
  await signerForm.getByRole('button', { name: 'Simpan kewenangan wallet', exact: true }).click();
  // Next.js also renders an (empty) route announcer with role="alert".
  await expect(page.getByRole('alert').filter({ hasText: 'Wallet sudah aktif sebagai penandatangan' })).toBeVisible({ timeout: 120_000 });
  expect(sent.length).toBe(before);
  expect(await browserTransactionRequests(), 'the no-op is rejected before the wallet is asked to broadcast').toBe(requestsBefore);
  const afterNoop = await registryState();
  expect(afterNoop.issuer).toEqual(registered.issuer);
  expect(afterNoop.signer).toEqual(registered.signer);
  await shot('03-registry-noop-rejected');
  record('registry', { setIssuerTx, setSignerTx, reusedIssuer: initial.issuer.exists, reusedSigner: initial.signer.active,
    initialState: initial, registeredState: registered, stateAfterNoop: afterNoop,
    previousRegistryEvidence: initial.issuer.exists && issuerId.toLowerCase() === '0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab'
      ? 'docs/uas/evidence/sepolia/e2e-run-2026-10-04T09-40-02-443Z/sepolia-e2e-evidence.json' : null,
    noopSetSignerRejectedWithoutTransaction: true, browserTransactionRequestsDuringNoop: await browserTransactionRequests() - requestsBefore });
});

async function issue(key: 'A' | 'B' | 'C') {
  const person = people[key];
  await page.getByRole('tab', { name: 'Portal Penerbitan Ijazah Mahasiswa', exact: true }).click();
  await page.getByLabel('Nama lengkap', { exact: true }).fill(person.fullName);
  await page.getByLabel('Nomor ijazah', { exact: true }).fill(person.diplomaNumber);
  await page.getByLabel('Program studi', { exact: true }).fill(person.studyProgram);
  await page.getByLabel('Tanggal lulus (privat)', { exact: true }).fill(person.graduationDate);
  const started = Date.now();
  await page.getByRole('button', { name: 'Siapkan data untuk ditinjau', exact: true }).click();
  await page.getByLabel(/Saya telah meninjau data ini/).check({ timeout: 5 * 60_000 });
  const encryptedSeconds = Math.round((Date.now() - started) / 1000);
  await page.getByRole('button', { name: 'Lanjut ke pengesahan', exact: true }).click();
  await page.getByRole('button', { name: 'Sahkan kredensial', exact: true }).click();
  await page.getByRole('button', { name: 'Kirim penerbitan', exact: true }).click({ timeout: 2 * 60_000 });
  await expect(page.getByRole('heading', { name: 'Kredensial berhasil diterbitkan', exact: true })).toBeVisible({ timeout: 8 * 60_000 });
  const credentialId = hashIn(await page.locator('.portal-result').textContent())!;
  const confirmedSeconds = Math.round((Date.now() - started) / 1000);
  const download = page.waitForEvent('download', { timeout: 5 * 60_000 });
  await page.getByRole('button', { name: 'Unduh PDF ijazah', exact: true }).click({ timeout: 5 * 60_000 });
  const pdf = path.join(evidenceDir, `ijazah-${key}.pdf`);
  await (await download).saveAs(pdf);
  await shot(`04-issued-${key}`);
  const issuanceTx = sent.filter(item => item.from.toLowerCase() === signer!.address.toLowerCase()).at(-1)?.hash ?? null;
  issued[key] = { credentialId, pdf };
  record(`issue-${key}`, { credentialId, issuanceTx, publicProfile: { fullName: person.fullName, diplomaNumber: person.diplomaNumber, studyProgram: person.studyProgram, issuer: issuerName },
    graduationDatePrivate: true, secondsToEncryptedReview: encryptedSeconds, secondsToConfirmedIssuance: confirmedSeconds });
  await page.getByRole('button', { name: 'Terbitkan ijazah lain', exact: true }).click();
}

test('institution signer issues three synthetic credentials with EIP-712 e-sign and downloads their PDFs', async () => {
  test.setTimeout(45 * 60_000);
  await page.evaluate(address => (window as unknown as { __sepoliaWallet: { setAccount: (a: string) => void } }).__sepoliaWallet.setAccount(address), signer!.address);
  await expect.poll(sessionWallet, { timeout: 30_000 }).toBeNull();
  await signIn(signer!.address);
  for (const key of ['A', 'B', 'C'] as const) await issue(key);
});

test('the QR record page verifies without session, upload, OCR or a new transaction', async () => {
  test.setTimeout(5 * 60_000);
  const before = sent.length; const id = issued.A!.credentialId;
  const anonymous = await context.browser()!.newContext({ baseURL: ORIGIN });
  const response = await anonymous.request.get(`/api/credentials/${id}/verification`);
  const body = await response.json();
  await anonymous.close();
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading', { name: 'Rekaman ijazah terverifikasi', exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(people.A.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText(people.A.graduationDate)).toHaveCount(0);
  await shot('05-qr-record-A');
  expect(body).toMatchObject({ recordVerificationStatus: 'VERIFIED_RECORD', scope: 'RECORD_ONLY', documentDecision: null, legacyContract: false });
  expect(sent.length).toBe(before);
  record('qr-record-A', { credentialId: id, recordVerificationStatus: body.recordVerificationStatus, scope: body.scope, documentDecision: body.documentDecision,
    issuanceTxHash: body.issuanceTxHash, issuanceBlock: body.issuanceBlock, checkedBlock: body.checkedBlock, contractAddress: body.contractAddress,
    publicResponseContainsGraduationDate: JSON.stringify(body).includes(people.A.graduationDate), transactionsSent: sent.length - before });
});

test('uploading the issued PDF yields MATCH from a real FHE comparison', async () => {
  test.setTimeout(15 * 60_000);
  const job = await upload('A-original', issued.A!.pdf, 'Atribut cocok');
  expect(job.decision).toBe('MATCH');
  expect(job.txHash).toMatch(/^0x[0-9a-f]{64}$/);
});

test('one changed attribute with a valid QR yields MISMATCH on that attribute', async () => {
  test.setTimeout(15 * 60_000);
  const A = people.A;
  const bytes = await generateDiploma({ credentialId: issued.A!.credentialId, origin: ORIGIN, graduationDate: A.graduationDate, createdAt: new Date().toISOString(),
    profile: { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId: issuerId as `0x${string}`, issuerDisplayName: issuerName, fullName: 'ANDRI PRATAMA', diplomaNumber: A.diplomaNumber, studyProgram: A.studyProgram } });
  const file = path.join(evidenceDir, 'ijazah-A-name-changed.pdf'); writeFileSync(file, bytes);
  const job = await upload('A-name-changed', file, 'Ditemukan ketidaksesuaian');
  expect(job.decision).toBe('MISMATCH');
  expect(job.fields.find((field: { key: string }) => field.key === 'full_name').status).toBe('MISMATCH');
  expect(job.fields.filter((field: { key: string; status: string }) => field.key !== 'full_name').every((field: { status: string }) => field.status === 'MATCH')).toBe(true);
});

test('a QR that differs from the expected credential is refused before any comparison transaction', async () => {
  test.setTimeout(10 * 60_000);
  const job = await upload('B-on-expected-A', issued.B!.pdf, 'Belum dapat diverifikasi', issued.A!.credentialId);
  expect(job.decision).toBe('INCONCLUSIVE');
  expect(job.txHash ?? null).toBeNull();
});

test('a valid QR for B on a document with A attributes yields MISMATCH against record B', async () => {
  test.setTimeout(15 * 60_000);
  const A = people.A;
  const bytes = await generateDiploma({ credentialId: issued.B!.credentialId, origin: ORIGIN, graduationDate: A.graduationDate, createdAt: new Date().toISOString(),
    profile: { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId: issuerId as `0x${string}`, issuerDisplayName: issuerName, fullName: A.fullName, diplomaNumber: A.diplomaNumber, studyProgram: A.studyProgram } });
  const file = path.join(evidenceDir, 'ijazah-QR-B-attributes-A.pdf'); writeFileSync(file, bytes);
  const job = await upload('QR-B-attributes-A', file, 'Ditemukan ketidaksesuaian');
  expect(job.decision).toBe('MISMATCH');
  expect(job.credentialId).toBe(issued.B!.credentialId);
});

test('a document without a valid QR for this application ends INCONCLUSIVE without a transaction', async () => {
  test.setTimeout(10 * 60_000);
  const A = people.A;
  const bytes = await generateDiploma({ credentialId: issued.A!.credentialId, origin: 'https://foreign.invalid', graduationDate: A.graduationDate, createdAt: new Date().toISOString(),
    profile: { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId: issuerId as `0x${string}`, issuerDisplayName: issuerName, fullName: A.fullName, diplomaNumber: A.diplomaNumber, studyProgram: A.studyProgram } });
  const file = path.join(evidenceDir, 'ijazah-foreign-qr.pdf'); writeFileSync(file, bytes);
  const job = await upload('foreign-fixture', file, 'Belum dapat diverifikasi');
  expect(job.decision).toBe('INCONCLUSIVE');
  expect(job.txHash ?? null).toBeNull();
});

test('revoking credential C through the portal is reflected on the QR page, in uploads and in PDF access', async () => {
  test.setTimeout(20 * 60_000);
  const id = issued.C!.credentialId;
  await page.goto('/penerbit');
  await page.getByRole('tab', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  await page.getByLabel('ID kredensial yang akan dicabut').fill(id);
  await page.getByRole('button', { name: 'Cabut kredensial', exact: true }).click();
  await page.getByRole('button', { name: 'Konfirmasi pencabutan', exact: true }).click();
  const revokeText = page.getByText(/^Transaksi pencabutan:/);
  await expect(revokeText).toBeVisible({ timeout: 5 * 60_000 });
  const revocationTx = hashIn(await revokeText.textContent());
  await shot('06-revoked-in-portal');
  const pdfAccess = await context.request.get(`/api/credentials/${id}/document/download`);
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading', { name: 'Kredensial dicabut', exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Jejak pencabutan' })).toBeVisible();
  await expect(page.getByRole('link', { name: revocationTx! })).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${revocationTx}`, { timeout: 60_000 });
  await shot('07-qr-record-C-revoked');
  const record_ = await (await context.request.get(`/api/credentials/${id}/verification`)).json();
  record('revoke-C', { credentialId: id, revocationTx, recordVerificationStatus: record_.recordVerificationStatus, revocationBlock: record_.revocationBlock,
    revocationTxHash: record_.revocationTxHash, pdfDownloadStatus: pdfAccess.status() });
  expect(record_.revocationTxHash).toBe(revocationTx);
  expect(pdfAccess.status()).toBe(409);
  const job = await upload('C-after-revocation', issued.C!.pdf, 'Kredensial dicabut');
  expect(job.decision).toBe('REVOKED');
  expect(job.txHash ?? null).toBeNull();
});

test('history and report are available only to the owning session', async () => {
  test.setTimeout(5 * 60_000);
  const jobs = (await (await context.request.get('/api/verifications')).json()).jobs as { id: string; decision: string }[];
  const match = jobs.find(job => job.decision === 'MATCH')!;
  const report = await context.request.get(`/api/verifications/${match.id}/report`);
  writeFileSync(path.join(evidenceDir, 'laporan-hasil-MATCH.pdf'), await report.body());
  const foreign = await context.browser()!.newContext({ baseURL: ORIGIN });
  const denied = await foreign.request.get(`/api/verifications/${match.id}/report`);
  await foreign.close();
  await page.goto('/riwayat');
  await shot('08-history');
  record('history-report', { reportStatus: report.status(), reportContentType: report.headers()['content-type'], foreignSessionStatus: denied.status(), jobs: jobs.length });
  expect(report.status()).toBe(200);
  expect(denied.status()).toBe(401);
});

test('a record on the trusted legacy v1 contract is shown read-only (when a legacy ID is provided)', async () => {
  test.skip(!process.env.SEPOLIA_E2E_LEGACY_ID, 'No legacy credential seeded.');
  const id = process.env.SEPOLIA_E2E_LEGACY_ID!;
  const body = await (await context.request.get(`/api/credentials/${id}/verification`)).json();
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading', { name: 'Rekaman ijazah terverifikasi', exact: true })).toBeVisible({ timeout: 120_000 });
  await shot('09-legacy-v1-record');
  record('legacy-v1-record', { credentialId: id, recordVerificationStatus: body.recordVerificationStatus, scope: body.scope, documentDecision: body.documentDecision,
    legacyContract: body.legacyContract, contractAddress: body.contractAddress, reason: body.reason });
  expect(body).toMatchObject({ recordVerificationStatus: 'VERIFIED_RECORD', scope: 'RECORD_ONLY', documentDecision: null, legacyContract: true });
});
