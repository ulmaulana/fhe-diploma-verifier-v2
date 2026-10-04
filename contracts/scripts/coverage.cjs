// Cross-platform equivalent of `SOLIDITY_COVERAGE=true hardhat coverage` (zama-ai/fhevm-hardhat-template).
// The FHEVM mock plugin requires this flag under solidity-coverage; tests still assert fhevm.isMock.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

function coverage() {
  return spawnSync(process.execPath, [require.resolve('hardhat/internal/cli/cli'), 'coverage', '--solcoverjs', './solcover.config.cjs', ...process.argv.slice(2)], {
    cwd: resolve(__dirname, '..'), env: { ...process.env, SOLIDITY_COVERAGE: 'true' }, stdio: 'inherit',
  }).status ?? 1;
}

let status = coverage();
if (status !== 0) {
  // solidity-coverage compiles the instrumented contract inside the test process. On such a run Hardhat
  // cannot decode custom errors (see docs/uas/evidence/debugging/C2-*), so regex assertions fail although
  // the reverts are correct. A second run uses the cached instrumented build; a real failure fails again.
  console.error('\n[coverage] First attempt failed. Re-running once with the cached instrumented build.\n');
  status = coverage();
}
process.exitCode = status;
