import Link from 'next/link';
import { ArrowRightIcon, EncryptionIcon } from '@/features/shared/icons';
import { HomeHero } from '@/features/home/HomeHero';
import { VerificationTechnology } from '@/features/home/VerificationTechnology';
import styles from './page.module.css';

export default function Page() {
  return <>
    <HomeHero/>
    <div className={styles.below}>
      <VerificationTechnology/>
      <div className="inline-note"><EncryptionIcon size={21}/><p>Pemeriksaan tambahan membaca empat atribut melalui OCR dan mencocokkannya dengan referensi terenkripsi. Rekaman terverifikasi belum membuktikan kecocokan otomatis isi kertas.</p><Link href="/verifikasi">Periksa dokumen lebih lanjut<ArrowRightIcon size={16}/></Link></div>
    </div>
  </>;
}
