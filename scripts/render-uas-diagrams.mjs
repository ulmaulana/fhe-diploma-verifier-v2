import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local export only: existing Playwright plus a fixed Mermaid CDN release.
// No application, wallet, environment file or database is accessed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'docs/uas/diagrams');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium } = requireWeb('@playwright/test');
const playwrightVersion = requireWeb('@playwright/test/package.json').version;
const mermaidVersion = '11.12.0';
const cdnBase = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion}/`;
const mermaidModuleUrl = `${cdnBase}dist/mermaid.esm.min.mjs`;
const mermaidPackageUrl = `${cdnBase}package.json`;
const deviceScaleFactor = 2;
const titles = {
  architecture: 'Arsitektur Verifikasi Ijazah',
  'transaction-flow': 'Alur transaksi Verifikasi Ijazah',
};
const artifactNames = { architecture: 'Architecture_Diagram', 'transaction-flow': 'Transaction_Flow' };
const theme = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  fontFamily: 'Arial, sans-serif',
  themeVariables: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '18px',
    primaryColor: '#eef4ff',
    primaryTextColor: '#0f172a',
    primaryBorderColor: '#64748b',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#f8fafc',
    lineColor: '#475569',
    clusterBkg: '#f8fafc',
    clusterBorder: '#94a3b8',
    actorBkg: '#eef4ff',
    actorBorder: '#64748b',
    actorTextColor: '#0f172a',
    noteBkgColor: '#fefce8',
    noteBorderColor: '#a8a29e',
    noteTextColor: '#0f172a',
  },
  flowchart: { useMaxWidth: false, htmlLabels: true, wrappingWidth: 340, nodeSpacing: 35, rankSpacing: 55, curve: 'linear' },
  sequence: { useMaxWidth: false, wrap: true, actorMargin: 45, width: 170, diagramMarginX: 30, diagramMarginY: 25, messageMargin: 45 },
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const relative = absolute => path.relative(root, absolute).split(path.sep).join('/');
const wib = date => `${new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')} +07:00`;
const sources = new Map(await Promise.all(Object.keys(titles).map(async name => [name, await readFile(path.join(outputDirectory, `${name}.mmd`), 'utf8')])));
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><title>Ekspor diagram UAS</title>
<style>html,body{margin:0;background:white;color:#0f172a;font-family:Arial,sans-serif}#capture{display:inline-block;padding:28px;background:white}h1{font-size:26px;margin:0 0 10px}p{font-size:16px;margin:0 0 24px}#diagram{display:block}footer{font-size:14px;margin-top:20px;color:#475569}</style>
<div id="capture"><h1 id="title"></h1><p>Protokol v2 · Sepolia 11155111 · bukti UI dari Next.js dan PostgreSQL lokal</p><div id="diagram"></div><footer>Netlify produksi belum diselaraskan; diagram menggambarkan kode dan alur uji. Sumber Mermaid tetap dapat disunting.</footer></div>
<script type="module">
import mermaid from ${JSON.stringify(mermaidModuleUrl)};
try {
 const release = await (await fetch(${JSON.stringify(mermaidPackageUrl)})).json();
 if (release.name !== 'mermaid' || release.version !== ${JSON.stringify(mermaidVersion)}) throw new Error('Unexpected Mermaid release');
 mermaid.initialize(${JSON.stringify(theme)});
 window.renderDiagram = async (name, title) => {
   document.getElementById('title').textContent = title;
   const source = await (await fetch('/sources/' + name + '.mmd')).text();
   const { svg } = await mermaid.render('uas-' + name, source);
   document.getElementById('diagram').innerHTML = svg;
   await document.fonts.ready;
   const element = document.querySelector('#diagram svg');
   const box = element.viewBox.baseVal;
   element.style.maxWidth = 'none';
   element.setAttribute('width', String(Math.ceil(box.width)));
   element.setAttribute('height', String(Math.ceil(box.height)));
   return { svg: element.outerHTML, viewBox: [box.x, box.y, box.width, box.height], width: Math.ceil(box.width), height: Math.ceil(box.height) };
 };
 window.mermaidRelease = release.version;
 window.rendererReady = true;
} catch (error) { window.rendererError = String(error); }
</script></html>`;
const server = createServer((request, response) => {
  const source = /^\/sources\/([a-z-]+)\.mmd$/.exec(request.url || '');
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } else if (source && sources.has(source[1])) {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(sources.get(source[1]));
  } else { response.writeHead(404); response.end('Not found'); }
});
let browser;
const started = new Date();
const assets = [];
const pendingAssets = [];
const rendered = [];
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === `${origin}/` || /^\/sources\/[a-z-]+\.mmd$/.test(url.slice(origin.length)) && url.startsWith(origin)
      || url.startsWith(`${cdnBase}dist/`) || url === mermaidPackageUrl) return route.continue();
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(cdnBase)) pendingAssets.push((async () => {
      const body = await response.body();
      assets.push({ url: response.url(), status: response.status(), bytes: body.length, sha256: sha256(body) });
    })());
  });
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => window.rendererReady || window.rendererError, undefined, { timeout: 60_000 });
  const rendererError = await page.evaluate(() => window.rendererError);
  if (rendererError) throw new Error(rendererError);
  for (const [name, title] of Object.entries(titles)) {
    const result = await page.evaluate(async ({ name, title }) => window.renderDiagram(name, title), { name, title });
    if (!Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width < 100 || result.height < 100 || result.width > 10_000 || result.height > 10_000) throw new Error(`Invalid SVG dimensions: ${name}`);
    await page.setViewportSize({ width: Math.max(1280, result.width + 56), height: Math.max(900, result.height + 160) });
    const svgPath = path.join(outputDirectory, `${artifactNames[name]}.svg`);
    const pngPath = path.join(outputDirectory, `${artifactNames[name]}.png`);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${result.svg}\n`;
    await writeFile(svgPath, svg, 'utf8');
    const png = await page.locator('#capture').screenshot({ path: pngPath, animations: 'disabled', timeout: 60_000 });
    rendered.push({
      name, source: relative(path.join(outputDirectory, `${name}.mmd`)), sourceSHA256: sha256(sources.get(name)),
      svg: relative(svgPath), svgSHA256: sha256(svg), svgBytes: Buffer.byteLength(svg), svgViewBox: result.viewBox,
      png: relative(pngPath), pngSHA256: sha256(png), pngBytes: png.length,
      pngWidth: png.readUInt32BE(16), pngHeight: png.readUInt32BE(20),
    });
  }
  await Promise.all(pendingAssets);
  if (pageErrors.length || assets.some(asset => asset.status !== 200)) throw new Error(`Renderer resource errors: ${JSON.stringify({ pageErrors, assets: assets.filter(asset => asset.status !== 200) })}`);
  const finished = new Date();
  const metadata = {
    schemaVersion: 1, startedAtUtc: started.toISOString(), startedAtWib: wib(started), finishedAtUtc: finished.toISOString(), finishedAtWib: wib(finished),
    command: 'node scripts/render-uas-diagrams.mjs', exitCode: 0,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    script: relative(fileURLToPath(import.meta.url)), scriptSHA256: sha256(await readFile(fileURLToPath(import.meta.url))),
    runtime: { node: process.version, platform: process.platform, playwright: playwrightVersion, chromium: browser.version() },
    renderer: { mermaidVersion: await page.evaluate(() => window.mermaidRelease), moduleUrl: mermaidModuleUrl, packageMetadataUrl: mermaidPackageUrl, theme, deviceScaleFactor, font: 'Arial, sans-serif (local system font)', whiteBackground: true },
    provenance: {
      primaryUsage: 'https://mermaid.js.org/config/usage.html',
      release: 'https://github.com/mermaid-js/mermaid/releases/tag/mermaid@11.12.0',
      syntax: 'https://raw.githubusercontent.com/jgraph/drawio-mcp/main/shared/mermaid-reference.md',
      method: 'Mermaid renders editable .mmd source to SVG; installed Playwright screenshots the actual SVG at deviceScaleFactor 2. No AI image generation, user application or wallet is involved.',
      drawio: 'Draw.io Desktop CLI absent after PATH, default directories, registry and other drives inspection. User explicitly authorized Mermaid + installed Playwright fallback and preserving .mmd sources.',
    },
    remoteAssets: assets.sort((a, b) => a.url.localeCompare(b.url)), rendered,
    qualityAssurance: { automated: 'Nonempty bounded SVG viewBox, PNG IHDR dimensions, no page/resource errors. Manual visual inspection required before acceptance.', manualVisualInspection: 'pending' },
  };
  await writeFile(path.join(outputDirectory, 'render-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ exitCode: 0, mermaid: mermaidVersion, outputs: rendered.map(({ png, pngWidth, pngHeight, pngBytes }) => ({ png, pngWidth, pngHeight, pngBytes })) }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.listening ? server.close(resolve) : resolve());
}
