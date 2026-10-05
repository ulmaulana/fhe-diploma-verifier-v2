'use client';

import type { CredentialSummary } from '@verifikasi/chain';
import { formatTime, shortId } from '@/features/shared/api';
import { CredentialDocument, type DocumentState } from './CredentialDocument';
import styles from './PortalPage.module.css';

export const CREDENTIALS_PER_PAGE = 20;

interface Props {
  credentials: CredentialSummary[];
  documents?: Record<string, DocumentState>;
  offset: number;
  total: number;
  authorized: boolean;
  busy: boolean;
  loading: boolean;
  walletKey: string;
  onPageChange: (offset: number) => void;
  onRevoke: (credentialId: string) => void;
}

function pageNumbers(current: number, total: number) {
  // Keep the ends and current neighbours reachable without a long strip of buttons.
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 1); page <= Math.min(total, current + 1); page++) pages.add(page);
  if (current <= 3) for (let page = 1; page <= Math.min(4, total); page++) pages.add(page);
  if (current >= total - 2) for (let page = Math.max(1, total - 3); page <= total; page++) pages.add(page);
  return [...pages].sort((a, b) => a - b);
}

export function CredentialRecords({ credentials, documents, offset, total, authorized, busy, loading, walletKey, onPageChange, onRevoke }: Props) {
  const currentPage = Math.floor(offset / CREDENTIALS_PER_PAGE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / CREDENTIALS_PER_PAGE));
  const pages = pageNumbers(currentPage, totalPages);
  const disabled = busy || loading;
  return <div role="region" aria-label="Daftar ijazah mahasiswa" className={styles.records} aria-busy={loading}>
    <p className={styles.recordsSummary} role="status">
      {credentials.length ? `Menampilkan ${offset + 1}–${offset + credentials.length} dari ${total} ijazah` : 'Menampilkan 0 dari 0 ijazah'}
      <span>{loading ? 'Memuat halaman…' : '20 data per halaman'}</span>
    </p>
    {credentials.length ? <table className={styles.recordsTable} role="table">
      <caption className="visually-hidden">Data ijazah mahasiswa</caption>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader" className={styles.recordNumber}>No.</th>
        <th scope="col" role="columnheader">Rekaman ijazah</th>
        <th scope="col" role="columnheader" className={styles.recordStatus}>Status</th>
        <th scope="col" role="columnheader" className={styles.recordActionsCell}>Aksi</th>
      </tr></thead>
      <tbody role="rowgroup">{credentials.map((credential, index) => <tr key={credential.credentialId} role="row">
        <td role="cell" className={styles.recordNumber}>{offset + index + 1}</td>
        <td role="cell" className={styles.recordIdentity}>
          <a href={`/c/${credential.credentialId}`} title={credential.credentialId}>{shortId(credential.credentialId)}</a>
          <time dateTime={credential.issuedAt}>{formatTime(credential.issuedAt)}</time>
        </td>
        <td role="cell" className={styles.recordStatus}><span className={`history-status ${credential.revoked ? 'danger' : credential.confirmed ? 'success' : 'warning'}`}>{credential.revoked ? 'Dicabut' : credential.confirmed ? 'Tercatat' : 'Menunggu konfirmasi'}</span></td>
        <td role="cell" className={styles.recordActionsCell}><div className={styles.recordActions}>
          <a className="button secondary small-button" href={`/c/${credential.credentialId}`}>Lihat rekaman</a>
          {!credential.revoked && <button type="button" className="button secondary small-button" disabled={disabled} onClick={() => onRevoke(credential.credentialId)}>Cabut</button>}
          {authorized && !credential.revoked && <CredentialDocument key={`${walletKey}-${credential.credentialId}`} credentialId={credential.credentialId} initial={documents?.[credential.credentialId.toLowerCase()]} compact/>}
        </div></td>
      </tr>)}</tbody>
    </table> : <p className={styles.recordsEmpty}>Belum ada ijazah mahasiswa yang diterbitkan oleh institusi ini.</p>}
    <div className={styles.recordsFooter}>
      <span className={styles.pagePosition}>Halaman {currentPage} dari {totalPages}</span>
      <nav className={styles.pagination} aria-label="Halaman data ijazah">
        <button type="button" className="button secondary small-button" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(offset - CREDENTIALS_PER_PAGE)}>Sebelumnya</button>
        <div className={styles.pageNumbers}>{pages.map((page, index) => <span key={page}>
          {index > 0 && page - pages[index - 1]! > 1 && <span className={styles.pageGap} aria-hidden="true">…</span>}
          <button type="button" className={styles.pageButton} aria-label={`Halaman ${page}`} aria-current={page === currentPage ? 'page' : undefined} disabled={disabled || page === currentPage} onClick={() => onPageChange((page - 1) * CREDENTIALS_PER_PAGE)}>{page}</button>
        </span>)}</div>
        <button type="button" className="button secondary small-button" disabled={disabled || currentPage >= totalPages} onClick={() => onPageChange(offset + CREDENTIALS_PER_PAGE)}>Berikutnya</button>
      </nav>
    </div>
  </div>;
}
