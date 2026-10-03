const hre = require('hardhat');

async function main() {
  const names = ['ADMIN_ADDRESS', 'ATTESTOR_ADDRESS', 'RELAYER_ADDRESS', 'RESULT_READER_ADDRESS'];
  const addresses = names.map((name) => {
    if (!process.env[name] || !hre.ethers.isAddress(process.env[name])) throw new Error(`Configure ${name}`);
    return process.env[name];
  });
  if (hre.network.name !== 'sepolia') throw new Error('This deployment script targets Sepolia only.');
  if (!process.env.RPC_URL || !process.env.DEPLOYER_PRIVATE_KEY) throw new Error('RPC_URL and DEPLOYER_PRIVATE_KEY required.');
  const contract = await hre.ethers.deployContract('VerifikasiIjazah', addresses);
  const receipt = await contract.deploymentTransaction().wait(2);
  console.log(JSON.stringify({ chainId: 11155111, address: await contract.getAddress(), transactionHash: receipt.hash, blockNumber: receipt.blockNumber }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
