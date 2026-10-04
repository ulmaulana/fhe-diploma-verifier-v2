import { test, expect } from '@playwright/test';
import type { RecordVerificationResult, RecordVerificationStatus } from '@verifikasi/domain';

const id = `0x${'42'.repeat(32)}`;
const revocationTx = `0x${'78'.repeat(32)}`;
const endpoint = `**/api/credentials/${id}/verification`;
const profile = {schemaVersion:1,disclosurePolicyVersion:1,issuerId:`0x${'11'.repeat(32)}` as `0x${string}`,issuerDisplayName:'Universitas Contoh',fullName:'Andi Pratama',diplomaNumber:'IJZ/2026/0042',studyProgram:'Informatika'};
function record(status:RecordVerificationStatus):RecordVerificationResult {
  return {mode:'RECORD',environment:'testnet',scope:'RECORD_ONLY',credentialId:id,recordVerificationStatus:status,documentDecision:null,
    profile:['VERIFIED_RECORD','REVOKED','ISSUER_INACTIVE'].includes(status)?profile:null,issuerName:profile.issuerDisplayName,
    checkedAt:'2026-09-24T04:00:00.000Z',checkedBlock:123456,chainId:11155111,contractAddress:`0x${'12'.repeat(20)}`,legacyContract:false,
    issuanceTxHash:`0x${'21'.repeat(32)}`,issuanceBlock:123400,revokedAt:status==='REVOKED'?'2026-09-25T04:00:00.000Z':null,revocationBlock:status==='REVOKED'?123450:null,revocationTxHash:status==='REVOKED'?revocationTx:null,signer:`0x${'34'.repeat(20)}`,credentialDigest:`0x${'56'.repeat(32)}`,reason:''};
}

test('QR shows a verified public record without session, upload, wallet or OCR; upload is optional',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  const unexpected:string[]=[];
  await page.route('**/api/**',async route=>{
    if(new URL(route.request().url()).pathname===`/api/credentials/${id}/verification`){await route.fulfill({json:record('VERIFIED_RECORD')});return;}
    unexpected.push(route.request().method()+' '+new URL(route.request().url()).pathname);
    await route.abort();
  });
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading',{name:'Rekaman ijazah terverifikasi'})).toBeVisible();
  await expect(page.getByText('Andi Pratama',{exact:true})).toBeVisible();
  await expect(page.getByText('IJZ/2026/0042',{exact:true})).toBeVisible();
  await expect(page.getByText('Universitas Contoh',{exact:true})).toBeVisible();
  await expect(page.getByText('Cocokkan data di halaman ini dengan ijazah yang Anda periksa.')).toBeVisible();
  await expect(page.getByText('Rekaman penerbit telah diperiksa; isi dokumen di tangan Anda belum dicocokkan otomatis.')).toBeVisible();
  await expect(page.getByText('E-sign data kredensial: bukti pengesahan valid.')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Atribut cocok',exact:true})).toHaveCount(0);
  await expect(page.getByText('Tanggal lulus',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Periksa dokumen lebih lanjut'})).toHaveAttribute('href',`/verifikasi?credentialId=${id}`);
  await page.screenshot({path:'../../docs/screenshots/v12-record-desktop.png',fullPage:true});
  await page.getByText('Detail bukti rekaman',{exact:true}).click();
  await expect(page.getByText('RECORD_ONLY · Rekaman penerbit; kecocokan isi dokumen diperiksa oleh pengguna.')).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('record statuses fail closed, hide an invalid snapshot, and keep revocation separate from signature validity',async({page})=>{
  const states:[RecordVerificationStatus,string][]=[
    ['INVALID_PROOF','Bukti kredensial tidak valid'],['REVOKED','Kredensial dicabut'],
    ['ISSUER_INACTIVE','Kewenangan penerbit tidak aktif'],['NOT_FOUND','Rekaman tidak ditemukan'],
    ['PENDING','Penerbitan belum selesai'],['ERROR','Verifikasi rekaman terganggu'],
  ];
  for(const [status,label] of states){
    await page.route(endpoint,route=>route.fulfill({json:{...record(status),...(status==='INVALID_PROOF'?{profile:{...profile,fullName:'Data yang telah diubah'}}:{})}}));
    await page.goto(`/c/${id}`);
    await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Atribut cocok',exact:true})).toHaveCount(0);
    await expect(page.getByText('Data yang telah diubah',{exact:true})).toHaveCount(0);
    if(status==='REVOKED'||status==='ISSUER_INACTIVE'){
      await expect(page.getByText('Andi Pratama',{exact:true})).toBeVisible();
      await expect(page.getByText('E-sign data kredensial: bukti pengesahan valid.')).toBeVisible();
    }else await expect(page.getByText('Andi Pratama',{exact:true})).toHaveCount(0);
    if(status==='REVOKED'){
      // FT-02: the revocation trail links to the trusted chain's explorer.
      await expect(page.getByRole('heading',{name:'Jejak pencabutan'})).toBeVisible();
      await expect(page.getByRole('link',{name:revocationTx})).toHaveAttribute('href',`https://sepolia.etherscan.io/tx/${revocationTx}`);
    }else await expect(page.getByRole('heading',{name:'Jejak pencabutan'})).toHaveCount(0);
    await page.unroute(endpoint);
  }
});

test('record loading and RPC failure are explicit; retry rereads current status',async({page})=>{
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let attempts=0;
  await page.route(endpoint,async route=>{
    attempts++;
    if(attempts===1){await gate;await route.abort();}else await route.fulfill({json:record('REVOKED')});
  });
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading',{name:'Memeriksa rekaman',exact:true})).toBeVisible();
  await expect(page.getByText('Membaca dokumen',{exact:true})).toHaveCount(0);
  release();
  await expect(page.getByRole('heading',{name:'Verifikasi rekaman terganggu',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Periksa ulang rekaman'}).click();
  await expect(page.getByRole('heading',{name:'Kredensial dicabut',exact:true})).toBeVisible();
  expect(attempts).toBe(2);
});

test('mobile QR remains readable and optional upload carries the expected record ID',async({page})=>{
  await page.route(endpoint,route=>route.fulfill({json:record('VERIFIED_RECORD')}));
  for(const width of [390,360]){
    await page.setViewportSize({width,height:844});await page.goto(`/c/${id}`);
    await expect(page.getByText('Andi Pratama',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.screenshot({path:width===390?'../../docs/screenshots/v12-record-mobile.png':'../../docs/screenshots/v12-record-mobile-360.png',fullPage:true});
  }
  await page.getByRole('link',{name:'Periksa dokumen lebih lanjut'}).click();
  await expect(page).toHaveURL(`/verifikasi?credentialId=${id}`);
  await expect(page.getByRole('heading',{name:'Dokumen Anda',exact:true})).toBeVisible();
  await expect(page.getByText('Pemeriksaan tambahan untuk rekaman',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Kembali ke rekaman'})).toHaveAttribute('href',`/c/${id}`);
});

test('unconfigured QR and portal state remain explicit without synthetic issuance',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`/c/${id}`);
  await expect(page.getByRole('heading',{name:'Verifikasi rekaman terganggu',exact:true})).toBeVisible();
  await expect(page.getByText('Mode demonstrasi tidak memverifikasi rekaman blockchain.',{exact:false})).toBeVisible();
  await expect(page.getByText('Andi Pratama',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'../../docs/screenshots/v12-record-unconfigured.png',fullPage:true});
  await page.getByRole('link',{name:'Portal Penerbit',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Masuk dengan wallet institusi',exact:true})).toBeVisible();
  await expect(page.getByText('Mode demo lokal. Pengesahan dan penerbitan memerlukan konfigurasi testnet.',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Unduh QR',exact:true})).toHaveCount(0);
  await page.screenshot({path:'../../docs/screenshots/v12-portal.png',fullPage:true});
});
