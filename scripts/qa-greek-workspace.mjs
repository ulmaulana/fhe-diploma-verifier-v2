import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(resolve(process.cwd(),'apps/web/package.json'));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({headless:true});
const smoke=process.argv.includes('--production-smoke');
const origin=process.env.QA_ORIGIN||'http://localhost:3000';
const out=resolve('docs/redesign ui v2/review',smoke?'implementation-production':'implementation');
await mkdir(out,{recursive:true});
const errors=[];
const results=[];
for(const width of smoke?[1600,390]:[1600,1280,1024,800,680,390,360,320]){
 const context=await browser.newContext({viewport:{width,height:width>680?1000:844}});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push({width,error:e.message}));
 for(const path of ['/riwayat','/panduan','/penerbit','/verifikasi']){
  await page.goto(origin+path,{waitUntil:'networkidle'});
  await page.getByRole('heading',{level:1}).waitFor();
  if(path==='/riwayat') await page.locator('.history-notice').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})));});
  const layout=await page.evaluate(()=>{
    const h=document.querySelector('h1').getBoundingClientRect();
    const image=document.querySelector('main>div img')?.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,headingWidth:h.width,headingX:h.x,image:image?{x:image.x,width:image.width,y:image.y}:null,brokenImages:Array.from(document.images).filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src),background:getComputedStyle(document.querySelector('.app-content')).backgroundColor};
  });
  results.push({path,width,...layout});
  if([1600,390].includes(width))await page.screenshot({path:resolve(out,path.slice(1)+'-'+width+'.png'),fullPage:true,animations:'disabled'});
  console.log(JSON.stringify({path,width,...layout}));
 }
 await context.close();
}
await writeFile(resolve(out,'layout-check.json'),JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({checked:results.length,errors,failures:results.filter(r=>r.overflow||r.brokenImages.length)},null,2));
await browser.close();
if(errors.length||results.some(r=>r.overflow||r.brokenImages.length))process.exitCode=1;
