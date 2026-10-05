'use client';

import { useEffect, useRef, useState } from 'react';
import { DownloadIcon, SpinnerIcon } from '@/features/shared/icons';
import { api } from '@/features/shared/api';
import styles from './PortalPage.module.css';

export interface DocumentState { status: 'NOT_CREATED' | 'PREPARING' | 'VERIFYING' | 'ARCHIVING' | 'READY' | 'FAILED'; graduationDate?: string; dateFrozen?: boolean; reason?: string; errorCode?: string; downloadUrl?: string }
const phases = ['Menyiapkan PDF', 'Menyimpan arsip', 'Siap diunduh'];
const phaseIndex = { PREPARING: 0, VERIFYING: 0, ARCHIVING: 1, READY: 2 };

/** `initial` comes with the portal rows, so the first render is final and only running jobs poll. */
export function CredentialDocument({ credentialId, frozenDate, automatic = false, compact = false, initial }: { credentialId: string; frozenDate?: string; automatic?: boolean; compact?: boolean; initial?: DocumentState }) {
  const [document, setDocument] = useState<DocumentState | null>(initial ?? null);
  const [date, setDate] = useState(frozenDate || '');
  const [expanded, setExpanded] = useState(!compact);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const mounted = useRef(false); const submitted = useRef(false); const key = useRef('');
  const endpoint = `/api/credentials/${credentialId}/document`;
  useEffect(() => {
    mounted.current = true; let alive = true; let timer: ReturnType<typeof setTimeout>;
    async function apply(next: DocumentState) {
      setDocument(next);
      if (next.graduationDate) setDate(value => next.dateFrozen ? next.graduationDate! : value || next.graduationDate!);
      if (automatic && frozenDate && next.status === 'NOT_CREATED' && !submitted.current) { submitted.current = true; await create(frozenDate); }
      if (alive && ['PREPARING', 'VERIFYING', 'ARCHIVING'].includes(next.status)) timer = setTimeout(poll, 8000);
    }
    async function poll() {
      try {
        const next = await api<DocumentState>(endpoint);
        if (alive) await apply(next);
      } catch (err) { if (alive) { setError(err instanceof Error ? err.message : 'Status dokumen belum dapat dibaca.'); timer = setTimeout(poll, 15000); } }
    }
    if (refresh === 0 && initial) void apply(initial); else void poll();
    return () => { alive = false; mounted.current = false; clearTimeout(timer); };
  }, [endpoint, refresh]);

  async function create(value = date) {
    if (busy) return;
    setBusy(true); setError(''); setDocument({ status: 'PREPARING' });
    key.current ||= crypto.randomUUID();
    try {
      const next = await api<DocumentState>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current }, body: JSON.stringify({ graduationDate: value }) });
      if (mounted.current) { setDocument(next); setRefresh(value => value + 1); }
    } catch (err) { if (mounted.current) { setError(err instanceof Error ? err.message : 'Pembuatan PDF belum berhasil.'); if (compact) setExpanded(true); } }
    finally { if (mounted.current) { setBusy(false); setRefresh(value => value + 1); } }
  }
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${endpoint}/download`, { cache: 'no-store' });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Unduhan belum tersedia.'); }
      const blob = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = `ijazah-${credentialId.slice(2, 12)}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { if (mounted.current) { setError(err instanceof Error ? err.message : 'Unduhan belum tersedia.'); if (compact) setExpanded(true); } }
    finally { if (mounted.current) setBusy(false); }
  }
  const running = document && ['PREPARING', 'VERIFYING', 'ARCHIVING'].includes(document.status);
  const form = <form onSubmit={event => { event.preventDefault(); void create(); }}>
    {!frozenDate && !document?.dateFrozen && <label className="form-field">Tanggal lulus sesuai data penerbitan<input type="date" required value={date} disabled={busy} onChange={event => { setDate(event.target.value); key.current = ''; }}/></label>}
    <p className={styles.hint}>PDF dibuat dari data penerbitan dan disimpan sebagai arsip privat. Pastikan tanggal lulus benar; tanggal dibekukan saat PDF dibuat. Pemeriksaan isi dokumen tersedia melalui halaman verifikasi.</p>
    <button className={`button primary${compact ? ' small-button' : ''}`} disabled={busy || !date}>{busy ? <SpinnerIcon size={16} className="spin"/> : null}{document?.status === 'FAILED' ? 'Coba kembali' : running ? 'Lanjutkan pembuatan PDF' : 'Buat PDF ijazah'}</button>
  </form>;
  if (compact) return <div className={`${styles.document} ${styles.documentCompact}`} data-expanded={expanded && (document?.status !== 'READY' || Boolean(error))} aria-label="PDF ijazah">
    {!document && !error ? <span className={`${styles.bone} ${styles.boneButton}`} role="status"><span className="visually-hidden">Memuat status PDF…</span></span> : <>
      {document?.status === 'READY' && <button type="button" className="button secondary small-button" title="Unduh PDF ijazah dari arsip privat" onClick={download} disabled={busy}><DownloadIcon size={14}/>Unduh PDF</button>}
      {running && <span className={styles.documentProgress} role="status"><SpinnerIcon size={14} className="spin"/>{phases[phaseIndex[document.status as keyof typeof phaseIndex]]}</span>}
      {!expanded && error && <span className={styles.documentUnavailable} role="status">PDF tidak tersedia</span>}
      {!expanded && document?.status === 'FAILED' && !error && <span className={styles.documentUnavailable} role="status">PDF gagal dibuat</span>}
      {!expanded && (!running || error || document?.errorCode) && (document?.status !== 'READY' || error) && <button type="button" className="button secondary small-button" onClick={() => setExpanded(true)} aria-expanded={false}>{error ? 'Detail PDF' : document?.status === 'FAILED' ? 'Kelola PDF' : 'Buat PDF ijazah'}</button>}
      {expanded && (document?.status !== 'READY' || error) && <>
        <button type="button" className="button secondary small-button" onClick={() => setExpanded(false)} disabled={busy} aria-expanded={true}>Tutup detail PDF</button>
        {document?.reason && <p className={styles.documentReason} role="status">{document.reason}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {document && document.status !== 'READY' && (!running || document.errorCode || error) && form}
      </>}
    </>}
  </div>;
  return <div className={styles.document} aria-label="PDF ijazah">
    {!document && !error ? <span className={`${styles.bone} ${styles.boneBar}`} role="status"><span className="visually-hidden">Memuat status PDF…</span></span> : document?.status === 'READY' ? <><span className={styles.hint}>PDF siap diunduh · Arsip privat</span><button className="button primary" onClick={download} disabled={busy}><DownloadIcon size={16}/>{compact ? 'Unduh PDF' : 'Unduh PDF ijazah'}</button></> : <>
      {running && <div className={styles.status} role="status"><SpinnerIcon size={15} className="spin"/><span>{phases[phaseIndex[document.status as keyof typeof phaseIndex]]}</span></div>}
      {!compact && <ol className={styles.documentSteps} aria-label="Tahap PDF">{phases.map((phase, i) => <li key={phase} aria-current={document && document.status in phaseIndex && phaseIndex[document.status as keyof typeof phaseIndex] === i ? 'step' : undefined}>{phase}</li>)}</ol>}
      {document?.reason && <p role="status">{document.reason}</p>}
      {(!running || Boolean(document?.errorCode) || Boolean(error)) && <>
        {!expanded ? <button className="button secondary small-button" disabled={!document} onClick={() => setExpanded(true)}>Buat PDF ijazah</button> : form}
      </>}
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
