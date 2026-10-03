import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { getBytes, Wallet } from 'ethers';
import { generateDiploma } from '../../src/server/diploma-pdf';
import { readFile } from 'node:fs/promises';

const test = base.extend<{ mockWallets: boolean }>({ mockWallets: [true, { option: true }] });
// Public, disposable fixtures. No wallet extension, testnet funds, or RPC is used.
const campusWallet = new Wallet(`0x${'11'.repeat(32)}`);
const otherWallet = new Wallet(`0x${'22'.repeat(32)}`);
const campusName = 'Dompet Kampus Uji';

for (const width of [1280, 800, 390]) {
  test(`private diploma controls and browser download at ${width}px (mock document API)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    const id = `0x${'ab'.repeat(32)}`;
    const issuerId = `0x${'cd'.repeat(32)}` as `0x${string}`;
    const pdf = await generateDiploma({ credentialId: id, origin: 'http://localhost:3000', graduationDate: '2026-08-15', createdAt: '2026-09-25T00:00:00Z', profile: { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId, issuerDisplayName: 'Universitas Contoh Indonesia', fullName: 'ANDI PRATAMA', diplomaNumber: 'IF-2026-001', studyProgram: 'INFORMATIKA' } });
    await page.route('**/api/portal/config*', route => route.fulfill({ json: { mode: 'testnet', chainId: 11155111, contractAddress: `0x${'56'.repeat(20)}`, portal: { wallet: campusWallet.address, issuer: { exists: true, active: true, signerActive: true, issuerId, name: 'Universitas Contoh Indonesia' }, admin: width === 1280, credentials: [{ credentialId: id, issuedAt: '2026-09-25T00:00:00Z', confirmed: true, revoked: false }], offset: 0, total: 1 } } }));
    let created = false; let polls = 0;
    await page.route(`**/api/credentials/${id}/document`, async route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ graduationDate: '2026-08-15' });
        expect(route.request().headers()['x-csrf-token']).toBeTruthy();
        created = true;
        return route.fulfill({ status: 202, json: { status: 'VERIFYING' } });
      }
      return route.fulfill({ json: { status: !created ? 'NOT_CREATED' : ++polls < 2 ? 'VERIFYING' : 'READY' } });
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
    await page.getByLabel('Tanggal lulus', { exact: true }).fill('2026-08-15');
    await page.getByRole('button', { name: 'Buat PDF ijazah', exact: true }).click();
    await expect(page.getByText('Memeriksa dokumen', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`diploma-${width}.png`), fullPage: true });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Unduh PDF', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('ijazah-ababababab.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
    await page.reload();
    await recordsTab.click();
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeVisible();
    await page.evaluate(address => (window as unknown as FixtureWindow).__walletFixture.setAccount(address), otherWallet.address);
    await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toHaveCount(0);
  });
}
interface WalletFixture {
  setAccount: (address: string) => void;
  setChain: (chainId: string) => void;
  rejectSignature: boolean;
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
      requests, rejectSignature: false,
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
  await expect(page.getByRole('button', { name: 'Kirim pesan', exact: true })).toBeEnabled();
}

async function finishSignIn(page: Page, context: BrowserContext, address = campusWallet.address) {
  await page.getByRole('button', { name: 'Kirim pesan', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Kelola wallet 0x/ })).toBeVisible();
  await expect.poll(() => serverWallet(context)).toBe(address);
}

test.beforeEach(async ({ page, mockWallets }) => {
  await blockExternalRequests(page);
  if (mockWallets) await installWallets(page);
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
