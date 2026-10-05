import {test,expect} from '@playwright/test';
import path from 'node:path';
import {generateDiploma} from '../../src/server/diploma-pdf';
test('desktop upload, labelled sample, private PDF, history and deletion',async({page,context})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/verifikasi');
  await expect(page.getByRole('heading',{name:'Verifikasi Ijazah',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Verifikasi Dokumen',exact:true})).toBeDisabled();
  await expect(page.getByText('Setiap dokumen punya rekaman.')).toBeVisible();
  await page.screenshot({path:'../../docs/screenshots/desktop-empty.png',fullPage:true});
  await page.getByText('Mode demo lokal · Jelajahi contoh hasil').click();
  await page.getByRole('button',{name:'Tampilkan contoh'}).click();
  await expect(page.getByRole('heading',{name:'Atribut cocok',exact:true})).toBeVisible();
  await expect(page.getByText('Contoh tampilan dengan data sintetis. Bukan hasil verifikasi blockchain.')).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Unduh hasil'}).click();
  const report=await download;expect(await report.failure()).toBeNull();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'../../docs/screenshots/desktop-sample.png',fullPage:true});
  const jobs=await (await context.request.get('/api/verifications')).json();const id=jobs.jobs[0].id;
  const foreign=await context.browser()!.newContext();
  expect((await foreign.request.get(new URL(`/api/verifications/${id}/report`,page.url()).href)).status()).toBe(401);await foreign.close();
  await page.getByRole('link',{name:'Riwayat Saya',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Riwayat Verifikasi'})).toBeVisible();
  await page.getByRole('button',{name:'Hapus CONTOH - ijazah sintetis.pdf'}).click();
  await page.getByRole('button',{name:'Hapus data dokumen',exact:true}).click();
  await expect(page.getByText('Artefak dihapus')).toBeVisible();
  expect((await context.request.get(`/api/verifications/${id}/report`)).status()).toBe(410);
});
test('mobile navigation, search and horizontal overflow at 390 and 360',async({page})=>{
  for(const width of [390,360]){
    await page.setViewportSize({width,height:844});await page.goto('/verifikasi');
    await expect(page.getByRole('heading',{name:'Dokumen Anda'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.screenshot({path:`../../docs/screenshots/mobile-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Buka navigasi'}).click();
  await expect(page.getByRole('button',{name:'Tutup menu'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Buka navigasi'})).toBeFocused();
  await page.getByRole('button',{name:'Buka navigasi'}).click();
  await page.getByRole('link',{name:'Panduan',exact:true}).click();
  await page.getByRole('textbox',{name:'Cari topik panduan'}).fill('QR saja');
  await page.getByText('Apakah QR saja cukup untuk verifikasi?').click();
  await expect(page.getByText('QR cukup untuk memeriksa rekaman penerbit.',{exact:false})).toBeVisible();
});
test('file selection, replacing, validation and removing',async({page})=>{
  await page.goto('/verifikasi');
  await page.getByLabel('Pilih berkas ijazah').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});
  await expect(page.getByRole('alert').filter({hasText:'Format tidak didukung'})).toBeVisible();
  await page.getByLabel('Pilih berkas ijazah').setInputFiles(path.resolve('../../packages/ocr/tests/fixtures/synthetic-A1.pdf'));
  await expect(page.getByRole('button',{name:'Verifikasi Dokumen',exact:true})).toBeEnabled();
  await expect(page.getByText('synthetic-A1.pdf',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Hapus dokumen',exact:true}).click();
  await expect(page.getByRole('button',{name:'Verifikasi Dokumen',exact:true})).toBeDisabled();
});

test('real upload passes through in-process tesseract.js OCR and fails closed without testnet',async({page})=>{
  await page.goto('/verifikasi');
  const buffer=await generateDiploma({credentialId:`0x${'12'.repeat(32)}`,origin:new URL(page.url()).origin,
    graduationDate:'2026-08-15',createdAt:'2026-10-05T00:00:00Z',profile:{schemaVersion:1,disclosurePolicyVersion:1,
      issuerId:`0x${'34'.repeat(32)}`,issuerDisplayName:'Universitas Contoh Indonesia',fullName:'ANDI PRATAMA',
      diplomaNumber:'CONTOH/2026/0042',studyProgram:'INFORMATIKA'}});
  await page.getByLabel('Pilih berkas ijazah').setInputFiles({name:'synthetic-current-origin.pdf',mimeType:'application/pdf',buffer});
  await page.getByRole('button',{name:'Verifikasi Dokumen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Layanan verifikasi terganggu',exact:true})).toBeVisible({timeout:50000});
  await expect(page.getByText('OCR selesai.',{exact:false})).toBeVisible();
  await expect(page.getByRole('cell',{name:'ANDI PRATAMA',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Atribut cocok',exact:true})).toHaveCount(0);
  await page.screenshot({path:'../../docs/screenshots/real-ocr-demo.png',fullPage:true});
});
