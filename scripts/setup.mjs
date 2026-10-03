import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');const env=resolve(root,'.env');
try{await access(env);console.log('.env sudah ada; konfigurasi Anda dipertahankan.');}
catch{await writeFile(env,await readFile(resolve(root,'.env.example'),'utf8'),{mode:0o600});console.log('.env lokal dibuat dari .env.example. Mode demo aktif.');}
