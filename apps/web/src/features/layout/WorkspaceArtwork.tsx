import Image from 'next/image';
import historyArt from './images/workspace-history-empty.png';
import portalArt from './images/workspace-portal-welcome.png';
import verificationArt from './images/workspace-verification-empty.png';
import styles from './WorkspaceHeading.module.css';

const artworks = { 'history-empty': historyArt, 'portal-welcome': portalArt, 'verification-empty': verificationArt };

export function WorkspaceArtwork({ kind, className = '' }: { kind: keyof typeof artworks; className?: string }) {
  return <Image className={`${styles.workspaceArt} ${className}`} src={artworks[kind]} alt="" sizes={kind === 'portal-welcome' ? '(max-width: 680px) 280px, (max-width: 1100px) 350px, 540px' : '(max-width: 680px) 220px, 320px'}/>;
}
