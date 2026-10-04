// Compatibility wrapper for `hardhat run scripts/deploy.cjs --network sepolia`.
// The deployment logic, role-separation preflight and record live in the uas:deploy task.
// Without DEPLOY_EXECUTE=true this only prints the preflight plan.
const hre = require('hardhat');

hre.run('uas:deploy', { expectedChainId: 11155111, confirmations: 2, execute: process.env.DEPLOY_EXECUTE === 'true' })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
