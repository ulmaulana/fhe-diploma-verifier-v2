'use client';
import { AlertIcon, CheckCheckIcon, CheckIcon, CloseIcon, CopyIcon, DownloadIcon, InfoIcon, LockIcon, MatchAttributeIcon, ReadDocumentIcon, RetryIcon, SpinnerIcon } from '@/features/shared/icons';
import { useState } from 'react';
import { CertificateArt } from '@/features/shared/CertificateArt';
import { formatTime, shortId } from '@/features/shared/api';
import { decisions, isRunning, stages, type VerificationJob } from './types';
import { recordStatuses } from '@/features/credentials/record-status';
export function ResultPanel({job,onRetry}:{job:VerificationJob|null;onRetry:()=>void}) {
  const [copied,setCopied]=useState(false);
  const decision=job?.documentDecision ?? job?.decision;
  const status=decision ? decisions[decision] : null;
  return <section className="panel result-panel" aria-labelledby="result-title"><div className="panel-title-row"><h2 id="result-title">Hasil Verifikasi</h2><span className="section-label">{job?.synthetic ? 'CONTOH SINTETIS' : 'PEMERIKSAAN DOKUMEN'}</span></div>
    <div aria-live="polite" className="result-body">
    {!job ? <div className="empty-result"><div className="empty-art"><CertificateArt small/></div><h3>Setiap dokumen punya rekaman.</h3><p>Unggah ijazah untuk memeriksa kesesuaian<br className="desktop-break"/> atribut dengan rekaman resmi penerbit.</p><div className="empty-steps"><span><ReadDocumentIcon size={18}/>Baca dokumen</span><i/><span><MatchAttributeIcon size={18}/>Cocokkan atribut</span></div><div className="empty-hint"><InfoIcon size={16}/><span>QR mengidentifikasi rekaman.<br/>Isi dokumen tetap perlu diperiksa.</span></div></div>
    : isRunning(job.status) ? <div className="processing"><div className="processing-icon"><SpinnerIcon className="spin" size={32}/></div><h3>{stages[job.status]}</h3><p>Anda boleh membuka riwayat. Pekerjaan tetap tersimpan dalam sesi ini.</p><ol>{(['RECEIVED','EXTRACTING','AWAITING_CHAIN','AWAITING_DECRYPTION'] as const).map((stage,i)=><li key={stage} className={stage===job.status?'current':''}><span>{i+1}</span>{stages[stage]}</li>)}</ol></div>
    : <div className="result-detail">
      {job.synthetic && <div className="demo-result-note"><InfoIcon size={16}/>Contoh tampilan dengan data sintetis. Bukan hasil verifikasi blockchain.</div>}
      <div className={`status-banner ${status?.tone||'warning'}`}><span className="status-icon">{decision==='MATCH'?<CheckIcon size={27}/>:<AlertIcon size={26}/>}</span><div><h3>{status?.label||'Pekerjaan kedaluwarsa'}</h3><p>{status?.detail||'Unggah kembali untuk memulai pemeriksaan.'}</p></div></div>
      {job.reason && <p className="result-reason">{job.reason}</p>}
      <dl className="result-metadata"><div><dt>Penerbit</dt><dd>{job.issuerName||'Belum teridentifikasi'}</dd></div><div><dt>ID Kredensial</dt><dd>{job.credentialId?<button className="copy-id" title={job.credentialId} onClick={async()=>{try{await navigator.clipboard.writeText(job.credentialId!);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}}>{shortId(job.credentialId)}{copied?<CheckCheckIcon size={13}/>:<CopyIcon size={13}/>}</button>:'—'}</dd></div><div><dt>QR</dt><dd>{job.credentialId?'Rekaman teridentifikasi':'Belum teridentifikasi'}</dd></div></dl>
      {job.recordVerificationStatus&&<p className="result-reason">Status rekaman: {recordStatuses[job.recordVerificationStatus].label}.{job.credentialId&&<> <a href={`/c/${encodeURIComponent(job.credentialId)}`} style={{textDecoration:'underline'}}>Lihat rekaman terkini</a></>}</p>}
      <div className="attribute-table"><table><thead><tr><th>Atribut</th><th>Hasil OCR</th><th>Kecocokan</th></tr></thead><tbody>{job.fields.map(field=><tr key={field.key}><td>{field.label}</td><td>{field.text||'Tidak terbaca'}{field.text && (field.confidence??0)<0.9&&<span className="confidence-note">Pembacaan belum pasti</span>}</td><td><span className={`field-status ${field.status.toLowerCase()}`}>{field.status==='MATCH'?<CheckIcon size={13}/>:field.status==='MISMATCH'?<CloseIcon size={13}/>:<span className="not-compared-dot"/>}{field.status==='MATCH'?'Sesuai':field.status==='MISMATCH'?'Berbeda':'Belum dibandingkan'}</span></td></tr>)}</tbody></table></div>
      {job.checkedAt && <p className="checked-time">Diperiksa {formatTime(job.checkedAt)}{job.checkedBlock ? ` · Blok ${job.checkedBlock}`:''}</p>}
      <details className="technical-details"><summary>Detail pemeriksaan</summary><p>ID pekerjaan: {job.id}</p><p>Cakupan: CHECKED_ATTRIBUTES · Empat atribut pada unggahan.</p><p>Transaksi penerbitan: {job.issuanceTxHash||'Belum tersedia'}</p><p>Transaksi pencocokan: {job.txHash||'Tidak ada transaksi pencocokan'}</p><p>Jaringan: {job.chainId??'Belum tersedia'} · Kontrak: {job.contractAddress||'Belum tersedia'}</p></details>
    </div>}
    </div>
    <div className="result-privacy"><LockIcon size={18}/><span>Nilai referensi tetap terenkripsi.</span></div>
    <div className="result-bottom"><span>Hasil berlaku untuk atribut yang diperiksa.</span>{decision==='ERROR'?<button className="button secondary" onClick={onRetry}><RetryIcon size={17}/>Coba lagi</button>:job?.reportAvailable?<a className="button secondary" href={`/api/verifications/${job.id}/report`} download><DownloadIcon size={17}/>Unduh hasil</a>:<button className="button secondary" disabled><DownloadIcon size={17}/>Unduh hasil</button>}</div>
  </section>;
}
