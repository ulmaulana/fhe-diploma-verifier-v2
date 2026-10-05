import { DocumentMatchIllustration, RecordIllustration, ScanQrIllustration } from '@/features/shared/icons';
import styles from './HomeVerificationSteps.module.css';

const steps = [
  {
    title: 'Buka QR ijazah',
    description: 'Kamera HP membuka halaman rekaman resmi yang dirujuk QR.',
    illustration: ScanQrIllustration,
  },
  {
    title: 'Periksa rekaman',
    description: 'Lihat pengesahan data, status kredensial, nama, nomor ijazah, dan institusi.',
    illustration: RecordIllustration,
  },
  {
    title: 'Cocokkan dokumen',
    description: 'Bandingkan data di layar dengan kertas. Unggah dokumen bila ingin mencocokkan atribut secara otomatis.',
    illustration: DocumentMatchIllustration,
  },
];

const numerals = ['I', 'II', 'III'];

export function HomeVerificationSteps() {
  return <section className={styles.section} aria-label="Cara memeriksa ijazah">
    <ol className={styles.steps}>
      {steps.map(({ title, description, illustration: Illustration }, index) => <li key={title} className={styles.step}>
        <div className={styles.stepHeader}>
          <span className={styles.emblem} aria-hidden="true"><Illustration size={60} className={styles.illustration}/></span>
          <span className={styles.number} aria-hidden="true">{numerals[index]}</span>
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
      </li>)}
    </ol>
  </section>;
}
