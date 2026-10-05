import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const evidenceRoot=resolve(root,'docs','uas','evidence');
const ignored=new Set(['node_modules','.git','.next','.venv','.vercel','.workflow-data','__pycache__','.pytest_cache','.ruff_cache','artifacts','cache','fhevmTemp','typechain-types','dist','coverage','test-results','playwright-report','.data','.private-data']);
const errors=[]; const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='.git'&&dir!==root)errors.push(`Repo Git bersarang: ${relative(root,dir)}`);if(ignored.has(entry.name))continue;const path=resolve(dir,entry.name);if(path===evidenceRoot)continue;if(entry.isDirectory())await walk(path);else files.push(path);}}
await walk(root);
const workspace=await readFile(resolve(root,'pnpm-workspace.yaml'),'utf8');
for(const pattern of ['apps/*','packages/*','contracts'])if(!workspace.split('\n').some(line=>line.trim().replace(/^[-\s]+|["']/g,'')===pattern))errors.push(`Cakupan workspace hilang: ${pattern}`);
const manifests=[];
for(const path of files){const rel=relative(root,path).replaceAll('\\','/');
  if(/(^|\/)(package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(rel)||(/pnpm-lock\.yaml$/.test(rel)&&rel!=='pnpm-lock.yaml'))errors.push(`Lockfile JS tambahan: ${rel}`);
  if(/^(src|frontend|backend|project-v2)\//.test(rel))errors.push(`Folder tidak diizinkan: ${rel}`);
  if(/\.(ts|tsx|js|jsx|mjs|cjs|py|sol)$/.test(rel)&&!rel.includes('/')&&rel!=='neon.ts'&&!/^(eslint|prettier|vitest)\.config\./.test(rel))errors.push(`Source lepas di root: ${rel}`);
  if(/\.(ts|tsx|js|jsx|mjs|cjs|py|sol)$/.test(rel)&&rel.includes('/')&&!/^(apps\/[^/]+\/(src|tests)\/|packages\/[^/]+\/(src|tests)\/|contracts\/(src|scripts|test)\/|scripts\/)/.test(rel)&&!/(^|\/)([^/]+\.config\.[^/]+|next-env\.d\.ts)$/.test(rel))errors.push(`Source tanpa modul pemilik: ${rel}`);
  if(rel.endsWith('/package.json')){if(!/^(apps|packages)\/[^/]+\/package\.json$/.test(rel)&&rel!=='contracts/package.json')errors.push(`Manifest di luar workspace: ${rel}`);else manifests.push({dir:dirname(path),rel,data:JSON.parse(await readFile(path,'utf8'))});}
}
const names=new Set();for(const m of manifests){if(!m.data.name||names.has(m.data.name))errors.push(`Nama paket tidak unik: ${m.rel}`);names.add(m.data.name);}
for(const file of files.filter(f=>/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))){const rel=relative(root,file).replaceAll('\\','/');if(/^(apps|packages)\//.test(rel)&&!manifests.some(m=>file.startsWith(m.dir+'/')||file.startsWith(m.dir+'\\')))errors.push(`Source JS/TS tanpa manifest workspace: ${rel}`);}
const graph=new Map();
for(const m of manifests){const deps={...m.data.dependencies,...m.data.devDependencies,...m.data.peerDependencies};graph.set(m.data.name,[]);for(const[name,version]of Object.entries(deps)){if(!names.has(name))continue;graph.get(m.data.name).push(name);if(version!=='workspace:*')errors.push(`${m.data.name}: ${name} wajib workspace:*`);if(m.rel.startsWith('packages/')&&manifests.find(x=>x.data.name===name)?.rel.startsWith('apps/'))errors.push(`Paket mengimpor aplikasi: ${m.data.name} -> ${name}`);}}
function visit(name,path=[]){if(path.includes(name)){errors.push(`Siklus dependensi: ${[...path,name].join(' -> ')}`);return;}for(const next of graph.get(name)||[])visit(next,[...path,name]);}
for(const name of names)visit(name);
for(const file of files.filter(f=>/\.(ts|tsx|js|mjs|cjs)$/.test(f))){const module=manifests.find(m=>file.startsWith(m.dir+'/')||file.startsWith(m.dir+'\\'));if(!module)continue;const text=await readFile(file,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)){const imp=match[1];if(imp.startsWith('.')){const target=resolve(dirname(file),imp);if(!target.startsWith(module.dir+'/')&&!target.startsWith(module.dir+'\\')&&target!==module.dir)errors.push(`Import melintasi workspace: ${relative(root,file)} -> ${imp}`);}else if(imp.startsWith('@verifikasi/')&&!Object.keys({...module.data.dependencies,...module.data.devDependencies}).some(d=>imp===d||imp.startsWith(d+'/')))errors.push(`Dependensi internal tidak dideklarasikan: ${module.data.name} -> ${imp}`);}}
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exit(1);}console.log(`Struktur monorepo valid: ${manifests.length} workspace; batas dependensi dan lockfile diperiksa.`);
