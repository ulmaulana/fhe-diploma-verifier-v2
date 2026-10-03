import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {createJob,eraseJob,finish,publicJob,readJob,cleanup,detectFile} from '../../src/server/jobs';
import {withState} from '../../src/server/store';
import {getPrivate} from '../../src/server/storage';
import {mutation,bootstrap} from '../../src/server/http';
import {report} from '../../src/server/reports';
import type {Session} from '../../src/server/types';

let directory:string;
const session:Session={id:'owner-a',csrf:'csrf',expiresAt:new Date(Date.now()+86400000).toISOString()};
function upload(key='idempotency-12345678',data='%PDF-1.7\nsynthetic-fixture'){
  const body=new FormData();body.append('file',new Blob([data],{type:'application/pdf'}),'test.pdf');
  return new Request('http://localhost:3000/api/verifications',{method:'POST',headers:{'Idempotency-Key':key},body});
}
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'verifikasi-test-'));process.env.PRIVATE_DATA_DIR=directory;process.env.APP_MODE='demo';delete process.env.DATABASE_URL;delete process.env.S3_BUCKET;});
afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
describe('private job lifecycle',()=>{
  it('binds upload and retry idempotently and rejects a changed document',async()=>{
    const first=await createJob(upload(),session);const second=await createJob(upload(),session);
    expect(first.id).toBe(second.id);expect(first.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    await expect(createJob(upload('idempotency-12345678','%PDF-1.7 changed'),session)).rejects.toMatchObject({status:409});
  });
  it('hides jobs from another session and rejects file signature spoofing',async()=>{
    const job=await createJob(upload(),session);await expect(readJob(job.id,'owner-b')).rejects.toMatchObject({status:404});
    await expect(createJob(upload('another-key-123456','<script>bad</script>'),session)).rejects.toMatchObject({status:415});
    expect(detectFile(new Uint8Array([1,2,3]))).toBeNull();
  });
  it('deletion prevents late worker results and PDF reports',async()=>{
    const job=await createJob(upload(),session);await eraseJob(job.id,session.id);
    await finish(job.id,{decision:'MATCH',status:'COMPLETED'},[]);
    const deleted=await readJob(job.id,session.id);
    expect(deleted.decision).toBeUndefined();expect(deleted.digest).toBeUndefined();
    expect((await publicJob(deleted)).reportAvailable).toBe(false);
    await expect(getPrivate(job.id,'result.json')).rejects.toThrow();await expect(report(deleted)).rejects.toMatchObject({status:410});
  });
  it('scrubs files on TTL while preserving minimal history until 24h',async()=>{
    const job=await createJob(upload(),session);
    await withState(state=>{state.jobs[job.id]!.artifactsExpireAt=new Date(Date.now()-1).toISOString();});
    await cleanup();const cleaned=await readJob(job.id,session.id);
    expect(cleaned.artifactsDeletedAt).toBeTruthy();expect(cleaned.fileName).toBe('');
    await expect(getPrivate(job.id,'upload.bin')).rejects.toThrow();
  });
  it('enforces the five active jobs quota',async()=>{
    for(let i=0;i<5;i++)await createJob(upload(`quota-key-${randomBytes(12).toString('hex')}`),session);
    await expect(createJob(upload('quota-key-sixth-123'),session)).rejects.toMatchObject({status:429});
  });
  it('issues HttpOnly same-site sessions and rejects missing CSRF or foreign origin',async()=>{
    const response=await bootstrap(new Request('http://localhost:3000/api/session'));const cookie=response.headers.get('set-cookie')!;const data=await response.json();
    expect(cookie.toLowerCase()).toContain('httponly');expect(cookie.toLowerCase()).toContain('samesite=strict');
    await expect(mutation(new Request('http://localhost:3000',{headers:{cookie,origin:'https://foreign.example','x-csrf-token':data.csrfToken}}))).rejects.toMatchObject({status:403});
    await expect(mutation(new Request('http://localhost:3000',{headers:{cookie,origin:'http://localhost:3000'}}))).rejects.toMatchObject({status:403});
  });
});
