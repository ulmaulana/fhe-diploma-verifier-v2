'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { SpinnerIcon, WalletIcon } from '@/features/shared/icons';
import { walletSlotId } from './wallet-hint';
import { PortalWalletProvider, usePortalWallet } from './WalletProvider';

/**
 * Wallet stack loaded on demand by the app shell. The topbar button and the issuer portal
 * share this single provider: a second authentication controller would clear the session.
 */
export function WalletHost({ children, autoOpen }: { children?: ReactNode; autoOpen: boolean }) {
  return <PortalWalletProvider>{!children && <WalletError/>}{children}<TopbarWallet autoOpen={autoOpen}/></PortalWalletProvider>;
}

function WalletError() {
  const { error } = usePortalWallet();
  return error ? <div className="error-message" role="alert">{error}</div> : null;
}

// Rendered into the topbar slot; React context still flows through the portal.
function TopbarWallet({ autoOpen }: { autoOpen: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(walletSlotId)), []);
  return slot && createPortal(<WalletButton autoOpen={autoOpen}/>, slot);
}

function WalletButton({ autoOpen }: { autoOpen: boolean }) {
  const { switchChainAsync, isPending } = useSwitchChain();
  const opened = useRef(!autoOpen);
  return <ConnectButton.Custom>{({ account, chain, mounted, authenticationStatus, openConnectModal, openAccountModal }) => {
    if (!mounted || authenticationStatus === 'loading') return <button type="button" className="wallet-button" disabled><SpinnerIcon size={18} className="spin"/><span className="wallet-label">Menyiapkan wallet…</span></button>;
    if (account && chain?.unsupported) {
      const label = isPending ? 'Mengganti jaringan…' : 'Gunakan Sepolia';
      return <button type="button" className="wallet-button" disabled={isPending} aria-label={`${label} untuk wallet penerbit`} onClick={() => void switchChainAsync({ chainId: sepolia.id }).catch(() => {})}>
        <WalletIcon size={19}/><span className="wallet-label">{label}</span></button>;
    }
    if (account && authenticationStatus === 'authenticated') return <button type="button" className="wallet-button" onClick={openAccountModal} aria-label={`Kelola wallet ${account.displayName}`}>
      <WalletIcon size={19}/><span className="wallet-label">{account.displayName}</span><span className="wallet-dot"/></button>;
    return <>
      <button type="button" className="wallet-button" onClick={openConnectModal} aria-label="Masuk dengan wallet penerbit"><WalletIcon size={19}/><span className="wallet-label">Masuk dengan wallet</span></button>
      <OpenOnce opened={opened} open={openConnectModal}/>
    </>;
  }}</ConnectButton.Custom>;
}

/** Opens the connect-and-sign modal once when the shell loaded the wallet from a button click. */
function OpenOnce({ opened, open }: { opened: RefObject<boolean>; open?: () => void }) {
  useEffect(() => {
    if (opened.current || !open) return;
    // RainbowKit closes its modals when authentication settles to unauthenticated, in an
    // effect that runs after this one; open on the next task so the modal stays up.
    const timer = setTimeout(() => { opened.current = true; open(); });
    return () => clearTimeout(timer);
  }, [opened, open]);
  return null;
}
