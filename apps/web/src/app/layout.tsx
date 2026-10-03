import type { Metadata } from 'next';
import '@fontsource/hind/400.css';
import '@fontsource/hind/500.css';
import '@fontsource/hind/600.css';
import '@fontsource/hind/700.css';
import './globals.css';
import { AppShell } from '@/features/layout/AppShell';

export const metadata: Metadata = { title: 'Verifikasi Ijazah', description: 'Cocokkan atribut ijazah dengan rekaman resmi penerbit menggunakan QR, OCR, dan Zama FHEVM.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id" data-scroll-behavior="smooth"><body><AppShell>{children}</AppShell></body></html>;
}
