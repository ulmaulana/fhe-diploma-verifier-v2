import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon, HistoryIcon, InstitutionIcon, VerifyRecordIcon } from '@/features/shared/icons';
import scene from './images/hero-scene.webp';
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
  return <>
    <section className={styles.hero} aria-labelledby="home-title">
      {/* The scene is a statue-free crop of the temple asset, so the cut-out statues stand alone in front of it. */}
      <Image src={scene} alt="" priority placeholder="blur" sizes="100vw" className={styles.scene}/>
      <Image src={statues} alt="" priority sizes="(max-width: 680px) 110vw, 62vw" className={styles.statues}/>
      <div className={styles.content}>
        <p className={styles.eyebrow}>Validasi ijazah<br/>lebih pasti</p>
        <h1 id="home-title" className={styles.title}><span>Verifikasi</span> <span className={styles.titleSoft}>Ijazah</span></h1>
        <p className={styles.lead}>Gunakan teknologi terkini untuk memeriksa ijazah dengan rekaman resmi penerbit.</p>
        <Link href="/verifikasi" className={styles.cta}>Mulai Verifikasi<ArrowRightIcon size={22}/></Link>
      </div>
    </section>
    <section className={styles.services} aria-labelledby="services-title">
      <div className={styles.servicesHeader}>
        <h2 id="services-title" className={styles.chip}><span className={styles.chipToggle} aria-hidden="true"/>Layanan Utama</h2>
        <Link href="/panduan" className={styles.seeAll} aria-label="Lihat semua layanan di Panduan">Lihat Semua<ArrowRightIcon size={16}/></Link>
      </div>
      <ul className={styles.cards}>{services.map(({ href, title, text, icon: Icon, art }) => <li key={href}>
        <Link href={href} className={styles.card}>
          <span className={styles.cardBody}>
            <span className={styles.cardIcon}><Icon size={24}/></span>
            <h3>{title}</h3>
            <span className={styles.cardText}>{text}</span>
            <span className={styles.cardArrow}><ArrowRightIcon size={18}/></span>
          </span>
          <Image src={art} alt="" sizes="(max-width: 680px) 45vw, 220px" className={styles.cardArt}/>
        </Link>
      </li>)}</ul>
    </section>
  </>;
}
