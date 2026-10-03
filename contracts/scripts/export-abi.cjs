const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const artifact = JSON.parse(readFileSync(join(__dirname, '../artifacts/src/VerifikasiIjazah.sol/VerifikasiIjazah.json'), 'utf8'));
mkdirSync(join(__dirname, '../generated'), { recursive: true });
writeFileSync(join(__dirname, '../generated/VerifikasiIjazah.json'), JSON.stringify({
  contractName: artifact.contractName, sourceName: artifact.sourceName, abi: artifact.abi,
}, null, 2) + '\n');
