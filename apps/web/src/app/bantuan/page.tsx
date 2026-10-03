import { permanentRedirect } from 'next/navigation';
// Bantuan was merged into Panduan; keep old links and bookmarks working.
export default function Page(){permanentRedirect('/panduan');}
