import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { getBytes, Wallet } from 'ethers';
import { generateDiploma } from '../../src/server/diploma-pdf';
import { readFile } from 'node:fs/promises';

const test = base.extend<{ mockWallets: boolean }>({ mockWallets: [true, { option: true }] });
// Public, disposable fixtures. No wallet extension, testnet funds, or RPC is used.
const campusWallet = new Wallet(`0x${'11'.repeat(32)}`);
const otherWallet = new Wallet(`0x${'22'.repeat(32)}`);
const campusName = 'Dompet Kampus Uji';

// Each viewport runs both date conditions of the issuer PDF: a date frozen with the issuance draft, and a
// legacy credential whose issuer declares the date once when creating the PDF.
for (const width of [1280, 800, 390]) for (const dateSource of ['declared', 'frozen'] as const) {
  test(`private diploma controls and browser download at ${width}px, ${dateSource} date (mock document API)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    const id = `0x${'ab'.repeat(32)}`;
    const issuerId = `0x${'cd'.repeat(32)}` as `0x${string}`;
    const pdf = await generateDiploma({ credentialId: id, origin: 'http://localhost:3000', graduationDate: '2026-08-15', createdAt: '2026-09-25T00:00:00Z', profile: { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId, issuerDisplayName: 'Universitas Contoh Indonesia', fullName: 'ANDI PRATAMA', diplomaNumber: 'IF-2026-001', studyProgram: 'INFORMATIKA' } });
    await page.route('**/api/portal/config*', route => route.fulfill({ json: { mode: 'testnet', chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}`, portal: { wallet: campusWallet.address, issuer: { exists: true, active: true, signerActive: true, issuerId, name: 'Universitas Contoh Indonesia' }, admin: width === 1280, credentials: [{ credentialId: id, issuedAt: '2026-09-25T00:00:00Z', confirmed: true, revoked: false }], offset: 0, total: 1 } } }));
    // Mirrors documents.ts: GET reports NOT_CREATED with the frozen draft date (if any); POST generates and
    // archives the PDF from issuance data synchronously and answers with the stored READY state. There is no
    // OCR or document-check phase in issuer PDF generation.
    const ready = { status: 'READY', graduationDate: '2026-08-15', dateFrozen: true, templateVersion: 'diploma-pdf', downloadUrl: `/api/credentials/${id}/document/download` };
    const notCreated = dateSource === 'frozen' ? { status: 'NOT_CREATED', graduationDate: '2026-08-15', dateFrozen: true } : { status: 'NOT_CREATED', dateFrozen: false };
    let created = false;
    await page.route(`**/api/credentials/${id}/document`, async route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ graduationDate: '2026-08-15' });
        expect(route.request().headers()['x-csrf-token']).toBeTruthy();
        expect(route.request().headers()['idempotency-key']).toMatch(/^[a-zA-Z0-9_-]{16,128}$/);
        created = true;
        return route.fulfill({ status: 202, json: ready });
      }
      return route.fulfill({ json: created ? ready : notCreated });
    });
    await page.route(`**/api/credentials/${id}/document/download`, route => route.fulfill({ body: pdf, contentType: 'application/pdf' }));
    await openSignIn(page); await finishSignIn(page, context);
    const institutionTab = page.getByRole('tab', { name: 'Portal Kredensial Institusi', exact: true });
    const issuanceTab = page.getByRole('tab', { name: 'Portal Penerbitan Ijazah Mahasiswa', exact: true });
    const recordsTab = page.getByRole('tab', { name: 'Data Ijazah Mahasiswa', exact: true });
    await expect(institutionTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toBeHidden();
    if (width === 1280) {
      await expect(page.getByRole('heading', { name: 'Administrasi institusi', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Wallet penandatangan', exact: true })).toBeVisible();
      await page.getByLabel('Nama institusi terverifikasi', { exact: true }).fill('Universitas Contoh Indonesia');
    } else {
      await expect(page.getByRole('heading', { name: 'Administrasi institusi', exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Buat PDF ijazah', exact: true })).toBeHidden();
    await page.screenshot({ path: test.info().outputPath(`portal-institution-${width}.png`), fullPage: true, animations: 'disabled' });
    await issuanceTab.click();
    await expect(page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Administrasi institusi', exact: true })).toBeHidden();
    await page.getByLabel('Nama lengkap', { exact: true }).fill('ANDI PRATAMA');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`portal-issuance-${width}.png`), fullPage: true, animations: 'disabled' });
    await issuanceTab.press('Home');
    await expect(institutionTab).toBeFocused();
    await expect(institutionTab).toHaveAttribute('aria-selected', 'true');
    await institutionTab.press('ArrowRight');
    await expect(issuanceTab).toBeFocused();
    await expect(page.getByLabel('Nama lengkap', { exact: true })).toHaveValue('ANDI PRATAMA');
    await issuanceTab.press('End');
    await expect(recordsTab).toBeFocused();
    await expect(recordsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administrasi institusi', exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Wallet penandatangan', exact: true })).toBeHidden();
    if (width === 1280) {
      await institutionTab.click();
      await expect(page.getByLabel('Nama institusi terverifikasi', { exact: true })).toHaveValue('Universitas Contoh Indonesia');
      await recordsTab.click();
    }
    await page.getByRole('button', { name: 'Buat PDF ijazah', exact: true }).click();
    const dateField = page.getByLabel('Tanggal lulus sesuai data penerbitan', { exact: true });
    if (dateSource === 'frozen') await expect(dateField).toHaveCount(0); // the date frozen at issuance is reused, not re-entered
    else await dateField.fill('2026-08-15');
    await expect(page.getByText('PDF dibuat dari data penerbitan dan disimpan sebagai arsip privat.', { exact: false })).toBeVisible();
    expect(created).toBe(false);
    await page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`diploma-form-${width}-${dateSource}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Buat PDF ijazah', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeVisible({ timeout: 20000 });
    expect(created).toBe(true);
    // Issuer PDF generation does not run OCR/FHE; the removed document-check phase must not reappear.
    await expect(page.getByText('Memeriksa dokumen', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`diploma-${width}.png`), fullPage: true });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh PDF', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('ijazah-ababababab.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Kelola wallet 0x/ })).toBeVisible({ timeout: 20000 });
    await recordsTab.click();
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeVisible({ timeout: 20000 });
    await page.evaluate(address => (window as unknown as FixtureWindow).__walletFixture.setAccount(address), otherWallet.address);
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toHaveCount(0);
  });
}
interface WalletFixture {
  setAccount: (address: string) => void;
  setChain: (chainId: string) => void;
  rejectSignature: boolean;
  holdTransaction: boolean;
  releaseTransaction: () => void;
  requests: { wallet: string; method: string }[];
}
interface FixtureWindow {
  __walletFixture: WalletFixture;
  __signFixtureMessage: (address: string, message: string) => Promise<string>;
}

async function blockExternalRequests(page: Page) {
  // Keep every application API request real; prevent optional wallet balance/ENS calls
  // from reaching public RPC endpoints during this browser test.
  await page.route(/^https?:\/\//, route => {
    const hostname = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? route.continue() : route.abort();
  });
}

async function installWallets(page: Page) {
  await page.exposeFunction('__signFixtureMessage', async (address: string, message: string) => {
    const signer = [campusWallet, otherWallet].find(candidate => candidate.address.toLowerCase() === address.toLowerCase());
    if (!signer) throw new Error('Unknown test wallet');
    return signer.signMessage(getBytes(message));
  });
  await page.addInitScript(({ addresses, name }) => {
    const fixtureWindow = window as unknown as FixtureWindow;
    const requestKey = 'verifikasi-test-wallet-requests';
    const requests: WalletFixture['requests'] = JSON.parse(sessionStorage.getItem(requestKey) || '[]');
    const providers = addresses.map((initialAddress, index) => {
      const stateKey = `verifikasi-test-wallet-${index}`;
      const previous = JSON.parse(sessionStorage.getItem(stateKey) || 'null') as { address: string; chainId: string; authorized: boolean } | null;
      let address = previous?.address ?? initialAddress;
      let chainId = previous?.chainId ?? '0xaa36a7';
      let authorized = previous?.authorized ?? false;
      const persist = () => sessionStorage.setItem(stateKey, JSON.stringify({ address, chainId, authorized }));
      const listeners = new Map<string, Set<(value: unknown) => void>>();
      const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(listener => listener(value));
      const permissions = () => [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [address] }] }];
      const provider = {
        on(event: string, listener: (value: unknown) => void) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(listener);
          return provider;
        },
        removeListener(event: string, listener: (value: unknown) => void) {
          listeners.get(event)?.delete(listener);
          return provider;
        },
        async request({ method, params = [] }: { method: string; params?: unknown[] }) {
          requests.push({ wallet: index === 0 ? name : 'Dompet Cadangan Uji', method });
          sessionStorage.setItem(requestKey, JSON.stringify(requests));
          switch (method) {
            case 'eth_accounts': return authorized ? [address] : [];
            case 'eth_requestAccounts': authorized = true; persist(); return [address];
            case 'eth_chainId': return chainId;
            case 'wallet_requestPermissions': authorized = true; persist(); return permissions();
            case 'wallet_getPermissions': return authorized ? permissions() : [];
            case 'wallet_revokePermissions': authorized = false; persist(); return null;
            case 'wallet_switchEthereumChain':
              chainId = (params[0] as { chainId: string }).chainId;
              persist();
              emit('chainChanged', chainId);
              return null;
            case 'personal_sign': {
              if (fixtureWindow.__walletFixture.rejectSignature) throw Object.assign(new Error('User rejected the request'), { code: 4001 });
              if (!authorized || String(params[1]).toLowerCase() !== address.toLowerCase()) throw new Error('Wrong wallet selected');
              return fixtureWindow.__signFixtureMessage(address, String(params[0]));
            }
            case 'eth_getBalance': return '0x0';
            case 'eth_blockNumber': return '0x1';
            case 'eth_estimateGas': return '0x186a0';
            case 'eth_sendTransaction':
              if (fixtureWindow.__walletFixture.holdTransaction) await new Promise<void>(resolve => {
                fixtureWindow.__walletFixture.releaseTransaction = resolve;
              });
              // Transaction requests always stop at this fake wallet; nothing is broadcast.
              throw Object.assign(new Error('User rejected the request'), { code: 4001 });
            default: throw Object.assign(new Error(`Unsupported fixture method: ${method}`), { code: 4200 });
          }
        },
      };
      return {
        provider,
        setAccount(value: string) { address = value; persist(); emit('accountsChanged', [address]); },
        setChain(value: string) { chainId = value; persist(); emit('chainChanged', chainId); },
      };
    });
    fixtureWindow.__walletFixture = {
      requests, rejectSignature: false, holdTransaction: false, releaseTransaction: () => {},
      setAccount: providers[0]!.setAccount,
      setChain: providers[0]!.setChain,
    };
    // The global injected wallet is deliberately different from the selected wallet.
    Object.defineProperty(window, 'ethereum', { value: providers[1]!.provider, configurable: true });
    const announce = () => providers.forEach(({ provider }, index) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: {
          uuid: index === 0 ? '96aedfab-338a-4f4d-874d-7c80737a8791' : '734c4708-0fe3-40d1-a386-d976658f7387',
          name: index === 0 ? name : 'Dompet Cadangan Uji',
          rdns: index === 0 ? 'test.verifikasi.campus' : 'test.verifikasi.backup',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="%2317191d"/></svg>',
        }, provider,
      }),
    })));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  }, { addresses: [campusWallet.address, otherWallet.address], name: campusName });
}

async function serverWallet(context: BrowserContext) {
  const response = await context.request.get('/api/portal/session');
  expect(response.status()).toBe(200);
  return (await response.json()).wallet as string | null;
}

async function openSignIn(page: Page, screenshotPath?: string) {
  await page.goto('/penerbit');
  await page.getByRole('button', { name: 'Hubungkan wallet', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: new RegExp(campusName) })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Dompet Cadangan Uji/ })).toBeVisible();
  if (screenshotPath) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  }
  await dialog.getByRole('button', { name: new RegExp(campusName) }).click();
  await expect(page.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeEnabled({ timeout: 20000 });
}

async function finishSignIn(page: Page, context: BrowserContext, address = campusWallet.address) {
  await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Kelola wallet 0x/ })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => serverWallet(context)).toBe(address);
}

test.beforeEach(async ({ page, mockWallets }) => {
  await blockExternalRequests(page);
  if (mockWallets) await installWallets(page);
});

async function openRevocationRecords(page: Page, context: BrowserContext) {
  const credentials = Array.from({ length: 12 }, (_, index) => ({
    credentialId: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    issuedAt: '2026-09-25T00:00:00Z', confirmed: true, revoked: false,
  }));
  await page.route('**/api/portal/config*', route => route.fulfill({ json: {
    mode: 'testnet', chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}`,
    portal: {
      wallet: campusWallet.address,
      issuer: { exists: true, active: true, signerActive: true, issuerId: `0x${'cd'.repeat(32)}`, name: 'Universitas Contoh Indonesia' },
      admin: false, credentials, offset: 0, total: credentials.length,
      documents: Object.fromEntries(credentials.map(({ credentialId }) => [credentialId, { status: 'NOT_CREATED', dateFrozen: false }])),
    },
  } }));
  await openSignIn(page);
  await finishSignIn(page, context);
  await page.getByRole('tab', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cabut', exact: true })).toHaveCount(credentials.length);
  return credentials;
}

async function openPaginatedRecords(page: Page, context: BrowserContext) {
  const credentials = Array.from({ length: 41 }, (_, index) => ({
    credentialId: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    issuedAt: '2026-09-25T00:00:00Z', confirmed: index !== 4, revoked: index === 3,
  }));
  const documents = Object.fromEntries(credentials.map(({ credentialId }, index) => [credentialId,
    index === 1 ? { status: 'NOT_CREATED', dateFrozen: false }
      : index === 2 ? { status: 'FAILED', dateFrozen: false, reason: 'Dokumen belum tersedia.', errorCode: 'ARCHIVE_NOT_AVAILABLE' }
        : { status: 'READY', graduationDate: '2026-08-15', dateFrozen: true, downloadUrl: `/api/credentials/${credentialId}/document/download` },
  ]));
  const offsets: number[] = [];
  const documentRequests: string[] = [];
  let nextRequest: 'normal' | 'fail' | 'hold' = 'normal';
  let releasePending: (() => void) | undefined;
  await page.route('**/api/portal/config*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0);
    offsets.push(offset);
    const behavior = offset === 20 ? nextRequest : 'normal';
    if (offset === 20) nextRequest = 'normal';
    if (behavior === 'fail') return route.fulfill({ status: 503, json: { error: 'Halaman ijazah belum dapat dimuat.' } });
    if (behavior === 'hold') await new Promise<void>(resolve => { releasePending = resolve; });
    const rows = credentials.slice(offset, offset + 20);
    await route.fulfill({ json: {
      mode: 'testnet', chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}`,
      portal: {
        wallet: campusWallet.address,
        issuer: { exists: true, active: true, signerActive: true, issuerId: `0x${'cd'.repeat(32)}`, name: 'Universitas Contoh Indonesia' },
        admin: false, credentials: rows, offset, total: credentials.length,
        documents: Object.fromEntries(rows.filter(({ credentialId }) => credentialId !== credentials[5]!.credentialId).map(({ credentialId }) => [credentialId, documents[credentialId]])),
      },
    } });
  });
  await page.route(/\/api\/credentials\/0x[0-9a-f]+\/document(?:\?.*)?$/, route => {
    documentRequests.push(route.request().method());
    const id = new URL(route.request().url()).pathname.split('/')[3]!;
    if (id === credentials[5]!.credentialId) return route.fulfill({ status: 404, json: { error: 'Dokumen tidak ditemukan untuk institusi ini.' } });
    return route.fulfill({ json: documents[id] ?? { status: 'NOT_CREATED', dateFrozen: false } });
  });
  await openSignIn(page);
  await finishSignIn(page, context);
  await page.getByRole('tab', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  return {
    credentials, offsets, documentRequests,
    failNextPage: () => { nextRequest = 'fail'; },
    holdNextPage: () => { nextRequest = 'hold'; },
    releasePage: () => { releasePending?.(); releasePending = undefined; },
  };
}

for (const width of [1280, 390]) test(`student diploma records have continuous numbers and 20 rows per page at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await openPaginatedRecords(page, context);
  const records = page.getByRole('region', { name: 'Daftar ijazah mahasiswa', exact: true });
  const rows = records.locator('tbody > tr');
  const pagination = page.getByRole('navigation', { name: 'Halaman data ijazah', exact: true });
  const previous = pagination.getByRole('button', { name: 'Sebelumnya', exact: true });
  const next = pagination.getByRole('button', { name: 'Berikutnya', exact: true });
  const pageButton = (number: number) => pagination.getByRole('button', { name: `Halaman ${number}`, exact: true });
  const expectPage = async (offset: number, count: number) => {
    await expect(rows).toHaveCount(count);
    await expect(records.getByText(`Menampilkan ${offset + 1}–${offset + count} dari 41 ijazah`, { exact: false })).toBeVisible();
    await expect(pageButton(offset / 20 + 1)).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => rows.evaluateAll(elements => elements.map(element => element.querySelector('td,th')?.textContent?.trim()))).toEqual(Array.from({ length: count }, (_, index) => String(offset + index + 1)));
    for (const index of [0, count - 1]) await expect(rows.nth(index).getByRole('link', { name: 'Lihat rekaman', exact: true })).toHaveAttribute('href', `/c/${fixture.credentials[offset + index]!.credentialId}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };

  await expectPage(0, 20);
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(rows.nth(3).getByText('Dicabut', { exact: true })).toBeVisible();
  await expect(rows.nth(3).getByRole('button', { name: 'Cabut', exact: true })).toHaveCount(0);
  await expect(rows.nth(0).getByRole('button', { name: 'Unduh PDF', exact: true })).toBeVisible();
  await expect(rows.nth(1).getByRole('button', { name: 'Buat PDF ijazah', exact: true })).toBeVisible();
  const missingPdf = rows.nth(5);
  await expect(missingPdf.getByText('PDF tidak tersedia', { exact: true })).toBeVisible();
  await expect(missingPdf.getByRole('alert')).toHaveCount(0);
  await missingPdf.getByRole('button', { name: 'Detail PDF', exact: true }).click();
  await expect(missingPdf.getByRole('alert')).toHaveText('Dokumen tidak ditemukan untuk institusi ini.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath(`diploma-records-pdf-error-${width}.png`), fullPage: true, animations: 'disabled' });
  await missingPdf.getByRole('button', { name: 'Tutup detail PDF', exact: true }).click();
  await page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath(`diploma-records-page-1-${width}.png`), fullPage: true, animations: 'disabled' });
  await next.click();
  await expectPage(20, 20);
  await expect(previous).toBeEnabled();
  await next.click();
  await expectPage(40, 1);
  await expect(next).toBeDisabled();
  await page.getByRole('heading', { name: 'Data Ijazah Mahasiswa', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath(`diploma-records-page-3-${width}.png`), fullPage: true, animations: 'disabled' });
  await previous.click();
  await expectPage(20, 20);
  await pageButton(1).click();
  await expectPage(0, 20);
  await pageButton(3).click();
  await expectPage(40, 1);
  expect(fixture.offsets.filter(offset => offset !== 0)).toEqual([20, 40, 20, 40]);
  expect(fixture.documentRequests.filter(method => method !== 'GET')).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => ['eth_estimateGas', 'eth_sendTransaction'].includes(request.method)))).toEqual([]);
});

test('student diploma pagination keeps the current page after a failed request and prevents duplicate requests while loading', async ({ page, context }) => {
  const fixture = await openPaginatedRecords(page, context);
  const records = page.getByRole('region', { name: 'Daftar ijazah mahasiswa', exact: true });
  const rows = records.locator('tbody > tr');
  const pagination = page.getByRole('navigation', { name: 'Halaman data ijazah', exact: true });
  const next = pagination.getByRole('button', { name: 'Berikutnya', exact: true });
  const pageOne = pagination.getByRole('button', { name: 'Halaman 1', exact: true });
  const pageThree = pagination.getByRole('button', { name: 'Halaman 3', exact: true });
  await expect(rows).toHaveCount(20);
  fixture.failNextPage();
  await next.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Halaman ijazah belum dapat dimuat.' })).toBeVisible();
  await expect(rows).toHaveCount(20);
  await expect(pageOne).toHaveAttribute('aria-current', 'page');
  await expect(records.getByText('Menampilkan 1–20 dari 41 ijazah', { exact: false })).toBeVisible();
  await expect(next).toBeEnabled();

  fixture.holdNextPage();
  try {
    await next.click();
    await expect.poll(() => fixture.offsets.filter(offset => offset === 20).length).toBe(2);
    await expect(next).toBeDisabled();
    await expect(pageThree).toBeDisabled();
    await expect(rows).toHaveCount(20);
    await expect(pageOne).toHaveAttribute('aria-current', 'page');
    // Even a forced click on a disabled control must not trigger a duplicate request.
    await next.click({ force: true });
    fixture.releasePage();
    await expect(records.getByText('Menampilkan 21–40 dari 41 ijazah', { exact: false })).toBeVisible();
    await expect(rows).toHaveCount(20);
    await expect(rows.first().locator('td,th').first()).toHaveText('21');
    await expect(next).toBeEnabled();
    expect(fixture.offsets.filter(offset => offset === 20)).toHaveLength(2);
    await expect(page.getByRole('alert').filter({ hasText: 'Halaman ijazah belum dapat dimuat.' })).toHaveCount(0);
  } finally { fixture.releasePage(); }
});

test('student diploma pagination cannot restore records from a previous wallet when its response arrives late', async ({ page, context }) => {
  const fixture = await openPaginatedRecords(page, context);
  const records = page.getByRole('region', { name: 'Daftar ijazah mahasiswa', exact: true });
  const next = page.getByRole('navigation', { name: 'Halaman data ijazah', exact: true }).getByRole('button', { name: 'Berikutnya', exact: true });
  fixture.holdNextPage();
  try {
    await next.click();
    await expect.poll(() => fixture.offsets.filter(offset => offset === 20).length).toBe(1);
    await page.evaluate(address => (window as unknown as FixtureWindow).__walletFixture.setAccount(address), otherWallet.address);
    await expect(page.getByRole('heading', { name: 'Masuk dengan wallet institusi', exact: true })).toBeVisible();
    await expect(records).toHaveCount(0);
    const lateResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portal/config' && new URL(response.url()).searchParams.get('offset') === '20');
    fixture.releasePage();
    await (await lateResponse).finished();
    await expect.poll(() => serverWallet(context), { timeout: 20000 }).toBeNull();
    await expect(records).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toHaveCount(0);
  } finally { fixture.releasePage(); }
});

for (const width of [1280, 390]) test(`revocation confirmation is a centered accessible popup without scrolling at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 844 });
  const credentials = await openRevocationRecords(page, context);
  const rowButton = page.getByRole('button', { name: 'Cabut', exact: true }).first();
  const dialog = page.getByRole('dialog', { name: 'Cabut kredensial?', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Batal', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Konfirmasi pencabutan', exact: true });

  await rowButton.scrollIntoViewIfNeeded();
  const rowScroll = await page.evaluate(() => window.scrollY);
  await rowButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(credentials[0]!.credentialId, { exact: true })).toBeVisible();
  await expect(cancel).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(rowScroll);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(3);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 844 / 2)).toBeLessThan(3);
  await page.screenshot({ path: test.info().outputPath(`revocation-popup-${width}.png`), animations: 'disabled' });
  await cancel.press('Tab');
  await expect(confirm).toBeFocused();
  await confirm.press('Tab');
  await expect(cancel).toBeFocused();
  await cancel.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(rowButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(rowScroll);

  // Both entry points must open the same modal, even when the manual form is far below the first row.
  const manualId = `0x${'fe'.repeat(32)}`;
  await page.getByLabel('ID kredensial yang akan dicabut', { exact: true }).fill(manualId);
  const manualButton = page.getByRole('button', { name: 'Cabut kredensial', exact: true });
  await manualButton.scrollIntoViewIfNeeded();
  const manualScroll = await page.evaluate(() => window.scrollY);
  expect(manualScroll).toBeGreaterThan(rowScroll);
  await manualButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(manualId, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(manualScroll);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(manualButton).toBeFocused();
  await manualButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8); // Outside the dialog, on its backdrop.
  await expect(dialog).toBeHidden();
  await expect(manualButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(manualScroll);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => ['eth_estimateGas', 'eth_sendTransaction'].includes(request.method)))).toEqual([]);
});

test('revocation popup stays open during wallet confirmation and shows a rejected transaction inside the popup', async ({ page, context }) => {
  await openRevocationRecords(page, context);
  const rowButton = page.getByRole('button', { name: 'Cabut', exact: true }).first();
  await rowButton.click();
  const dialog = page.getByRole('dialog', { name: 'Cabut kredensial?', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Konfirmasi pencabutan', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Batal', exact: true });
  await page.evaluate(() => { (window as unknown as FixtureWindow).__walletFixture.holdTransaction = true; });
  await confirm.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => request.method === 'eth_sendTransaction').length)).toBe(1);
  await expect(confirm).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.releaseTransaction());
  await expect(dialog.getByRole('alert')).toHaveText('Permintaan dibatalkan di wallet. Tidak ada transaksi yang dikirim.');
  await expect(confirm).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(page.getByText('Kredensial telah dicabut.', { exact: false })).toHaveCount(0);
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(rowButton).toBeFocused();
});

test('revocation popup only dismisses outside its bounds when the viewport needs an internal scrollbar', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 320 });
  await openRevocationRecords(page, context);
  const rowButton = page.getByRole('button', { name: 'Cabut', exact: true }).first();
  await rowButton.click();
  const dialog = page.getByRole('dialog', { name: 'Cabut kredensial?', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const bounds = (await dialog.boundingBox())!;
  // A click inside the right border/scrollbar is not a backdrop click, even if its target is the dialog.
  await page.mouse.click(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('revocation-popup-short-viewport.png'), animations: 'disabled' });
  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
  await expect(rowButton).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => request.method === 'eth_sendTransaction'))).toEqual([]);
});

test('RainbowKit authenticates the selected EIP-6963 wallet and disconnect clears the server session', async ({ page, context }) => {
  await openSignIn(page);
  expect(await serverWallet(context)).toBeNull(); // Connecting alone is not authentication.
  await finishSignIn(page, context);
  const requests = await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests);
  expect(requests.filter(request => request.method === 'personal_sign').map(request => request.wallet)).toEqual([campusName]);
  await page.getByRole('tab', { name: 'Portal Penerbitan Ijazah Mahasiswa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siapkan data untuk ditinjau', exact: true })).toBeDisabled();
  await expect(page.getByText('Belum berwenang menerbitkan', { exact: false })).toBeVisible();
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'verifikasi_session')!;

  await page.getByRole('button', { name: /^Kelola wallet 0x/ }).click();
  await page.getByRole('button', { name: /Putuskan koneksi/ }).click();
  await expect(page.getByRole('button', { name: 'Hubungkan wallet', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
  await expect.poll(() => serverWallet(context)).toBeNull();
  expect((await context.cookies()).find(cookie => cookie.name === 'verifikasi_session')?.value).toBe(sessionCookie.value);
});

test('the topbar wallet button signs in from any page and the portal reuses that session', async ({ page, context }) => {
  await page.goto('/verifikasi');
  await page.getByRole('button', { name: 'Masuk dengan wallet penerbit', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(campusName) }).click();
  await finishSignIn(page, context);
  await page.getByRole('link', { name: 'Portal Penerbit', exact: true }).click();
  await page.getByRole('tab', { name: 'Portal Penerbitan Ijazah Mahasiswa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toBeVisible();
  const requests = await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests);
  expect(requests.filter(request => request.method === 'personal_sign')).toHaveLength(1);
});

test('changing accounts invalidates portal authentication and requires a new signature for the new wallet', async ({ page, context }) => {
  await openSignIn(page);
  await finishSignIn(page, context);
  await page.evaluate(address => (window as unknown as FixtureWindow).__walletFixture.setAccount(address), otherWallet.address);
  await expect(page.getByRole('heading', { name: 'Masuk dengan wallet institusi', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
  await expect.poll(() => serverWallet(context)).toBeNull();
  await page.getByRole('button', { name: 'Masuk dengan wallet', exact: true }).click();
  await finishSignIn(page, context, otherWallet.address);
});

test('reloading restores a matching wallet without another signature and clears a mismatched wallet session', async ({ page, context }) => {
  await openSignIn(page);
  await finishSignIn(page, context);
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'verifikasi_session')!;
  await page.reload();
  await expect(page.getByRole('button', { name: /^Kelola wallet 0x/ })).toBeVisible();
  expect(await serverWallet(context)).toBe(campusWallet.address);
  expect((await context.cookies()).find(cookie => cookie.name === 'verifikasi_session')?.value).toBe(sessionCookie.value);
  const requests = await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests);
  expect(requests.filter(request => request.method === 'personal_sign').map(request => request.wallet)).toEqual([campusName]);
  await expect(page.getByRole('button', { name: 'Kirim pesan', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Portal Penerbitan Ijazah Mahasiswa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siapkan data untuk ditinjau', exact: true })).toBeDisabled();

  // A separate browser session must remain anonymous, even while the first is restored.
  const foreign = await context.browser()!.newContext({ baseURL: new URL(page.url()).origin });
  try {
    expect((await foreign.request.get('/api/session')).status()).toBe(200);
    expect(await serverWallet(foreign)).toBeNull();
  } finally { await foreign.close(); }

  // Simulate changing the extension account while this page was closed: persisted
  // connector metadata must not restore the old wallet's server authorization.
  await page.evaluate(address => {
    const key = 'verifikasi-test-wallet-0';
    const state = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({ ...state, address }));
  }, otherWallet.address);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Masuk dengan wallet', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
  await expect.poll(() => serverWallet(context)).toBeNull();
  const afterMismatch = await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests);
  expect(afterMismatch.filter(request => request.method === 'personal_sign')).toHaveLength(1);
});

test('leaving Sepolia invalidates the session and switching back still requires sign-in', async ({ page, context }) => {
  await openSignIn(page);
  await finishSignIn(page, context);
  await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.setChain('0x1'));
  await expect(page.getByRole('button', { name: 'Gunakan Sepolia', exact: true })).toBeVisible();
  await expect.poll(() => serverWallet(context)).toBeNull();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gunakan Sepolia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Masuk dengan wallet', exact: true })).toBeVisible();
  expect(await serverWallet(context)).toBeNull();
  await page.getByRole('button', { name: 'Masuk dengan wallet', exact: true }).click();
  await finishSignIn(page, context);
});

test('rejecting a wallet message leaves the portal anonymous and permits a later retry', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignIn(page, test.info().outputPath('rainbowkit-wallet-picker-mobile.png'));
  await page.evaluate(() => { (window as unknown as FixtureWindow).__walletFixture.rejectSignature = true; });
  await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => request.method === 'personal_sign').length)).toBe(1);
  // RainbowKit treats user cancellation as a return to idle, without an error banner.
  await expect(page.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeEnabled();
  expect(await serverWallet(context)).toBeNull();
  await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as FixtureWindow).__walletFixture.rejectSignature = false; });
  await finishSignIn(page, context);
  const attempts = await page.evaluate(() => (window as unknown as FixtureWindow).__walletFixture.requests.filter(request => request.method === 'personal_sign'));
  expect(attempts.map(request => request.wallet)).toEqual([campusName, campusName]);
});

test.describe('without an installed wallet or WalletConnect project', () => {
  test.use({ mockWallets: false });

  test('RainbowKit offers a usable browser-wallet installation link', async ({ page, context }) => {
    await page.goto('/penerbit');
    expect(await page.evaluate(() => 'ethereum' in window)).toBe(false);
    await page.getByRole('button', { name: 'Hubungkan wallet', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Hubungkan Dompet', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Wallet browser', exact: true }).click();
    await expect(dialog.locator('a[href="https://rainbow.me/extension"]')).toBeVisible();
    expect(await serverWallet(context)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Terbitkan ijazah mahasiswa', exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('rainbowkit-install-wallet.png'), fullPage: true, animations: 'disabled' });
  });
});
