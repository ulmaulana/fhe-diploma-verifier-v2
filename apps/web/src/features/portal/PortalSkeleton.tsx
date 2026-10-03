import styles from './PortalPage.module.css';

const Bone = ({ className }: { className: string }) => <span className={`${styles.bone} ${className}`}/>;

/** Placeholder while the wallet session and first portal data load; it mirrors the final layout. */
export function PortalSkeleton({ variant }: { variant: 'records' | 'form' }) {
  return <div role="status">
    <span className="visually-hidden">Memuat data portal…</span>
    {variant === 'records'
      ? <div className="history-list" aria-hidden="true">{[0, 1, 2].map(row => <div key={row} className={`history-row ${styles.credentialRow}`}>
          <div className="history-item-main"><Bone className={styles.boneTitle}/><Bone className={styles.boneMeta}/></div>
          <Bone className={styles.bonePill}/><Bone className={styles.boneButton}/><Bone className={styles.boneButton}/>
          <div className={styles.document}><Bone className={styles.boneBar}/></div>
        </div>)}</div>
      : <div className="portal-form" aria-hidden="true">
          <Bone className={styles.boneHeading}/><Bone className={styles.boneText}/>
          <div className={`form-grid ${styles.skeletonGrid}`}>{[0, 1, 2, 3].map(field => <div key={field}><Bone className={styles.boneLabel}/><Bone className={styles.boneInput}/></div>)}</div>
          <Bone className={styles.boneAction}/>
        </div>}
  </div>;
}
