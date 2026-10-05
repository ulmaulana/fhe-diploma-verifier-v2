'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeAttributes, requireHex32, type DiplomaAttributes, type RecordVerificationResult } from '@verifikasi/domain';
import { CREDENTIAL_SCHEMA_VERSION, DISCLOSURE_POLICY_VERSION, type SignedCredential } from '@verifikasi/credentials';
import { explorerTxUrl } from '@/features/shared/explorer';
import type { CredentialSummary, IssuerMetadata } from '@verifikasi/chain';
import type { PreparedCredential, SignedPreparedCredential } from '@verifikasi/chain/browser';
import { ArrowRightIcon, CheckIcon, DownloadIcon, ExternalLinkIcon, LockIcon, ShieldCheckIcon, SpinnerIcon, WalletIcon } from '@/features/shared/icons';
import { api, getSession, formatTime } from '@/features/shared/api';
import { WorkspaceHeading } from '@/features/layout/WorkspaceHeading';
import { WorkspaceArtwork } from '@/features/layout/WorkspaceArtwork';
import styles from './PortalPage.module.css';
import { CredentialDocument, type DocumentState } from './CredentialDocument';
import { CredentialRecords, CREDENTIALS_PER_PAGE } from './CredentialRecords';
import { PortalSkeleton } from './PortalSkeleton';
import { RevokeCredentialDialog } from './RevokeCredentialDialog';
import { PortalWalletButton, usePortalWallet } from './WalletProvider';

interface Portal {wallet:string;issuer:IssuerMetadata;admin:boolean;credentials:CredentialSummary[];total:number;offset:number;documents?:Record<string,DocumentState>}
interface Configuration {mode:'demo'|'testnet';chainId:number;contractAddress:string|null;portal:Portal|null}
interface ProofResponse {verification:RecordVerificationResult;qrUrl?:string|null}
const steps = ['Isi data','Tinjau data publik','Sahkan kredensial','Kirim penerbitan','Unduh ijazah'];
const emptyAttributes: DiplomaAttributes = {full_name:'',diploma_number:'',study_program:'',graduation_date:''};
const portalTabs = [
  { id: 'institution', label: 'Portal Kredensial Institusi', description: 'Atur data institusi, status keaktifan, dan kewenangan wallet penandatangan.' },
  { id: 'issuance', label: 'Portal Penerbitan Ijazah Mahasiswa', description: 'Isi data mahasiswa, sahkan penerbitan, lalu unduh PDF ijazah.' },
  { id: 'records', label: 'Data Ijazah Mahasiswa', description: 'Lihat rekaman ijazah mahasiswa yang telah diterbitkan, kelola PDF, dan cabut kredensial bila diperlukan.' },
] as const;
function publicProof(signed:SignedPreparedCredential):SignedCredential{return {authorization:signed.authorization,profile:signed.profile,domain:signed.domain,signature:signed.signature};}

export function PortalPage({initialTab='institution'}:{initialTab?:typeof portalTabs[number]['id']}={}){
  const [activeTab,setActiveTab]=useState<typeof portalTabs[number]['id']>(initialTab);
  const tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const [configuration,setConfiguration]=useState<Configuration|null>(null);
  const {wallet,selection,revision,restoring,getProvider,error:walletError}=usePortalWallet();
  const portal=wallet&&configuration?.portal?.wallet.toLowerCase()===wallet.toLowerCase()?configuration.portal:null;
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const [attributes,setAttributes]=useState<DiplomaAttributes>(emptyAttributes);
  const [frozenDate,setFrozenDate]=useState('');
  const [prepared,setPrepared]=useState<PreparedCredential|null>(null);
  const [signed,setSigned]=useState<SignedPreparedCredential|null>(null);
  const [step,setStep]=useState(0); const [reviewed,setReviewed]=useState(false);
  const [proofSaved,setProofSaved]=useState(false); const [txHash,setTxHash]=useState('');
  const [issued,setIssued]=useState<RecordVerificationResult|null>(null); const [qr,setQr]=useState('');
  const [revokeId,setRevokeId]=useState(''); const [confirmRevoke,setConfirmRevoke]=useState(false);
  const [loading,setLoading]=useState(true);
  const [pageLoading,setPageLoading]=useState(false); const [pageError,setPageError]=useState('');
  const recordsHeading=useRef<HTMLHeadingElement|null>(null);
  // Receipt of the last confirmed registry or revocation transaction; never set for a failed or cancelled one.
  const [lastTx,setLastTx]=useState<{label:string;transactionHash:string;blockNumber:number}|null>(null);
  const busyRef=useRef(false); const epoch=useRef(0);
  const pagingRef=useRef(false); const configRequest=useRef(0);

  async function refresh(offset=0,generation=epoch.current){
    const request=++configRequest.current;
    try{await getSession();const c=await api<Configuration>(`/api/portal/config?offset=${offset}`);assertCurrent(generation);if(request!==configRequest.current)return false;setConfiguration(c);return true;}
    catch(error){if(request!==configRequest.current)return false;throw error;}
  }
  async function changePage(offset:number){
    if(pagingRef.current||busyRef.current||!portal||offset===portal.offset||offset<0||offset>=portal.total||offset%CREDENTIALS_PER_PAGE!==0)return;
    const generation=epoch.current;pagingRef.current=true;setPageLoading(true);setPageError('');
    try{if(await refresh(offset,generation)){recordsHeading.current?.focus({preventScroll:true});recordsHeading.current?.scrollIntoView({block:'start',behavior:'instant'});}}
    catch(error){if(generation===epoch.current)setPageError(error instanceof Error?error.message:'Halaman ijazah belum dapat dimuat.');}
    finally{if(generation===epoch.current){pagingRef.current=false;setPageLoading(false);}}
  }
  function clearDraft(){setFrozenDate('');setPrepared(null);setSigned(null);setStep(0);setReviewed(false);setProofSaved(false);setTxHash('');setIssued(null);setQr('');}
  useEffect(()=>{
    // Fetch once for the restored wallet; a fetch before restoration only repeats the slow chain reads.
    if(restoring)return;
    const generation=++epoch.current;
    clearDraft();setAttributes(emptyAttributes);setRevokeId('');setConfirmRevoke(false);setError('');
    pagingRef.current=false;setPageLoading(false);setPageError('');
    setConfiguration(current=>current?{...current,portal:null}:current);
    setMessage('');setLoading(true);
    let active=true;
    refresh(0,generation).catch(error=>{if(active&&generation===epoch.current)setError(error.message);})
      .finally(()=>{if(active&&generation===epoch.current)setLoading(false);});
    return()=>{active=false;epoch.current++;};
  },[wallet,selection,revision,restoring]);
  async function action(fn:(generation:number)=>Promise<void>){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setMessage('');setLastTx(null);
    const generation=epoch.current;
    try{await fn(generation);}catch(e){if(generation===epoch.current)setError(e instanceof Error?e.message:'Tindakan belum berhasil.');}finally{busyRef.current=false;setBusy(false);}
  }
  function assertCurrent(generation:number){if(generation!==epoch.current)throw new Error('Wallet atau jaringan berubah. Mulai kembali dari peninjauan data.');}
  function chainConfig(){if(!configuration?.contractAddress||configuration.mode!=='testnet')throw new Error('Portal penerbit memerlukan konfigurasi kontrak dan jaringan testnet.');return {chainId:configuration.chainId,contractAddress:configuration.contractAddress};}
  async function prepare(event:React.FormEvent<HTMLFormElement>){event.preventDefault();await action(async generation=>{
    const issuer=portal?.issuer;if(!issuer?.active||!issuer.signerActive)throw new Error('Wallet penandatangan dan institusi harus aktif.');
    const normalized=normalizeAttributes(attributes);
    const {prepareCredential}=await import('@verifikasi/chain/browser');setMessage('Menyiapkan referensi terenkripsi untuk ditinjau.');
    const next=await prepareCredential(await getProvider(),chainConfig(),{attributes:normalized,profile:{schemaVersion:CREDENTIAL_SCHEMA_VERSION,disclosurePolicyVersion:DISCLOSURE_POLICY_VERSION,issuerId:requireHex32(issuer.issuerId),issuerDisplayName:issuer.name,fullName:attributes.full_name.trim(),diplomaNumber:attributes.diploma_number.trim(),studyProgram:attributes.study_program.trim()}});
    assertCurrent(generation);
    await api('/api/credentials/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorization:next.authorization,profile:next.profile,domain:next.domain,inputHandles:next.inputHandles,documentDate:normalized.graduation_date})});
    assertCurrent(generation);setFrozenDate(normalized.graduation_date);setPrepared(next);setSigned(null);setReviewed(false);setProofSaved(false);setTxHash('');setStep(1);setMessage('Tinjau persis data yang akan dipublikasikan. Tanggal lulus tetap privat.');
  });}
  async function persistProof(value:SignedPreparedCredential,transactionHash?:string){
    return api<ProofResponse>(`/api/credentials/${value.authorization.credentialId}/proof`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signedCredential:publicProof(value),...(transactionHash?{issuanceTxHash:transactionHash}:{})})});
  }
  async function sign(){if(!prepared||!reviewed)return;await action(async generation=>{
    const {signPreparedCredential}=await import('@verifikasi/chain/browser');setMessage('Sahkan data kredensial melalui pesan terstruktur di wallet.');
    const next=await signPreparedCredential(await getProvider(),chainConfig(),prepared);assertCurrent(generation);setSigned(next);setStep(3);
    await persistProof(next);assertCurrent(generation);setProofSaved(true);setMessage('Pengesahan pesan selesai dan bukti tersimpan. Transaksi penerbitan belum dikirim.');
  });}
  async function complete(value:SignedPreparedCredential,transactionHash:string|undefined,generation:number){
    const response=await persistProof(value,transactionHash);assertCurrent(generation);setProofSaved(true);
    if(response.verification.recordVerificationStatus!=='VERIFIED_RECORD'||!response.qrUrl){
      setMessage(response.verification.reason||'Penerbitan belum dapat dinyatakan aktif. Periksa kembali konfirmasi; QR belum tersedia.');return;
    }
    const canonicalUrl=new URL(response.qrUrl);
    if(!['https:','http:'].includes(canonicalUrl.protocol)||canonicalUrl.pathname!==`/c/${value.authorization.credentialId}`)throw new Error('Tautan QR resmi belum tersedia. Periksa konfigurasi penerbitan.');
    const QRCode=await import('qrcode');const image=await QRCode.toDataURL(canonicalUrl.href,{width:400,margin:3,errorCorrectionLevel:'M'});
    assertCurrent(generation);setIssued(response.verification);setQr(image);setStep(4);setMessage('Penerbitan terkonfirmasi dan bukti pengesahan tersedia. PDF ijazah akan dibuat dan diperiksa otomatis.');await refresh();
  }
  async function submit(){if(!signed||txHash)return;await action(async generation=>{
    // Store the durable e-sign proof before asking the wallet to broadcast.
    await persistProof(signed);assertCurrent(generation);setProofSaved(true);
    const {submitCredential}=await import('@verifikasi/chain/browser');setMessage('Konfirmasi transaksi penerbitan di wallet. Pengesahan pesan sudah selesai.');
    const result=await submitCredential(await getProvider(),chainConfig(),signed,{onSubmitted:hash=>{if(generation===epoch.current){setTxHash(hash);setMessage('Transaksi dikirim. Menunggu konfirmasi jaringan.');}}});
    assertCurrent(generation);setTxHash(result.transactionHash);await complete(signed,result.transactionHash,generation);
  });}
  async function checkIssuance(){if(!signed)return;await action(async generation=>{setMessage('Memeriksa konfirmasi dan menyimpan bukti penerbitan.');await complete(signed,txHash||undefined,generation);});}
  function requestRevocation(credentialId=revokeId){setRevokeId(credentialId);setError('');setConfirmRevoke(true);}
  async function revoke(){await action(async generation=>{const {revokeCredential}=await import('@verifikasi/chain/browser');const receipt=await revokeCredential(await getProvider(),chainConfig(),revokeId);assertCurrent(generation);setLastTx({label:'Transaksi pencabutan',...receipt});setMessage('Kredensial telah dicabut. Pencabutan tidak dapat dibatalkan.');setConfirmRevoke(false);setRevokeId('');await refresh(portal?.offset??0,generation);});}
  async function updateIssuer(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await action(async generation=>{const {setIssuer}=await import('@verifikasi/chain/browser');const receipt=await setIssuer(await getProvider(),chainConfig(),String(form.get('issuerId')),String(form.get('name')),form.get('active')==='on');assertCurrent(generation);setLastTx({label:'Transaksi registry institusi',...receipt});setMessage('Institusi penerbit diperbarui pada blockchain.');await refresh(0,generation);});}
  async function updateSigner(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await action(async generation=>{const {setSigner}=await import('@verifikasi/chain/browser');const receipt=await setSigner(await getProvider(),chainConfig(),String(form.get('issuerId')),String(form.get('address')),form.get('active')==='on');assertCurrent(generation);setLastTx({label:'Transaksi kewenangan penandatangan',...receipt});setMessage('Kewenangan wallet penandatangan diperbarui. Bukti penerbitan terdahulu tetap diperiksa menurut kewenangan saat penerbitan.');await refresh(0,generation);});}
  const authorized=!!portal?.issuer.active&&!!portal?.issuer.signerActive;
  const pending=restoring||(!!wallet&&loading);

  return <>
    <WorkspaceHeading title="Portal" accent="Penerbit" description="Kelola kredensial institusi dan terbitkan ijazah mahasiswa." art="portal"/>
    <div className={styles.portalTabs} role="tablist" aria-label="Pilih portal">
      {portalTabs.map((tab,index)=><button
        key={tab.id}
        ref={element=>{tabRefs.current[index]=element;}}
        type="button"
        role="tab"
        id={`portal-tab-${tab.id}`}
        aria-controls={`portal-panel-${tab.id}`}
        aria-selected={activeTab===tab.id}
        tabIndex={activeTab===tab.id?0:-1}
        onClick={()=>setActiveTab(tab.id)}
        onKeyDown={event=>{
          let next=index;
          if(event.key==='ArrowRight')next=(index+1)%portalTabs.length;
          else if(event.key==='ArrowLeft')next=(index+portalTabs.length-1)%portalTabs.length;
          else if(event.key==='Home')next=0;
          else if(event.key==='End')next=portalTabs.length-1;
          else return;
          event.preventDefault();setActiveTab(portalTabs[next]!.id);tabRefs.current[next]?.focus();
        }}
      >{tab.label}</button>)}
    </div>
    {(error||walletError)&&<div className="error-message" role="alert">{error||walletError}</div>}{message&&<div className={`portal-message ${styles.status}`} role="status">{busy&&<SpinnerIcon size={15} className="spin"/>}<span>{message}</span></div>}{lastTx&&<p className={styles.proof} role='status'>{lastTx.label}: {explorerTxUrl(configuration?.chainId,lastTx.transactionHash)?<a href={explorerTxUrl(configuration?.chainId,lastTx.transactionHash)!} target='_blank' rel='noopener noreferrer'>{lastTx.transactionHash} <ExternalLinkIcon size={12}/></a>:lastTx.transactionHash} · Blok {lastTx.blockNumber}</p>}
    <section className={`portal-intro ${styles.intro}`}>
      {configuration?.mode==='demo'&&<div className="record-notice"><LockIcon size={18}/><p>Mode demo lokal. Pengesahan dan penerbitan memerlukan konfigurasi testnet. Tidak ada kredensial contoh yang dinyatakan aktif.</p></div>}
      {!wallet&&!restoring&&<div className={`greek-panel ${styles.connectPanel}`}>
        <div className={styles.connectContent}>
          <span className={styles.walletEmblem} aria-hidden="true"><WalletIcon size={37}/></span>
          <h2>Masuk dengan wallet institusi</h2>
          <p className={styles.connectDescription}>Hubungkan wallet yang telah didaftarkan administrator. Pesan masuk berbeda dari pengesahan kredensial.</p>
          <div className={styles.connectAction}><WalletIcon size={20}/><PortalWalletButton disabled={busy}/><ArrowRightIcon size={19}/></div>
          <p className={styles.walletPrivacy}><ShieldCheckIcon size={20}/><span>Kunci privat tetap berada di wallet Anda.</span></p>
          <p className={styles.connectContext}>{portalTabs.find(tab=>tab.id===activeTab)!.description}</p>
        </div>
        <WorkspaceArtwork kind="portal-welcome" className={styles.welcomeArtwork}/>
      </div>}
      {wallet&&configuration&&!pending&&!authorized&&<div className="record-notice"><LockIcon size={18}/><p>Wallet ini belum berwenang menerbitkan kredensial. Minta administrator mengaktifkan wallet penandatangan untuk institusi Anda.</p></div>}
      <div className={styles.tabPanel} id="portal-panel-issuance" role="tabpanel" aria-labelledby="portal-tab-issuance" tabIndex={0} hidden={activeTab!=='issuance'}>
        {(wallet||restoring)&&<p className={styles.portalDescription}>{portalTabs[1].description}</p>}
        {pending?<div className={`greek-panel ${styles.workPanel}`}><PortalSkeleton variant="form"/></div>:wallet&&<section className={`portal-form greek-panel ${styles.workPanel}`} aria-labelledby="issuance-title"><h2 id="issuance-title">Terbitkan ijazah mahasiswa</h2>
          <ol className={styles.steps} aria-label="Tahap penerbitan">{steps.map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={index<step?styles.done:''}><span>{index<step?<CheckIcon size={13}/>:index+1}</span>{label}</li>)}</ol>
          {step===0&&<form onSubmit={prepare}><div className="form-grid">{([
            ['full_name','Nama lengkap','text'],['diploma_number','Nomor ijazah','text'],['study_program','Program studi','text'],['graduation_date','Tanggal lulus (privat)','date'],
          ] as const).map(([key,label,type])=><label key={key} className="form-field">{label}<input name={key} required maxLength={200} type={type} autoComplete="off" value={attributes[key]} disabled={busy} onChange={event=>setAttributes(current=>({...current,[key]:event.target.value}))}/></label>)}</div>
            <p className={styles.hint}>Nama, nomor ijazah, program studi, dan nama institusi akan tersedia pada halaman QR publik. Tanggal lulus disimpan dalam referensi terenkripsi dan PDF privat; tidak ditampilkan di halaman QR publik.</p>
            <button className="button primary" disabled={busy||!authorized}>{busy?<SpinnerIcon size={17} className="spin"/>:<LockIcon size={17}/>}Siapkan data untuk ditinjau</button>
          </form>}
          {prepared&&step>0&&step<4&&<>
            <h3>{step===1?'Tinjau data publik':step===2?'Sahkan kredensial':'Kirim penerbitan'}</h3>
            <dl className={styles.snapshot}><div><dt>Nama lengkap</dt><dd>{prepared.profile.fullName}</dd></div><div><dt>Nomor ijazah</dt><dd>{prepared.profile.diplomaNumber}</dd></div><div><dt>Program studi</dt><dd>{prepared.profile.studyProgram}</dd></div><div><dt>Institusi penerbit</dt><dd>{prepared.profile.issuerDisplayName}</dd></div></dl>
            <p className={styles.hint}>Data di atas akan tampil persis pada halaman QR. Tanggal lulus {frozenDate} tetap privat. Referensi terenkripsi sudah disiapkan; perubahan data memerlukan peninjauan dan pengesahan baru.</p>
            <details className={styles.proof}><summary>Detail pengesahan data</summary><p>ID kredensial: {prepared.authorization.credentialId}</p><p>Wallet penandatangan: {prepared.authorization.signer}</p><p>Jaringan: {prepared.domain.chainId} · Kontrak: {prepared.domain.verifyingContract}</p><p>Batas pengajuan penerbitan: {formatTime(new Date(Number(prepared.authorization.issuanceDeadline)*1000).toISOString())}. Batas ini tidak mengakhiri kredensial yang sudah diterbitkan.</p><p>Hash profil publik: {prepared.authorization.publicDataHash}</p></details>
            {step===1&&<><label className={styles.confirm}><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Saya telah meninjau data ini dan menyetujui publikasi nama, nomor ijazah, program studi, serta institusi.</label><div className={styles.actions}><button className="button primary" disabled={!reviewed||busy} onClick={()=>setStep(2)}>Lanjut ke pengesahan</button><button className="button secondary" disabled={busy} onClick={clearDraft}>Ubah data</button></div></>}
            {step===2&&<><p className={styles.hint}>Wallet akan meminta pengesahan pesan data kredensial. Transaksi penerbitan dilakukan pada langkah berikutnya.</p><div className={styles.actions}><button className="button primary" disabled={busy} onClick={sign}><ShieldCheckIcon size={17}/>Sahkan kredensial</button><button className="button secondary" disabled={busy} onClick={clearDraft}>Ubah data dan tinjau ulang</button></div></>}
            {step===3&&<><div className={styles.receipt}><span><CheckIcon size={16}/>Pengesahan pesan selesai</span><span>{proofSaved?<CheckIcon size={16}/>:<LockIcon size={16}/>}Bukti pengesahan {proofSaved?'tersimpan':'belum tersimpan; akan dicoba kembali sebelum pengiriman'}</span><span>{txHash?'Transaksi dikirim; menunggu pemeriksaan konfirmasi':'Transaksi penerbitan belum dikirim'}</span></div>{txHash&&<p className={styles.proof}>Transaksi penerbitan: {explorerTxUrl(configuration?.chainId,txHash)?<a href={explorerTxUrl(configuration?.chainId,txHash)!} target='_blank' rel='noopener noreferrer'>{txHash} <ExternalLinkIcon size={12}/></a>:txHash}</p>}<div className={styles.actions}>{!txHash&&<button className="button primary" disabled={busy} onClick={submit}><WalletIcon size={17}/>Kirim penerbitan</button>}<button className="button secondary" disabled={busy} onClick={checkIssuance}>Periksa konfirmasi & simpan bukti</button>{!txHash&&<button className="button secondary" disabled={busy} onClick={clearDraft}>Batalkan dan ubah data</button>}</div><p className={styles.hint}>QR tersedia setelah transaksi terkonfirmasi dan bukti penerbitan tersimpan. Jangan menutup halaman saat pengiriman berlangsung.</p></>}
          </>}
          {step===4&&issued&&<div className="portal-result"><h3>Kredensial berhasil diterbitkan</h3><p>{issued.credentialId}</p><div className={styles.receipt}><span><CheckIcon size={16}/>Pengesahan data valid</span><span><CheckIcon size={16}/>Transaksi penerbitan terkonfirmasi</span><span><CheckIcon size={16}/>Bukti penerbitan tersimpan</span></div><CredentialDocument key={`${wallet}-${revision}-${issued.credentialId}`} credentialId={issued.credentialId} frozenDate={frozenDate} automatic/>{qr&&<><img className={styles.image} src={qr} alt="QR kredensial yang baru diterbitkan"/><a className="button secondary" download={`qr-${issued.credentialId.slice(2,12)}.png`} href={qr}><DownloadIcon size={16}/>Unduh gambar QR saja</a></>}<p>Gambar QR saja bukan dokumen lengkap. Unduh PDF ijazah untuk dicetak atau diunggah pada halaman verifikasi. QR membuka rekaman publik.</p><a href={`/c/${issued.credentialId}`}>Buka halaman rekaman <ExternalLinkIcon size={12}/></a><div><button className="button secondary" onClick={()=>{clearDraft();setAttributes(emptyAttributes);}}>Terbitkan ijazah lain</button></div></div>}
        </section>}
      </div>
      <div className={styles.tabPanel} id="portal-panel-records" role="tabpanel" aria-labelledby="portal-tab-records" tabIndex={0} hidden={activeTab!=='records'}>
        {(wallet||restoring)&&<p className={styles.portalDescription}>{portalTabs[2].description}</p>}
        {(wallet||restoring)&&<section className={`portal-form greek-panel ${styles.workPanel}`} aria-labelledby="records-title">
          <h2 id="records-title" ref={recordsHeading} tabIndex={-1} className={styles.recordsHeading}>Data Ijazah Mahasiswa</h2>
          {pending?<PortalSkeleton variant="records"/>:<>
            {portal&&<CredentialRecords credentials={portal.credentials} documents={portal.documents} offset={portal.offset} total={portal.total} authorized={authorized} busy={busy} loading={pageLoading} walletKey={`${wallet}-${revision}`} onPageChange={offset=>{void changePage(offset);}} onRevoke={requestRevocation}/>}
            {pageError&&<p className="error-message" role="alert">{pageError}</p>}
            <div className="portal-actions"><label className="form-field">ID kredensial yang akan dicabut<input value={revokeId} onChange={e=>{setRevokeId(e.target.value);setConfirmRevoke(false);}} placeholder="0x…"/></label><button className="button secondary" disabled={busy||pageLoading||!revokeId||configuration?.mode!=='testnet'} onClick={()=>requestRevocation()}>Cabut kredensial</button></div>
          </>}
        </section>}
      </div>
      <div className={styles.tabPanel} id="portal-panel-institution" role="tabpanel" aria-labelledby="portal-tab-institution" tabIndex={0} hidden={activeTab!=='institution'}>
        {(wallet||restoring)&&<p className={styles.portalDescription}>{portalTabs[0].description}</p>}
        {pending&&<div className={`greek-panel ${styles.workPanel}`}><PortalSkeleton variant="form"/></div>}
        {!pending&&wallet&&portal&&!portal.admin&&<div className="record-notice"><LockIcon size={18}/><p>Pengaturan institusi dan wallet penandatangan hanya tersedia untuk administrator.</p></div>}
        {!pending&&wallet&&portal?.admin&&<><form className={`portal-form greek-panel ${styles.workPanel}`} onSubmit={updateIssuer}><h2>Administrasi institusi</h2><p className="muted small">Gunakan ID institusi yang tetap saat mengganti wallet pejabat. Nama berasal dari onboarding yang telah diverifikasi.</p><div className="form-grid" style={{marginTop:20}}><label className="form-field">ID institusi (bytes32)<input name="issuerId" required pattern="0x[a-fA-F0-9]{64}"/></label><label className="form-field">Nama institusi terverifikasi<input name="name" required maxLength={200}/></label><label><input type="checkbox" name="active" defaultChecked/> Institusi aktif</label></div><button className="button primary" disabled={busy}>Simpan institusi</button></form>
          <form className={`portal-form greek-panel ${styles.workPanel}`} onSubmit={updateSigner}><h2>Wallet penandatangan</h2><p className="muted small">Aktifkan wallet pejabat untuk institusi yang telah terdaftar. Nonaktifkan wallet lama saat melakukan rotasi.</p><div className="form-grid" style={{marginTop:20}}><label className="form-field">ID institusi (bytes32)<input name="issuerId" required pattern="0x[a-fA-F0-9]{64}"/></label><label className="form-field">Alamat wallet pejabat<input name="address" required pattern="0x[a-fA-F0-9]{40}"/></label><label><input type="checkbox" name="active" defaultChecked/> Wallet berwenang menandatangani</label></div><button className="button primary" disabled={busy}>Simpan kewenangan wallet</button></form></>}
      </div>
    </section>
    {confirmRevoke&&<RevokeCredentialDialog credentialId={revokeId} busy={busy} error={error} onCancel={()=>setConfirmRevoke(false)} onConfirm={revoke}/>}
  </>;
}
