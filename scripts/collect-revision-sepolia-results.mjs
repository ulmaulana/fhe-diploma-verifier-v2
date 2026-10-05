import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
const folder=path.join(out,'evidence/sepolia/latest');
const databaseEnv=parseEnv(await fs.readFile(process.argv[2],'utf8'));
const configured=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'));
const wallets=parseEnv(await fs.readFile(path.join(process.env.USERPROFILE,'.uas-verifikasi/sepolia-test-wallets.env'),'utf8'));
const database=new URL(databaseEnv.DATABASE_URL);
if(database.hostname!=='127.0.0.1'||database.pathname!=='/uas_revision_sepolia_20261005')throw new Error('ISOLATED_DATABASE_REQUIRED');
const require=createRequire(path.join(root,'packages/chain/package.json'));
const webRequire=createRequire(path.join(root,'apps/web/package.json'));
const {Contract,Interface,JsonRpcProvider,FetchRequest,Wallet}=require('ethers');
const {Pool}=webRequire('pg');
const artifact=JSON.parse(await fs.readFile(path.join(root,'contracts/generated/VerifikasiIjazah.json'),'utf8'));
const address='0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0';
const iface=new Interface(artifact.abi);const request=new FetchRequest(configured.RPC_URL);request.timeout=20000;
const rpc=new JsonRpcProvider(request,11155111,{staticNetwork:true,batchMaxCount:1});
const contract=new Contract(address,artifact.abi,rpc);
const evidence=JSON.parse(await fs.readFile(path.join(folder,'sepolia-e2e-evidence.json'),'utf8'));
const pool=new Pool({connectionString:databaseEnv.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const publicValue=value=>typeof value==='bigint'?String(value):Array.isArray(value)?value.map(publicValue):value;
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const write=async(name,value)=>fs.writeFile(path.join(folder,name),json(value));
const exportSafe=text=>{
  for(const [key,value]of Object.entries({...configured,...wallets,...databaseEnv}))if(/KEY|SECRET|TOKEN|PASSWORD|DATABASE|RPC/.test(key)&&value.length>=8){if(text.includes(value)||(value.startsWith('0x')&&text.includes(value.slice(2))))throw new Error('SECRET_EXPORT_REJECTED');}
};
// Third-party diagnostics must not print connection URLs or decryption payloads.
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
for(const method of ['log','warn','error','info','debug'])console[method]=()=>{};
const started=new Date().toISOString();
try{
  if(Number(BigInt(await rpc.send('eth_chainId',[])))!==11155111)throw new Error('NETWORK_TARGET_REJECTED');
  const hashes=[...new Set([...evidence.transactionsSentByBrowserWallet.map(v=>v.hash),...evidence.steps.flatMap(v=>v.comparisonTxHash?[v.comparisonTxHash]:[])])];
  const receipts=[];
  for(const txHash of hashes){const receipt=await rpc.getTransactionReceipt(txHash);if(!receipt)throw new Error('RECEIPT_MISSING');const block=await rpc.getBlock(receipt.blockNumber);
    const events=receipt.logs.filter(log=>log.address.toLowerCase()===address.toLowerCase()).map(log=>{let decoded=null;try{const item=iface.parseLog(log);decoded={name:item.name,args:Object.fromEntries(item.fragment.inputs.map((field,i)=>[field.name,publicValue(item.args[i])]))};}catch{}
      return {address:log.address,transactionHash:log.transactionHash,blockNumber:log.blockNumber,index:log.index,topics:log.topics,data:log.data,decoded};});
    const entry={transactionHash:txHash,status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,blockTimestampUtc:new Date(block.timestamp*1000).toISOString(),
      from:receipt.from,to:receipt.to,gasUsed:String(receipt.gasUsed),gasPrice:String(receipt.gasPrice),confirmations:await receipt.confirmations(),events,originalReceipt:receipt.toJSON()};
    exportSafe(json(entry));receipts.push(entry);emit({stage:'receipt',txHash,status:receipt.status,block:receipt.blockNumber});}
  await write('receipts-events.json',{sourceCommit:'5e69fc81cc59f2b97df34f6bf2a6a6c12e259f03',chainId:11155111,contractAddress:address,startedAtUtc:started,receipts});
  const state=[];
  for(const step of evidence.steps.filter(step=>step.step.startsWith('issue-'))){const record=await contract.getCredential(step.credentialId);
    state.push({credentialId:step.credentialId,scenario:step.step,returnedFields:Object.fromEntries(iface.getFunction('getCredential').outputs[0].components.map((field,i)=>[field.name,publicValue(record[i])]))});}
  await write('credential-state.json',{checkedBlock:await rpc.getBlockNumber(),chainId:11155111,contractAddress:address,state});
  const client=await pool.connect();await client.query('SET default_transaction_read_only = on');await client.query("SET statement_timeout='10s'");
  const {rows}=await client.query('SELECT body FROM verification_state WHERE id=1');const body=rows[0]?.body||{};
  const proofIds=evidence.steps.filter(step=>step.step.startsWith('issue-')).map(step=>step.credentialId);
  const proofs=await client.query('SELECT credential_id, body FROM signed_credentials WHERE credential_id=ANY($1::text[])',[proofIds]);
  const publicProofs=proofs.rows.map(row=>({credentialId:row.credential_id,signed:row.body.signed,issuanceTxHash:row.body.issuanceTxHash,createdAt:row.body.createdAt}));
  exportSafe(json(publicProofs));await write('signed-credential-proofs.json',{source:'Public signed proof bundles for synthetic credentials newly issued in this run; private documentDate field and owner metadata excluded.',proofs:publicProofs});
  const jobs=[];
  for(const step of evidence.steps.filter(step=>step.requestId)){const job=body.jobs?.[step.requestId];if(!job||job.credentialId&&job.credentialId!==step.credentialId)throw new Error('JOB_BINDING_REJECTED');
    const picked=Object.fromEntries(['id','status','decision','reason','createdAt','expiresAt','artifactsExpireAt','credentialId','expectedCredentialId','digest','fileName','fileSize','mimeType','mode','synthetic','checkedAt','checkedBlock','chainId','contractAddress','txHash','ocrConfigHash','ocrConfigVersion','verifiedPage','attempts','diagnosticCode','issuanceTxHash'].filter(k=>job[k]!==undefined).map(k=>[k,job[k]]));
    let extraction=null;try{const bytes=await fs.readFile(path.join(databaseEnv.PRIVATE_DATA_DIR,'jobs',job.id,'ocr.json'));const original=JSON.parse(bytes.toString());extraction={sourceArtifactSha256:hash(bytes),
      fields:original.fields,qrCandidates:original.qrCandidates,qrPage:original.qrPage,templateId:original.templateId,dateFormat:original.dateFormat,
      ocrConfigHash:original.ocrConfigHash,ocrConfigVersion:original.ocrConfigVersion,errorCode:original.errorCode};}catch(error){if(error.code!=='ENOENT')throw error;}
    jobs.push({scenario:step.step,job:picked,extraction,returnedResultFields:step.fields});}
  const budget=body.relayerBudget?{windowEndsAt:body.relayerBudget.windowEndsAt,reservedJobCount:body.relayerBudget.jobs?.length}:null;
  client.release();exportSafe(json(jobs));await write('job-ocr-policy.json',{readOnly:true,source:'isolated PostgreSQL job state and isolated local OCR artifact; session/owner/CSRF/workflow/lease tokens excluded',jobs,relayerBudget:budget});
  const endBlock=await rpc.getBlockNumber();const preflight=JSON.parse(await fs.readFile(path.join(out,'evidence/sepolia/preflight-bytecode.json'),'utf8'));
  const fromBlock=preflight.checkedBlock;
  const logs=await rpc.getLogs({address,fromBlock,toBlock:endBlock,topics:[iface.getEvent('ComparisonRequested').topicHash]});
  const comparisons=logs.map(log=>{const item=iface.parseLog(log);return{requestId:String(item.args.requestId),credentialId:String(item.args.credentialId),transactionHash:log.transactionHash,blockNumber:log.blockNumber};});
  const rejected=jobs.filter(v=>!v.job.txHash).map(v=>({scenario:v.scenario,requestId:v.job.id,status:v.job.status,decision:v.job.decision,txHash:null,
    comparisonEventForThisRequestPresent:comparisons.some(e=>e.requestId===v.job.id)}));
  await write('no-comparison-event-scan.json',{method:'Full inclusive contract ComparisonRequested scan from preflight block to post-demo block; compare public request IDs against every rejected job. This is stronger than absence of a wallet popup.',
    chainId:11155111,contractAddress:address,fromBlock,toBlock:endBlock,fullContractEventCount:comparisons.length,events:comparisons,rejectedCases:rejected,
    comparisonJobCount:jobs.filter(j=>j.job.txHash).length,allRejectedHaveNoComparisonEvent:rejected.every(v=>!v.comparisonEventForThisRequestPresent)});
  const fixtureFiles=(await fs.readdir(folder)).filter(file=>file.endsWith('.pdf'));const fixtures=[];
  for(const file of fixtureFiles){const bytes=await fs.readFile(path.join(folder,file));fixtures.push({file,bytes:bytes.length,sha256:hash(bytes),synthetic:true});}
  await write('fixture-manifest.json',{fixtures,groundTruth:'Synthetic profiles and intentional single name alteration/QR substitution specified in revision-sepolia.spec.ts; freshly issued public IDs bound by receipts/events.'});
  const decryptions=[];
  if(process.argv.includes('--decrypt')){
    const {createInstance,SepoliaConfig}=require('@zama-fhe/relayer-sdk/node');
    const reader=new Wallet(wallets.RESULT_READER_PRIVATE_KEY);const keys=['full_name','diploma_number','study_program','graduation_date'];
    for(const step of evidence.steps.filter(step=>step.comparisonTxHash)){
      const comparison=await contract.getComparison(step.requestId);if(String(comparison.credentialId)!==step.credentialId||String(comparison.resultReader).toLowerCase()!==reader.address.toLowerCase())throw new Error('COMPARISON_BINDING_REJECTED');
      const bootstrap=performance.now();const instance=await createInstance({...SepoliaConfig,network:configured.RPC_URL});const sdkBootstrapSeconds=(performance.now()-bootstrap)/1000;
      const pair=instance.generateKeypair();const startTimestamp=Math.floor(Date.now()/1000)-60;
      const typed=instance.createEIP712(pair.publicKey,[address],startTimestamp,1);
      const types=Object.fromEntries(Object.entries(typed.types).filter(([name])=>name!=='EIP712Domain'));
      const signature=await reader.signTypedData(typed.domain,types,typed.message);
      const handles=[...comparison.fields,comparison.allMatch];const timer=performance.now();
      const result=await instance.userDecrypt(handles.map(handle=>({handle,contractAddress:address})),pair.privateKey,pair.publicKey,signature,[address],reader.address,startTimestamp,1,{timeout:60000,signal:AbortSignal.timeout(60000)});
      const values=handles.map(handle=>{if(typeof result[handle]!=='boolean')throw new Error('NON_BOOLEAN_RESULT');return result[handle];});
      const entry={scenario:step.step,requestId:step.requestId,credentialId:step.credentialId,txHash:step.comparisonTxHash,readerAddress:reader.address,
        fields:Object.fromEntries(keys.map((key,i)=>[key,values[i]])),allMatch:values[4],sdkBootstrapSeconds,userDecryptSeconds:(performance.now()-timer)/1000,
        agreementWithUI:keys.every((key,i)=>(step.fields.find(v=>v.key===key)?.status==='MATCH')===values[i])};
      decryptions.push(entry);await write('fhe-decryption-confirmation.json',{method:'New read-only authorized Zama userDecrypt of results created by this current run; no broadcast. Follow-up timers are separate from original UI latency.',samples:decryptions});emit({stage:'decryption',scenario:step.step,allMatch:entry.allMatch,agreement:entry.agreementWithUI});
    }
  }
  await write('collector-context.json',{startedAtUtc:started,finishedAtUtc:new Date().toISOString(),primaryKeyUsed:false,readOnly:true,transactionCount:receipts.length,jobCount:jobs.length,followupDecryptionSamples:decryptions.length,exitCode:0});
}catch(error){await write('collector-failure.json',{atUtc:new Date().toISOString(),category:error.code||error.message?.match(/^[A-Z_]+$/)?.[0]||'COLLECTION_UNAVAILABLE',name:error.name,readOnly:true});emit({stage:'failed',category:error.code||'COLLECTION_UNAVAILABLE'});process.exitCode=1;}
finally{await pool.end();rpc.destroy();}
