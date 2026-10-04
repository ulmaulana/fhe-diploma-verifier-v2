require('@fhevm/hardhat-plugin');
require('@nomicfoundation/hardhat-ethers');
// Coverage and source verification follow zama-ai/fhevm-hardhat-template (solidity-coverage 0.8.17, hardhat-verify 2.1.3).
require('solidity-coverage');
require('@nomicfoundation/hardhat-verify');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// Pinned local compiler makes offline builds reproducible after workspace install.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion !== '0.8.28') return runSuper();
  return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true,
    version: solcVersion, longVersion: require('solc').version() };
});

module.exports = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'cancun' } },
  paths: { sources: './src', tests: './test', artifacts: './artifacts', cache: './cache' },
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: { chainId: 11155111, url: process.env.RPC_URL || 'http://127.0.0.1:8545',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [] },
  },
  // Sourcify needs no API key. Etherscan verification is used only when ETHERSCAN_API_KEY is configured.
  sourcify: { enabled: true },
  etherscan: { enabled: Boolean(process.env.ETHERSCAN_API_KEY), apiKey: process.env.ETHERSCAN_API_KEY || '' },
};
