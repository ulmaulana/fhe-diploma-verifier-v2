import Image from 'next/image';
import historyArt from './images/workspace-history-heading.png';
import guideArt from './images/workspace-guide-heading.png';
import portalArt from './images/workspace-portal-heading.png';
import styles from './WorkspaceHeading.module.css';

const artworks = { history: historyArt, guide: guideArt, portal: portalArt, verification: guideArt };

export function WorkspaceHeading({ title, accent, description, art }: {
  title: string;
  accent: string;
  description: string;
  art: keyof typeof artworks;
}) {
  return <div className={styles.heading}>
    <div className={styles.copy}><h1>{title} <span>{accent}</span></h1><p>{description}</p></div>
    <Image className={styles.art} src={artworks[art]} alt="" sizes="(max-width: 680px) 104px, (max-width: 1100px) 200px, 340px"/>
  </div>;
}
