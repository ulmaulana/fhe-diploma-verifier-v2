import type { ReactNode } from 'react';
import { accent, accentSolid, paper, skin, soft, type IconProps } from './Icon';

// Home-step illustrations from the reference sheet: 64×56 canvas, ink via currentColor.
function createIllustration(name: string, art: ReactNode) {
  function Illustration({ size = 64, className, ...props }: IconProps) {
    return <svg width={size} height={size * 56 / 64} viewBox="0 0 64 56" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className ? `icon ${className}` : 'icon'} {...props}>{art}</svg>;
  }
  Illustration.displayName = name;
  return Illustration;
}

const blueSpark = { ...accent, strokeWidth: 2.6 };

export const ScanQrIllustration = createIllustration('ScanQrIllustration', <>
  <path style={skin} d="M41 22.5h5a2.6 2.6 0 0 1 0 5.2h-5M41 29h5a2.6 2.6 0 0 1 0 5.2h-5M41 35.5h4.4a2.6 2.6 0 0 1 0 5.2H41"/>
  <rect style={soft} x="19" y="3" width="24" height="43" rx="5"/>
  <path d="M27.5 6.6h7M28 42.4h6"/>
  <g style={accent}><path d="M26 22.2v-2.4a1 1 0 0 1 1-1h2.4M32.6 18.8H35a1 1 0 0 1 1 1v2.4M36 27v2.4a1 1 0 0 1-1 1h-2.4M29.4 30.4H27a1 1 0 0 1-1-1V27"/><rect x="28.8" y="22.4" width="4.4" height="4.4" rx="1.2"/></g>
  <circle style={accentSolid} cx="31" cy="24.6" r=".9"/>
  <path style={skin} d="M9.5 56c1.1-5.6 3.6-9.9 7.7-13.1l4.4-3.5c1.9-1.5 4.4-.7 4.8 1.5.3 1.4-.3 2.8-1.4 3.7l-3.8 3.2c1.9 1.3 2.8 3.5 2.8 6.6V56"/>
  <path style={blueSpark} d="M49.5 10.5l2.8-5.2M52.3 15.2l5.6-2.3M52.4 20.3l5.8.6"/>
</>);

export const RecordIllustration = createIllustration('RecordIllustration', <>
  <rect style={paper} x="5" y="10" width="37" height="28" rx="4"/>
  <path d="M12.5 18h17M12.5 24h11"/>
  <path style={accentSolid} d="M11.7 39.2 10.4 47l4.1-2.3 4.1 2.3-1.3-7.8"/>
  <path d="M11.7 39.2 10.4 47l4.1-2.3 4.1 2.3-1.3-7.8"/>
  <circle style={paper} cx="14.5" cy="36" r="4.6"/>
  <circle style={accentSolid} cx="14.5" cy="36" r="2.3"/>
  <path style={soft} d="M46 14.5l9.5 3.4v7.6c0 6.4-4 10.6-9.5 13.2-5.5-2.6-9.5-6.8-9.5-13.2v-7.6z"/>
  <path style={{ ...accent, strokeWidth: 1.4 }} d="M46 18l6.6 2.4v5.2c0 4.6-2.8 7.7-6.6 9.6-3.8-1.9-6.6-5-6.6-9.6v-5.2z"/>
  <path style={{ ...accent, strokeWidth: 2.8 }} d="M41.8 26.6l3 3 5.6-5.8"/>
  <path style={blueSpark} d="M53.5 8.2l1.6-4.6M56.6 11.8l4.4-2.4M3.6 45.4l3.6-1.4M6.6 50.6l1.3-3.6"/>
</>);

export const DocumentMatchIllustration = createIllustration('DocumentMatchIllustration', <>
  <rect style={soft} x="6" y="11" width="24" height="33" rx="3.5"/>
  <rect style={paper} x="11" y="6" width="25" height="35" rx="3.5"/>
  <path d="M16 19.5h11M16 25.5h8.5M16 31.5h5.5"/>
  <path style={accent} d="M16 13.5h6.5"/>
  <rect style={soft} x="50.2" y="36.2" width="5" height="10" rx="2.5" transform="rotate(-45 52.7 41.2)"/>
  <circle style={soft} cx="42" cy="30" r="9.5"/>
  <circle style={{ ...accent, strokeWidth: 2 }} cx="42" cy="30" r="7.4"/>
  <path style={{ stroke: 'var(--icon-paper, #fff)', strokeWidth: 1.8 }} d="M37.9 28.3a4.6 4.6 0 0 1 3.4-3.5"/>
  <path style={blueSpark} d="M50 12.5l1.8-5M53.4 16.4l4.8-2.2"/>
</>);
