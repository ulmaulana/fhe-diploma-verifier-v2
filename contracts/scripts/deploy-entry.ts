import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
// Runs the uas:deploy task on Sepolia. Dry-run (preflight only) unless --execute is passed explicitly.
const require=createRequire(import.meta.url);
const cli=require.resolve('hardhat/internal/cli/cli');
const child=spawn(process.execPath,[cli,'uas:deploy','--network','sepolia','--expected-chain-id','11155111',...process.argv.slice(2)],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:process.env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
