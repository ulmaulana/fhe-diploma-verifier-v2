'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowRightIcon, EncryptionIcon, MatchAttributeIcon, ReadDocumentIcon, ShieldCheckIcon, VerifyRecordIcon } from '@/features/shared/icons';
import bust from './images/tech-bust.webp';
import styles from './VerificationTechnology.module.css';

const stages = [
  {
    label: 'Baca dokumen', technology: 'OCR · Tesseract.js', icon: ReadDocumentIcon,
    title: 'Tulisan pada ijazah dibaca menjadi data.',
    description: 'Sistem membaca PDF atau gambar yang diunggah, mendeteksi QR, dan mengambil empat atribut ijazah. Kualitas pembacaan diperiksa sebelum data digunakan untuk pencocokan.',
    detailTitle: 'Empat atribut yang dibaca',
    details: ['Nama lengkap', 'Nomor ijazah', 'Program studi', 'Tanggal lulus'],
  },
  {
    label: 'Periksa rekaman', technology: 'QR · Ethereum Sepolia', icon: VerifyRecordIcon,
    title: 'QR menghubungkan dokumen dengan rekaman penerbit.',
    description: 'Sistem memeriksa rekaman pada blockchain dan bukti pengesahan data. Pencocokan dilanjutkan jika rekaman terverifikasi dan penerbit berwenang.',
    detailTitle: 'Yang diperiksa',
    details: ['ID kredensial yang dirujuk QR', 'Bukti pengesahan penandatangan', 'Kewenangan institusi penerbit', 'Status penerbitan dan pencabutan'],
  },
  {
    label: 'Enkripsi data', technology: 'Normalisasi · Hash · Enkripsi', icon: EncryptionIcon,
    title: 'Data disiapkan untuk dibandingkan secara terenkripsi.',
    description: 'Hasil OCR diseragamkan formatnya, diubah menjadi hash per atribut, lalu dienkripsi. Nilai terenkripsi ini menjadi masukan pencocokan dengan referensi yang disahkan penerbit.',
    detailTitle: 'Urutan persiapan',
    details: ['Seragamkan format teks dan tanggal', 'Buat hash yang terikat pada ID kredensial', 'Enkripsi hash setiap atribut', 'Kirim masukan terenkripsi untuk pencocokan'],
  },
  {
    label: 'Cocokkan dengan FHE', technology: 'Zama FHEVM · Smart contract', icon: MatchAttributeIcon,
    title: 'Pencocokan berlangsung saat data tetap terenkripsi.',
    description: 'Fully Homomorphic Encryption (FHE) memungkinkan smart contract membandingkan nilai terenkripsi hasil OCR dengan referensi terenkripsi penerbit, tanpa membuka nilai tersebut di blockchain.',
    detailTitle: 'Yang dilakukan sistem',
    details: ['Bandingkan setiap atribut dengan referensinya', 'Hitung hasil kecocokan setiap atribut', 'Gabungkan hasil keempat atribut', 'Tunggu konfirmasi transaksi pencocokan'],
  },
  {
    label: 'Tampilkan hasil', technology: 'Dekripsi hasil · Pemeriksaan status', icon: ShieldCheckIcon,
    title: 'Hasil kecocokan ditampilkan bersama status rekaman.',
    description: 'Layanan yang berwenang membuka hasil pencocokan, lalu memeriksa ulang status rekaman. Anda dapat melihat atribut yang cocok atau berbeda, beserta alasan jika pemeriksaan belum dapat diselesaikan.',
    detailTitle: 'Hasil yang dapat ditampilkan',
    details: ['Keempat atribut cocok', 'Ada atribut yang berbeda', 'Rekaman dicabut atau bukti tidak valid', 'Belum dapat disimpulkan atau layanan terganggu'],
  },
];

const numerals = ['I', 'II', 'III', 'IV', 'V'];

export function VerificationTechnology() {
  const [activeStage, setActiveStage] = useState(0);
  const stage = stages[activeStage]!;
  const Icon = stage.icon;

  return <section className={styles.technology} aria-labelledby="technology-title">
    <header className={styles.heading}>
      <h2 id="technology-title"><span>Teknologi di balik</span> <span className={styles.headingSoft}>verifikasi</span></h2>
      <p>Dari dokumen yang diunggah hingga hasil pencocokan. Pilih tahap untuk melihat cara kerjanya.</p>
    </header>
    {/* The gesturing statue faces the colonnade, as if explaining the stages below. */}
    <Image src={bust} alt="" sizes="(max-width: 950px) 1px, 300px" className={styles.bust}/>
    {/* Stoa: a meander frieze over five marble columns, one per stage. */}
    <div className={styles.frieze} aria-hidden="true"/>
    <ol className={styles.stages} aria-label="Tahapan teknologi verifikasi">
      {stages.map((item, index) => <li key={item.label}>
        <button type="button" aria-pressed={activeStage === index} aria-controls="technology-detail" onClick={() => setActiveStage(index)}>
          <span className={styles.column} aria-hidden="true"><span className={styles.numeral}>{numerals[index]}</span></span>
          <span className={styles.stageLabel}><span className="visually-hidden">Tahap {index + 1}: </span>{item.label}</span>
        </button>
      </li>)}
    </ol>
    <div className={styles.tablet}>
      <div id="technology-detail" className={styles.detail} aria-live="polite" aria-atomic="true">
        <div className={styles.explanation}>
          <div className={styles.technologyLabel}>
            <span className={styles.technologyIcon}><Icon size={22}/></span>
            <ul aria-label="Teknologi yang dipakai">{stage.technology.split(' · ').map(name => <li key={name}>{name}</li>)}</ul>
          </div>
          <h3>{stage.title}</h3>
          <p>{stage.description}</p>
        </div>
        <div className={styles.checks}>
          <h4>{stage.detailTitle}</h4>
          <ul>{stage.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
        </div>
      </div>
      <div className={styles.navigation}>
        <span className={styles.progress}>
          <span>Tahap {activeStage + 1} dari {stages.length}</span>
          <span className={styles.progressBars} aria-hidden="true">{stages.map((item, index) => <span key={item.label} data-active={index <= activeStage}/>)}</span>
        </span>
        <button type="button" onClick={() => setActiveStage((activeStage + 1) % stages.length)}>
          {activeStage === stages.length - 1 ? 'Kembali ke tahap awal' : 'Tahap berikutnya'}<ArrowRightIcon size={17}/>
        </button>
      </div>
    </div>
  </section>;
}
