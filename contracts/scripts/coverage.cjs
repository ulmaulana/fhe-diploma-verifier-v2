// Cross-platform equivalent of `SOLIDITY_COVERAGE=true hardhat coverage` (zama-ai/fhevm-hardhat-template).
// The FHEVM mock plugin requires this flag under solidity-coverage; tests still assert fhevm.isMock.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const result = spawnSync(process.execPath, [require.resolve('hardhat/internal/cli/cli'), 'coverage', ...process.argv.slice(2)], {
  cwd: resolve(__dirname, '..'), env: { ...process.env, SOLIDITY_COVERAGE: 'true' }, stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
