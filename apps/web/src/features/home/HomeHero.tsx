import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon, HistoryIcon, InstitutionIcon, VerifyRecordIcon } from '@/features/shared/icons';
import statues from './images/hero-statues.webp';
import verifyArt from './images/card-verify.webp';
import issuerArt from './images/card-issuer.webp';
import historyArt from './images/card-history.webp';
import styles from './HomeHero.module.css';

const services = [
  { href: '/verifikasi', title: 'Verifikasi Ijazah', text: 'Unggah dokumen atau pindai QR untuk memeriksa rekaman ijazah.', icon: VerifyRecordIcon, art: verifyArt },
  { href: '/penerbit', title: 'Portal Penerbit', text: 'Kelola data dan terbitkan ijazah digital.', icon: InstitutionIcon, art: issuerArt },
  { href: '/riwayat', title: 'Riwayat Saya', text: 'Lihat hasil verifikasi dan dokumen Anda.', icon: HistoryIcon, art: historyArt },
];

export function HomeHero() {
  // The hero takes whatever height the service panel leaves, so all three cards are visible on first load.
  return <div className={styles.fold}>
    <section className={styles.hero} aria-labelledby="home-title">
      {/* v4: the cut-out statues stand on the bare marble canvas, without the temple scene. */}
      <Image src={statues} alt="" priority sizes="(max-width: 680px) 110vw, 70vw" className={styles.statues}/>
      <div className={styles.content}>
        <h1 id="home-title" className={styles.title}><span>Verifikasi</span> <span className={styles.titleSoft}>Ijazah</span></h1>
        <Link href="/verifikasi" className={styles.cta}>Mulai Verifikasi<ArrowRightIcon size={22}/></Link>
      </div>
    </section>
    <section className={styles.services} aria-labelledby="services-title">
      <div className={styles.servicesHeader}>
        <h2 id="services-title" className={styles.chip}><span className={styles.chipToggle} aria-hidden="true"/>Layanan Utama</h2>
        <Link href="/panduan" className={styles.seeAll} aria-label="Lihat semua layanan di Panduan">Lihat Semua<ArrowRightIcon size={13}/></Link>
      </div>
      <ul className={styles.cards}>{services.map(({ href, title, text, icon: Icon, art }) => <li key={href}>
        <Link href={href} className={styles.card}>
          <span className={styles.cardBody}>
            <span className={styles.cardIcon}><Icon size={18}/></span>
            <h3>{title}</h3>
            <span className={styles.cardText}>{text}</span>
            <span className={styles.cardArrow}><ArrowRightIcon size={14}/></span>
          </span>
          <span className={styles.cardArt}><Image src={art} alt="" sizes="(max-width: 680px) 30vw, 140px"/></span>
        </Link>
      </li>)}</ul>
    </section>
  </div>;
}
