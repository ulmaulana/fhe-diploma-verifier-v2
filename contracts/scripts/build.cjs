const { resolve } = require('node:path');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--force' && arg !== '--quiet')) {
    throw new Error('Usage: node scripts/build.cjs [--force] [--quiet]');
  }

  process.chdir(resolve(__dirname, '..'));
  const hre = require('hardhat');
  await hre.run('compile', { force: args.includes('--force'), quiet: args.includes('--quiet') });
  require('./export-abi.cjs');
}

// Hardhat 2's CLI calls process.exit() after the task. Let pending handles drain
// naturally as a mitigation for Windows shutdown races (nodejs/node#56645).
// Compiler/export errors still fail; a failed compile never re-exports old ABI.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
