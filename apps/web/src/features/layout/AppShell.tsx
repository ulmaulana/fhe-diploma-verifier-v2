'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GuideSearch } from '@/features/help/GuideSearch';
import { hasStoredWalletConnection, walletSlotId } from '@/features/portal/wallet-hint';
import { ArrowRightIcon, BookIcon, ChevronLeftIcon, CloseIcon, HistoryIcon, HomeIcon, InstitutionIcon, MenuIcon, ShieldCheckIcon, SpinnerIcon, VerifyRecordIcon, WalletIcon } from '@/features/shared/icons';

// Loaded only for the issuer portal, a wallet sign-in request, or a browser with a stored
// connection, so the QR record page never downloads the wallet stack.
const WalletHost = dynamic(() => import('@/features/portal/WalletHost').then(m => m.WalletHost));

const links = [{ href: '/', label: 'Beranda', icon: HomeIcon }, { href: '/verifikasi', label: 'Verifikasi Ijazah', icon: VerifyRecordIcon }, { href: '/riwayat', label: 'Riwayat Saya', icon: HistoryIcon }, { href: '/panduan', label: 'Panduan', icon: BookIcon }];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false); const [collapsed,setCollapsed]=useState(false);
  const [walletRequested, setWalletRequested] = useState(false); const [walletAutoOpen, setWalletAutoOpen] = useState(false);
  const isPortal = path.startsWith('/penerbit'); const walletActive = isPortal || walletRequested;
  // The home hero runs under the topbar, so the shell lifts the topbar onto it there.
  const isHome = path === '/';
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar=useRef<HTMLElement>(null);
  useEffect(() => { if (!open) return; sidebar.current?.querySelector<HTMLButtonElement>('.mobile-close')?.focus(); const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } if(event.key==='Tab'){const targets=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a,button:not([disabled])')||[]).filter(e=>e.offsetParent!==null);const first=targets[0],last=targets[targets.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}} }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [open]);
  // Once loaded the wallet stays mounted, so leaving the portal keeps the signed-in state.
  useEffect(() => { if (isPortal || hasStoredWalletConnection()) setWalletRequested(true); }, [isPortal]);
  const main = <main id="main" className="main-content">{children}<footer className="footer"><span>Verifikasi dokumen dengan perlindungan data</span><span className="technology"><span className="cyan-dot"/>Zama FHEVM</span></footer></main>;
  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${isHome?'home-shell':''}`}>
    <a className="skip-link" href="#main">Lewati ke konten</a>
    {open && <button className="drawer-backdrop" onClick={() => setOpen(false)} aria-label="Tutup navigasi" />}
    <aside ref={sidebar} id="app-sidebar" className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Navigasi utama">
      <svg className="sidebar-waves" viewBox="0 0 240 900" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 540c58-44 104 30 170-8 34-20 52-52 70-60v428H0z"/><path d="M0 700c70-36 120 12 172-14 30-15 50-36 68-40v254H0z"/><path d="M128 0c58 4 104 34 112 96V0z"/></svg>
      <div className="brand-row"><Link className="brand" href="/" aria-label="verifikasi, ke beranda" onClick={() => setOpen(false)}><svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.2 20.5 7.1v9.8L12 21.8l-8.5-4.9V7.1z"/></svg><span className="wordmark">verifikasi</span></Link><button className="icon-button mobile-close" aria-label="Tutup menu" onClick={() => {setOpen(false);menuButton.current?.focus();}}><CloseIcon size={21} /></button></div>
      <nav>{links.map(({href,label,icon: Icon}, i) => <div key={href} className={i === 3 ? 'nav-divider' : ''}><Link href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href || (href === '/verifikasi' && path.startsWith('/c/')) ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined}><Icon size={21} /><span className="nav-label">{label}</span></Link></div>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheckIcon size={20}/><span>Data Anda<br/>tetap terlindungi.</span></div><Link href="/penerbit" className="button portal-link" onClick={() => setOpen(false)}><InstitutionIcon size={18}/><span className="portal-label">Portal Penerbit</span></Link></div>
    </aside>
    <button type="button" className="sidebar-tab" aria-controls="app-sidebar" aria-expanded={!collapsed} aria-label={collapsed?'Perluas sidebar':'Ringkas sidebar'} title={collapsed?'Perluas sidebar':'Ringkas sidebar'} onClick={() => setCollapsed(!collapsed)}><svg className="sidebar-tab-shape" viewBox="0 0 26 132" aria-hidden="true" focusable="false"><path d="M0 0c0 30 26 34 26 66S0 102 0 132z"/></svg><ChevronLeftIcon size={20} className="sidebar-tab-chevron"/></button>
    <div className="app-content" inert={open}><header className="topbar"><button ref={menuButton} className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Buka navigasi" aria-expanded={open}><MenuIcon/></button><GuideSearch/>
        {/* WalletHost portals the live button here; this placeholder hides once it arrives. */}
        <div id={walletSlotId} className="wallet-slot"><button type="button" className="wallet-button wallet-fallback" aria-label="Masuk dengan wallet penerbit" aria-busy={walletActive} disabled={walletActive} onClick={() => { setWalletAutoOpen(true); setWalletRequested(true); }}>{walletActive ? <SpinnerIcon size={18} className="spin"/> : <WalletIcon size={19}/>}<span className="wallet-label">Masuk dengan wallet</span><ArrowRightIcon size={18} className="wallet-arrow"/></button></div></header>
      {/* The portal page reads the wallet context, so on /penerbit the provider also wraps the page. */}
      {walletActive && <WalletHost autoOpen={walletAutoOpen}>{isPortal && main}</WalletHost>}
      {!isPortal && main}
    </div>
  </div>;
}
