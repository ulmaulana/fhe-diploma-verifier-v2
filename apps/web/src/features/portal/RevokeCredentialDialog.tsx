'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { AlertIcon, SpinnerIcon } from '@/features/shared/icons';
import styles from './PortalPage.module.css';

interface RevokeCredentialDialogProps {
  credentialId: string;
  busy: boolean;
  error: string;
  onCancel(): void;
  onConfirm(): void;
}

function isBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

export function RevokeCredentialDialog({ credentialId, busy, error, onCancel, onConfirm }: RevokeCredentialDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const backdropPress = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog
    ref={dialogRef}
    className={styles.revokeDialog}
    aria-labelledby="revoke-dialog-title"
    aria-describedby="revoke-dialog-description revoke-dialog-credential"
    aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onPointerDown={event => { backdropPress.current = isBackdrop(event); }}
    onClick={event => {
      if (backdropPress.current && isBackdrop(event) && !busy) onCancel();
      backdropPress.current = false;
    }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
  >
    <div className={styles.revokeContent}>
      <span className={styles.revokeEmblem} aria-hidden="true"><AlertIcon size={28}/></span>
      <h2 id="revoke-dialog-title">Cabut kredensial?</h2>
      <p id="revoke-dialog-description" className={styles.revokeDescription}>Pencabutan permanen dan tidak dapat dibatalkan. Kredensial berikut akan berstatus dicabut.</p>
      <div id="revoke-dialog-credential" className={styles.revokeTarget}><span>ID kredensial</span><code>{credentialId}</code></div>
      {error && <div className={styles.revokeError} role="alert">{error}</div>}
      {busy && <p className={styles.revokeProgress} role="status">Menunggu konfirmasi wallet dan jaringan…</p>}
      <div className={styles.revokeActions}>
        <button ref={cancelRef} type="button" className="button secondary" onClick={onCancel} disabled={busy}>Batal</button>
        <button type="button" className="button danger-button" onClick={onConfirm} disabled={busy}>{busy && <SpinnerIcon size={17} className="spin"/>}Konfirmasi pencabutan</button>
      </div>
    </div>
  </dialog>;
}
