import styles from './PortalPage.module.css';

const Bone = ({ className }: { className: string }) => <span className={`${styles.bone} ${className}`}/>;

/** Placeholder while the wallet session and first portal data load; it mirrors the final layout. */
export function PortalSkeleton({ variant }: { variant: 'records' | 'form' }) {
  return <div role="status">
    <span className="visually-hidden">Memuat data portal…</span>
    {variant === 'records'
      ? <div className={styles.records} aria-hidden="true">
          <Bone className={styles.boneMeta}/>
          <table className={styles.recordsTable}><tbody>{[0, 1, 2].map(row => <tr key={row}>
            <td className={styles.recordNumber}><Bone className={styles.boneLabel}/></td>
            <td className={styles.recordIdentity}><Bone className={styles.boneTitle}/><Bone className={styles.boneMeta}/></td>
            <td className={styles.recordStatus}><Bone className={styles.bonePill}/></td>
            <td className={styles.recordActionsCell}><div className={styles.recordActions}><Bone className={styles.boneButton}/><Bone className={styles.boneButton}/></div></td>
          </tr>)}</tbody></table>
        </div>
      : <div className="portal-form" aria-hidden="true">
          <Bone className={styles.boneHeading}/><Bone className={styles.boneText}/>
          <div className={`form-grid ${styles.skeletonGrid}`}>{[0, 1, 2, 3].map(field => <div key={field}><Bone className={styles.boneLabel}/><Bone className={styles.boneInput}/></div>)}</div>
          <Bone className={styles.boneAction}/>
        </div>}
  </div>;
}
