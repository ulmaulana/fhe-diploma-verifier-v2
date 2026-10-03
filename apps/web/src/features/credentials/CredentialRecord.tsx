'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertIcon, ArrowRightIcon, CheckIcon, RetryIcon, ShieldCheckIcon, SpinnerIcon } from '@/features/shared/icons';
import type { RecordVerificationResult } from '@verifikasi/domain';
import { api, formatTime } from '@/features/shared/api';
import { CertificateArt } from '@/features/shared/CertificateArt';
import { recordStatuses } from './record-status';
import styles from './CredentialRecord.module.css';

export function CredentialRecord({credentialId}: {credentialId: string}) {
  const [result, setResult] = useState<RecordVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    api<RecordVerificationResult>(`/api/credentials/${encodeURIComponent(credentialId)}/verification`, {signal: controller.signal})
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Pemeriksaan belum dapat dituntaskan.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [credentialId, attempt]);

  const status = recordStatuses[result?.recordVerificationStatus || 'ERROR'];
  // An API profile is eligible for display only after integrity verification. An
  // inactive/revoked record can retain a valid signature; it is never labelled active.
  const profile = result && ['VERIFIED_RECORD', 'REVOKED', 'ISSUER_INACTIVE'].includes(result.recordVerificationStatus)
    ? result.profile : null;

  return <>
    <div className="page-heading"><div><h1>Verifikasi Rekaman Ijazah</h1><p>Rekaman resmi yang dirujuk oleh QR pada ijazah.</p></div><CertificateArt/></div>
    <section className={styles.record} aria-label="Hasil verifikasi rekaman">
      <div aria-live="polite" aria-busy={loading}>
        {loading ? <div className={styles.loading}><SpinnerIcon className="spin" size={28}/><div><h2>Memeriksa rekaman</h2><p>Memeriksa pengesahan data dan status penerbitan.</p></div></div>
          : <><div className={`status-banner ${status.tone}`}><span className="status-icon">{result?.recordVerificationStatus === 'VERIFIED_RECORD' ? <CheckIcon size={27}/> : <AlertIcon size={26}/>}</span><div><h3>{status.label}</h3><p>{status.detail}</p></div></div>
            {(error || result?.reason) && <p className={styles.notice}>{error || result?.reason}</p>}</>}
      </div>
      <p className={styles.instruction}>Cocokkan data di halaman ini dengan ijazah yang Anda periksa.</p>
      <p className={styles.scope}>{result?.recordVerificationStatus === 'VERIFIED_RECORD'
        ? 'Rekaman penerbit telah diperiksa; isi dokumen di tangan Anda belum dicocokkan otomatis.'
        : 'Pemeriksaan ini mencakup rekaman penerbit; isi dokumen di tangan Anda belum dicocokkan otomatis.'}</p>

      {!loading && profile && <section className={styles.profile} aria-labelledby="public-profile-title"><h2 id="public-profile-title">Data publik yang disahkan penerbit</h2><dl className={styles.fields}>
        <div><dt>Nama lengkap</dt><dd>{profile.fullName}</dd></div>
        <div><dt>Nomor ijazah</dt><dd>{profile.diplomaNumber}</dd></div>
        <div><dt>Program studi</dt><dd>{profile.studyProgram}</dd></div>
        <div><dt>Institusi penerbit</dt><dd>{profile.issuerDisplayName}</dd></div>
      </dl></section>}
      {!loading && result && <>
        <p className={styles.signature}><ShieldCheckIcon size={18}/>{profile ? 'E-sign data kredensial: bukti pengesahan valid.' : 'E-sign data kredensial: belum dapat dinyatakan valid.'}</p>
        {!profile && <p className={styles.notice}>Data publik tidak ditampilkan sebelum integritas bukti dapat dipastikan.</p>}
        {result.checkedAt && <p className={styles.time}>Diperiksa {formatTime(result.checkedAt)}{result.checkedBlock != null ? ` · Blok ${result.checkedBlock}` : ''}</p>}
        <details className={styles.proof}><summary>Detail bukti rekaman</summary><dl>
          <div><dt>ID kredensial</dt><dd>{credentialId}</dd></div>
          <div><dt>Cakupan</dt><dd>RECORD_ONLY · Rekaman penerbit; kecocokan isi dokumen diperiksa oleh pengguna.</dd></div>
          <div><dt>Jaringan</dt><dd>{result.chainId ?? 'Belum tersedia'}</dd></div>
          <div><dt>Kontrak penerbitan</dt><dd>{result.contractAddress || 'Belum tersedia'}</dd></div>
          <div><dt>Transaksi penerbitan</dt><dd>{result.issuanceTxHash || 'Belum tersedia'}</dd></div>
          <div><dt>Wallet pengesah</dt><dd>{result.signer || 'Belum tersedia'}</dd></div>
          <div><dt>Digest pengesahan</dt><dd>{result.credentialDigest || 'Belum tersedia'}</dd></div>
        </dl><a href={`/api/credentials/${encodeURIComponent(credentialId)}`}>Lihat bukti publik</a></details>
      </>}
      {!loading && (!result || ['ERROR', 'PENDING'].includes(result.recordVerificationStatus)) && <button className="button secondary" style={{marginTop: 20}} onClick={() => setAttempt(value => value + 1)}><RetryIcon size={16}/>Periksa ulang rekaman</button>}
      <div className={styles.actions}><Link className="button secondary" href={`/verifikasi?credentialId=${encodeURIComponent(credentialId)}`}>Periksa dokumen lebih lanjut<ArrowRightIcon size={16}/></Link><p>Pilihan tambahan untuk mencocokkan empat atribut pada PDF atau foto ijazah.</p></div>
    </section>
  </>;
}
