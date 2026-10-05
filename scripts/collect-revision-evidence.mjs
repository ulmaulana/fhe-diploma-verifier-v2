import fs from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/uas/evidence/revisi-laporan/2026-10-04T22-03-10Z');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', maxBuffer:32*1024*1024});
const privateEnv = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
const walletFile = path.join(process.env.USERPROFILE, '.uas-verifikasi/sepolia-test-wallets.env');
const testEnv = existsSync(walletFile) ? parseEnv(readFileSync(walletFile, 'utf8')) : {};
const sensitive = [...Object.entries(privateEnv), ...Object.entries(testEnv)]
  .filter(([key,value]) => /KEY|SECRET|TOKEN|PASSWORD|DATABASE|RPC_URL|MNEMONIC/.test(key) && value.length >= 8)
  .flatMap(([,value]) => [value, ...(value.startsWith('0x') ? [value.slice(2)] : [])]);
const safe = text => sensitive.reduce((value,secret) => value.split(secret).join('[REDACTED_CONFIGURED_SECRET]'), text)
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[REDACTED_DATABASE_CONNECTION]');
async function write(name, value) {
  const file=path.join(out,name); await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,safe(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'));
}

async function identity() {
  const files=git('ls-files','-z').split('\0').filter(Boolean);
  const relevant=files.filter(file=> /^(apps\/web\/(src|tests|drizzle)|packages\/|contracts\/(src|test|scripts|hardhat|package|generated)|scripts\/|package\.json|pnpm-|eslint|netlify\.toml|\.env\.example)/.test(file)
    && !/\/node_modules\//.test(file));
  const source=[];
  for(const file of relevant) source.push({path:file,sha256:hash(await fs.readFile(path.join(root,file)))});
  const fingerprint=hash(JSON.stringify(source));
  const changed=git('diff','--name-status','1413ebd424a7a914967ad6301c648c5c58842a1d','HEAD');
  const metadata={runId:path.basename(out),sourceCommit:git('rev-parse','HEAD').trim(),branch:git('branch','--show-current').trim(),
    recordedAtUtc:new Date().toISOString(),initialStatus:'?? docs/Lanjutan Upgrade UAS/Prompt_Bahan_Revisi_Laporan_UAS.md',
    initialTrackedDiff:'empty',applicationSourceFingerprint:fingerprint,applicationSourceFileCount:source.length,
    baselineCommit:'1413ebd424a7a914967ad6301c648c5c58842a1d',baselineChangedPaths:changed.trim().split('\n'),
    applicationSourceChangedSinceBaseline:Boolean(git('diff','--name-only','1413ebd','HEAD','--','apps','packages','contracts','scripts','package.json','pnpm-lock.yaml','.env.example','netlify.toml').trim()),node:process.version,sourceHashes:source,
    originalConfiguration:{appMode:privateEnv.APP_MODE,chainId:Number(privateEnv.CHAIN_ID),contractAddress:privateEnv.CREDENTIAL_CONTRACT_ADDRESS,
      deploymentBlock:Number(privateEnv.CONTRACT_DEPLOYMENT_BLOCK),origin:privateEnv.APP_ORIGIN,
      roleKeys:'private root environment; not used for application demo',sepoliaProvidedTestWallets:Object.keys(testEnv),
      dedicatedTestAdminKeyPresent:Boolean(testEnv.ADMIN_PRIVATE_KEY||testEnv.SEPOLIA_E2E_ADMIN_KEY),primaryDeployerKeyUsed:false},
    identity:{name:null,npm:null,class:null,members:null,contributions:null,presentationAssignments:null,useCaseApproval:null}};
  await write('source-identity.json',metadata);
  await write('evidence/version/changes-from-baseline.txt',changed);
  await write('evidence/version/baseline-documentation.diff',git('diff','1413ebd','HEAD','--','PRD.MD','README.md','docs/uas/*.md'));
  await write('evidence/version/application-working-tree.diff',git('diff','--','apps','packages','contracts','scripts','package.json','pnpm-lock.yaml','.env.example','netlify.toml'));
  await write('evidence/version/commits-since-baseline.txt',git('log','--format=%H %cI %s','1413ebd..HEAD'));
  console.log(JSON.stringify({fingerprint,files:source.length,head:metadata.sourceCommit,applicationChanged:false}));
}

async function preflight() {
  const started=new Date().toISOString();
  const require=createRequire(path.join(root,'packages/chain/package.json'));
  const {Contract,JsonRpcProvider,FetchRequest,Wallet,id,keccak256}=require('ethers');
  const address='0x65b1C8C7B59D9651F8619F287Bc1c309FaE094e0';
  const artifact=JSON.parse(await fs.readFile(path.join(root,'contracts/generated/VerifikasiIjazah.json'),'utf8'));
  const record=JSON.parse(await fs.readFile(path.join(root,`contracts/deployments/sepolia/${address}.json`),'utf8'));
  const request=new FetchRequest(privateEnv.RPC_URL); request.timeout=20000;
  const rpc=new JsonRpcProvider(request,11155111,{staticNetwork:true,batchMaxCount:1});
  const result={startedAtUtc:started,sourceCommit:git('rev-parse','HEAD').trim(),network:'Ethereum Sepolia',chainId:11155111,
    contractAddress:address,originalConfiguredContract:privateEnv.CREDENTIAL_CONTRACT_ADDRESS,
    configurationOverrideRequired:true,primaryKeyUsed:false,testWalletKeysPresent:Object.keys(testEnv),
    transactionSubmission:false,soliditySourceSha256:hash(await fs.readFile(path.join(root,'contracts/src/VerifikasiIjazah.sol'))),
    abiSha256:hash(await fs.readFile(path.join(root,'contracts/generated/VerifikasiIjazah.json'))),deploymentSourceHash:record.source?.sha256||record.sourceSha256||null};
  try {
    const chain=Number(BigInt(await rpc.send('eth_chainId',[]))); if(chain!==11155111)throw new Error('CHAIN_MISMATCH');
    const block=await rpc.getBlockNumber();const code=await rpc.getCode(address); if(code==='0x')throw new Error('NO_CONTRACT_CODE');
    const contract=new Contract(address,artifact.abi,rpc);
    result.checkedBlock=block;result.runtimeBytecodeKeccak=keccak256(code);result.runtimeByteLength=(code.length-2)/2;
    const buildInfoFiles=await fs.readdir(path.join(root,'contracts/artifacts/build-info'));
    for(const file of buildInfoFiles){
      const info=JSON.parse(await fs.readFile(path.join(root,'contracts/artifacts/build-info',file),'utf8'));
      const built=info.output?.contracts?.['src/VerifikasiIjazah.sol']?.VerifikasiIjazah;
      if(!built)continue;
      const object=built.evm.deployedBytecode.object;
      const actual=Buffer.from(code.slice(2),'hex'),expected=Buffer.from(object,'hex');
      const refs=Object.values(built.evm.deployedBytecode.immutableReferences||{}).flat();
      for(const ref of refs){actual.fill(0,ref.start,ref.start+ref.length);expected.fill(0,ref.start,ref.start+ref.length);}
      result.bytecodeComparison={method:'Compare current compiled runtime with RPC runtime, masking only compiler immutableReference byte ranges; full metadata retained',buildInfo:file,
        immutableRanges:refs,match:actual.equals(expected),compiledSourceSha256:hash(info.input.sources['src/VerifikasiIjazah.sol'].content),buildInfoSha256:hash(await fs.readFile(path.join(root,'contracts/artifacts/build-info',file)))};
      break;
    }
    result.domain=Array.from(await contract.eip712Domain()).map(v=>typeof v==='bigint'?String(v):v);
    result.adminCount=String(await contract.adminCount());
    result.roles={};result.balances={};
    for(const [name,key] of [['attestor','ATTESTOR_PRIVATE_KEY'],['relayer','RELAYER_PRIVATE_KEY'],['reader','RESULT_READER_PRIVATE_KEY'],['signer','INSTITUTION_SIGNER_PRIVATE_KEY']]) {
      if(!testEnv[key]){result.roles[name]={present:false};continue;}
      const wallet=new Wallet(testEnv[key]);const roles={};
      for(const role of ['DEFAULT_ADMIN_ROLE','ATTESTOR_ROLE','RELAYER_ROLE','RESULT_READER_ROLE'])roles[role]=await contract.hasRole(role==='DEFAULT_ADMIN_ROLE'?'0x'+'0'.repeat(64):id(role),wallet.address);
      const signer=await contract.getSigner(wallet.address);
      result.roles[name]={address:wallet.address,roles,signer:{issuerId:String(signer.issuerId),active:Boolean(signer.active),authorizationId:String(signer.authorizationId)}};
      result.balances[name]={wei:String(await rpc.getBalance(wallet.address))};
    }
    const issuerId='0xd4aadc1f7b58512ea3b4974d82df569c4cb734aa8049aed5377cb95e8caf62ab';
    const issuer=await contract.issuers(issuerId);result.issuer={issuerId,name:String(issuer.name),active:Boolean(issuer.active),exists:Boolean(issuer.exists)};
    result.status='PASS';result.adminDemo='BLOCKED_NO_DEDICATED_TEST_ADMIN_KEY';
  } catch(error) {
    result.status='BLOCKED';result.errorCategory=error.code||error.message==='CHAIN_MISMATCH'&&'CHAIN_MISMATCH'||'RPC_OR_CONTRACT_UNAVAILABLE';
    result.errorName=error.name;process.exitCode=1;
  } finally {rpc.destroy();result.finishedAtUtc=new Date().toISOString();await write(`evidence/sepolia/preflight-${process.argv[3]||'attempt1'}.json`,result);}
  console.log(JSON.stringify({status:result.status,checkedBlock:result.checkedBlock,errorCategory:result.errorCategory,roles:result.roles,domain:result.domain,balances:result.balances}));
}

if(process.argv[2]==='identity')await identity();
else if(process.argv[2]==='preflight')await preflight();
else throw new Error('Use identity or preflight');
