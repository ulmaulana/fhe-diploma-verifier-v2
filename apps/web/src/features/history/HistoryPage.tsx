'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WorkspaceArtwork } from '@/features/layout/WorkspaceArtwork';
import { WorkspaceHeading } from '@/features/layout/WorkspaceHeading';
import { ArrowRightIcon, DownloadIcon, FileIcon, HistoryIcon, SpinnerIcon, TrashIcon } from '@/features/shared/icons';
import { api, formatTime, getSession } from '@/features/shared/api';
import { decisions, isRunning, stages, type VerificationJob } from '@/features/verification/types';
import { recordStatuses } from '@/features/credentials/record-status';
import styles from './HistoryPage.module.css';

export function HistoryPage() {
  const [jobs, setJobs] = useState<VerificationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSession()
      .then(() => api<{ jobs: VerificationJob[] }>('/api/verifications'))
      .then(data => { if (active) setJobs(data.jobs); })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function remove(id: string) {
    setError('');
    try {
      await api(`/api/verifications/${id}`, { method: 'DELETE' });
      setJobs((await api<{ jobs: VerificationJob[] }>('/api/verifications')).jobs);
      setDeleting(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Penghapusan gagal.');
    }
  }

  return (
    <>
      <WorkspaceHeading
        title="Riwayat"
        accent="Verifikasi"
        description="Dokumen yang diperiksa dalam sesi Anda."
        art="history"
      />
      <nav className="tabs" aria-label="Verifikasi">
        <Link href="/verifikasi">Unggah Dokumen</Link>
        <Link href="/riwayat" className="active" aria-current="page">Riwayat Verifikasi</Link>
      </nav>
      <div className={`history-notice ${styles.notice}`}>
        <HistoryIcon size={21} />
        <div>
          <p>Riwayat tersedia maksimal 24 jam. Akses unggahan dan hasil OCR berakhir 1 jam setelah pekerjaan selesai, paling lambat 24 jam sejak unggah.</p>
          <p className={styles.noticeDetail}>Penghapusan berkas berjalan terjadwal dan dapat tertunda saat layanan terganggu.</p>
        </div>
      </div>
      {error && <div className="error-message" role="alert">{error}</div>}
      {loading ? (
        <div className={`greek-panel ${styles.empty}`} role="status">
          <SpinnerIcon className="spin" size={28} />
          <p>Memuat riwayat sesi…</p>
        </div>
      ) : !jobs.length ? (
        <div className={`greek-panel ${styles.empty}`}>
          <WorkspaceArtwork kind="history-empty" className={styles.emptyArtwork} />
          <h2>Belum ada dokumen yang diperiksa</h2>
          <p>Hasil pemeriksaan Anda akan muncul di sini.</p>
          <Link className={`button primary ${styles.verifyButton}`} href="/verifikasi">
            Verifikasi ijazah<ArrowRightIcon size={18} />
          </Link>
        </div>
      ) : (
        <div className={`greek-panel ${styles.list}`}>
          {jobs.map(job => (
            <article className={styles.row} key={job.id}>
              <div className={styles.fileIcon}><FileIcon size={25} /></div>
              <div className={styles.itemMain}>
                <h3>{job.artifactsDeletedAt ? 'Dokumen telah dihapus' : job.fileName}</h3>
                <p>{formatTime(job.createdAt)}{job.synthetic ? ' · Contoh sintetis' : ''} · Pemeriksaan atribut dokumen</p>
                {job.recordVerificationStatus && <p>Rekaman: {recordStatuses[job.recordVerificationStatus].label}</p>}
              </div>
              <span className={`history-status ${styles.status} ${job.decision ? decisions[job.decision].tone : ''}`}>
                {job.deletedAt || job.artifactsDeletedAt ? 'Artefak dihapus' : job.decision ? decisions[job.decision].label : stages[job.status]}
              </span>
              <div className={styles.actions}>
                {!job.artifactsDeletedAt && (
                  <Link className="button secondary small-button" href={`/verifikasi?job=${job.id}`}>
                    {isRunning(job.status) ? 'Lihat proses' : 'Lihat hasil'}<ArrowRightIcon size={15} />
                  </Link>
                )}
                {job.reportAvailable && (
                  <a className="icon-button" href={`/api/verifications/${job.id}/report`} aria-label={`Unduh laporan ${job.fileName}`}>
                    <DownloadIcon size={18} />
                  </a>
                )}
                {!job.artifactsDeletedAt && (
                  <button className="icon-button" aria-label={`Hapus ${job.fileName}`} onClick={() => setDeleting(job.id)}>
                    <TrashIcon size={17} />
                  </button>
                )}
              </div>
              {deleting === job.id && (
                <div className={styles.deleteConfirm}>
                  <p>Hapus dokumen, teks OCR, dan laporan? Transaksi blockchain yang sudah tercatat tetap ada.</p>
                  <div className={styles.confirmActions}>
                    <button className="button danger-button" onClick={() => remove(job.id)}>Hapus data dokumen</button>
                    <button className="button secondary" onClick={() => setDeleting(null)}>Batal</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
