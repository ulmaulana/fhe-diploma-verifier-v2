import Link from 'next/link';
import { ArrowRightIcon, DocumentMatchIllustration, EncryptionIcon, RecordIllustration, ScanQrIllustration } from '@/features/shared/icons';
import { CertificateArt } from '@/features/shared/CertificateArt';
import { VerificationTechnology } from '@/features/home/VerificationTechnology';
import styles from './page.module.css';

export default function Page() {
  return <>
    <section className={styles.section} aria-labelledby="verification-title">
      <div className={styles.content}>
        <h1 id="verification-title">Verifikasi Ijazah</h1>
        <p>Buka QR / Upload Dokumen Ijazah, tunggu beberapa saat untuk sistem memeriksa dokumen, dan hasil kecocokan muncul.</p>
        <Link href="/panduan" className="button primary">Panduan pemeriksaan QR<ArrowRightIcon size={18}/></Link>
      </div>
      <div className={styles.art} aria-hidden="true"><CertificateArt/></div>
    </section>
    <section className={styles.section} aria-labelledby="issuance-title">
      <div className={styles.content}>
        <h2 id="issuance-title">Terbitkan Ijazah Mahasiswa</h2>
        <p>Isi data mahasiswa, tinjau dan sahkan melalui wallet institusi, lalu unduh PDF ijazah yang dilengkapi QR untuk verifikasi.</p>
        <Link href="/penerbit?tab=issuance" className="button primary">Buka portal penerbitan<ArrowRightIcon size={18}/></Link>
      </div>
      <div className={styles.art} aria-hidden="true"><RecordIllustration size={160}/></div>
    </section>
    <section className="home-steps" aria-label="Cara kerja">{[
      {icon:ScanQrIllustration,title:'Buka QR ijazah',text:'Kamera HP membuka halaman rekaman resmi yang dirujuk QR.'},
      {icon:RecordIllustration,title:'Periksa rekaman',text:'Lihat pengesahan data, status kredensial, nama, nomor ijazah, dan institusi.'},
      {icon:DocumentMatchIllustration,title:'Cocokkan dokumen',text:'Bandingkan data di layar dengan kertas. Unggah dokumen bila ingin mencocokkan atribut secara otomatis.'},
    ].map(({icon:Icon,title,text},i)=><div key={title}><span className="step-number">0{i+1}</span><Icon size={64}/><h3>{title}</h3><p>{text}</p></div>)}</section>
    <VerificationTechnology/>
    <div className="inline-note"><EncryptionIcon size={21}/><p>Pemeriksaan tambahan membaca empat atribut melalui OCR dan mencocokkannya dengan referensi terenkripsi. Rekaman terverifikasi belum membuktikan kecocokan otomatis isi kertas.</p><Link href="/verifikasi">Periksa dokumen lebih lanjut<ArrowRightIcon size={16}/></Link></div>
  </>;
}
