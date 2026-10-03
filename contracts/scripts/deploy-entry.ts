import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const cli=require.resolve('hardhat/internal/cli/cli');
const child=spawn(process.execPath,[cli,'run','scripts/deploy.cjs','--network','sepolia'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:process.env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
