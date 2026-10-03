'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ConnectButton, RainbowKitAuthenticationProvider, RainbowKitProvider,
  connectorsForWallets, createAuthenticationAdapter, lightTheme,
} from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, useAccount, useConfig, useSwitchChain } from 'wagmi';
import { getAccount, watchAccount } from 'wagmi/actions';
import { sepolia } from 'wagmi/chains';
import type { Eip1193Provider } from 'ethers';
import { api, getSession } from '@/features/shared/api';
import { createWalletAuthentication, walletIdentityKey, type WalletAuthenticationState, type WalletIdentity } from './wallet-authentication';

function browserWallet() {
  return {
    ...injectedWallet(), name: 'Wallet browser',
    installed: typeof window !== 'undefined' && 'ethereum' in window,
    downloadUrls: { browserExtension: 'https://rainbow.me/extension' },
  };
}

function walletConfig() {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || '';
  return createConfig({
    chains: [sepolia], ssr: true,
    // EIP-6963 discovers installed wallets without a WalletConnect project.
    // Mobile/QR connectors are enabled only with an actual configured project ID.
    connectors: connectorsForWallets([{ groupName: 'Wallet', wallets: projectId
      ? [rainbowWallet, metaMaskWallet, walletConnectWallet, injectedWallet]
      : [browserWallet] }], { appName: 'verifikasi', projectId }),
    transports: { [sepolia.id]: http() },
  });
}

interface WalletSession {
  wallet: string;
  selection: string;
  revision: number;
  /** The persisted connector or server session is still being restored on first load. */
  restoring: boolean;
  error?: string;
  getProvider: () => Promise<Eip1193Provider>;
}
const WalletContext = createContext<WalletSession | null>(null);
export function usePortalWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('Portal wallet provider is missing');
  return context;
}

function WalletAuthentication({ children }: { children: ReactNode }) {
  const config = useConfig();
  const account = useAccount();
  const [state, setState] = useState<WalletAuthenticationState>({ wallet: null, loading: true, revision: 0 });
  const activeSession = useRef(state);
  const getIdentity = useMemo(() => (): WalletIdentity | null => {
    const current = getAccount(config);
    return current.status === 'connected' && current.address && current.chainId && current.connector
      ? { address: current.address, chainId: current.chainId, connectorId: current.connector.uid }
      : null;
  }, [config]);
  const [authentication] = useState(() => createWalletAuthentication({
    getIdentity, request: api, bootstrap: () => getSession(),
    onChange: next => { activeSession.current = next; setState(next); },
  }));
  useEffect(() => {
    const sync = () => {
      const status = getAccount(config).status;
      if (status !== 'reconnecting' && status !== 'connecting') void authentication.sync().catch(() => {});
    };
    const unwatch = watchAccount(config, { onChange: sync });
    sync();
    return unwatch;
  }, [authentication, config]);
  const adapter = useMemo(() => createAuthenticationAdapter({
    getNonce: authentication.getNonce,
    createMessage: authentication.createMessage,
    verify: authentication.verify,
    // RainbowKit invokes signOut without awaiting it; the controller exposes failures in the portal.
    signOut: () => authentication.signOut().catch(() => {}),
  }), [authentication]);
  const identity = account.status === 'connected' && account.address && account.chainId && account.connector
    ? { address: account.address, chainId: account.chainId, connectorId: account.connector.uid } : null;
  const selection = walletIdentityKey(identity);
  const wallet = identity?.chainId === sepolia.id && state.wallet?.toLowerCase() === identity.address.toLowerCase()
    ? state.wallet : '';
  async function getProvider(): Promise<Eip1193Provider> {
    const current = getIdentity();
    const authenticated = () => activeSession.current.revision === state.revision &&
      activeSession.current.wallet?.toLowerCase() === wallet.toLowerCase();
    if (!wallet || !authenticated() || !current || current.chainId !== sepolia.id || current.address.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error('Masuk kembali dengan wallet yang dipilih pada jaringan Sepolia.');
    }
    const key = walletIdentityKey(current);
    const provider = await getAccount(config).connector?.getProvider();
    if (!provider || typeof provider !== 'object' || !('request' in provider) || typeof provider.request !== 'function') {
      throw new Error('Koneksi wallet belum tersedia. Hubungkan kembali wallet Anda.');
    }
    const selected = provider as Eip1193Provider;
    const [addresses, chain] = await Promise.all([
      selected.request({ method: 'eth_accounts' }), selected.request({ method: 'eth_chainId' }),
    ]);
    if (!authenticated() || key !== walletIdentityKey(getIdentity()) || !Array.isArray(addresses) ||
      String(addresses[0]).toLowerCase() !== current.address.toLowerCase() || Number(chain) !== sepolia.id) {
      throw new Error('Wallet atau jaringan berubah. Hubungkan kembali dan tinjau ulang data.');
    }
    return selected;
  }
  const restoring = state.loading && state.revision <= 1;
  return <WalletContext.Provider value={{ wallet, selection, revision: state.revision, restoring, error: state.error, getProvider }}>
    {/* Only initial restoration uses loading: RainbowKit closes its sign-in modal on loading -> unauthenticated. */}
    <RainbowKitAuthenticationProvider adapter={adapter} status={restoring ? 'loading' : wallet ? 'authenticated' : 'unauthenticated'}>
      <RainbowKitProvider locale="id-ID" initialChain={sepolia} modalSize="compact"
        theme={{ ...lightTheme({ accentColor: '#17191d', accentColorForeground: '#fff', borderRadius: 'large' }), fonts: { body: 'Hind, "Segoe UI", Arial, sans-serif' } }}>
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  </WalletContext.Provider>;
}

export function PortalWalletProvider({ children }: { children: ReactNode }) {
  const [config] = useState(walletConfig);
  // Wait for Wagmi's persisted connector to reconnect before restoring the server session.
  const [initialState] = useState(() => ({ ...config.state, status: 'reconnecting' as const }));
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={config} initialState={initialState}><QueryClientProvider client={queryClient}>
    <WalletAuthentication>{children}</WalletAuthentication>
  </QueryClientProvider></WagmiProvider>;
}

export function PortalWalletButton({ disabled = false }: { disabled?: boolean }) {
  const { switchChainAsync, isPending, error } = useSwitchChain();
  return <ConnectButton.Custom>{({ account, chain, mounted, authenticationStatus, openConnectModal, openAccountModal }) => {
    const ready = mounted && authenticationStatus !== 'loading';
    // RainbowKit's chain modal requires authentication; switching must also work before sign-in.
    if (account && chain?.unsupported) return <>
      <button type="button" className="button primary" disabled={!ready || disabled || isPending}
        onClick={() => void switchChainAsync({ chainId: sepolia.id }).catch(() => {})}>
        {isPending ? 'Mengganti jaringan…' : 'Gunakan Sepolia'}
      </button>
      {error && <p role="alert">Jaringan belum berubah. Pilih Sepolia di wallet, lalu coba lagi.</p>}
    </>;
    const authenticated = account && authenticationStatus === 'authenticated';
    return <button type="button" className={`button ${authenticated ? 'secondary small-button' : 'primary'}`} disabled={!ready || disabled}
      onClick={authenticated ? openAccountModal : openConnectModal}>
      {!ready ? 'Menyiapkan wallet…' : authenticated ? 'Kelola wallet' : account ? 'Masuk dengan wallet' : 'Hubungkan wallet'}
    </button>;
  }}</ConnectButton.Custom>;
}
