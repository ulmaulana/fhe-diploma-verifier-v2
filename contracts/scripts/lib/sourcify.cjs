// Source verification through the Sourcify API v2 (POST /v2/verify/{chainId}/{address}). hardhat-verify 2.1.3
// still calls the retired /server/check-all-by-addresses endpoint (HTTP 404), so the task submits the exact
// standard JSON input from Hardhat's build-info itself.
const CONTRACT = 'src/VerifikasiIjazah.sol:VerifikasiIjazah';

async function verifyOnSourcify(hre, { address, chainId, creationTransactionHash, server = 'https://sourcify.dev/server', pollMs = 5000, polls = 36 }) {
  const buildInfo = await hre.artifacts.getBuildInfo(CONTRACT);
  if (!buildInfo) throw new Error('Build-info kontrak tidak ditemukan; jalankan build terlebih dahulu.');
  // solc-js reports e.g. "0.8.28+commit.7893614a.Emscripten.clang"; the compiler release is the same.
  const compilerVersion = buildInfo.solcLongVersion.replace(/\.Emscripten\.clang$/, '');
  const response = await fetch(`${server}/v2/verify/${chainId}/${address}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stdJsonInput: buildInfo.input, compilerVersion, contractIdentifier: CONTRACT, creationTransactionHash }),
  });
  const ticket = await response.json().catch(() => ({}));
  if (!response.ok) return { provider: 'sourcify-v2', status: 'rejected', httpStatus: response.status, error: ticket.customCode || ticket.message || null, compilerVersion };
  for (let attempt = 0; attempt < polls; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    const job = await (await fetch(`${server}/v2/verify/${ticket.verificationId}`)).json();
    if (job.isJobCompleted) {
      return { provider: 'sourcify-v2', verificationId: ticket.verificationId, compilerVersion,
        status: job.error ? 'failed' : 'verified', match: job.contract?.match ?? null,
        creationMatch: job.contract?.creationMatch ?? null, runtimeMatch: job.contract?.runtimeMatch ?? null,
        error: job.error ? (job.error.customCode || job.error.message || 'error') : null,
        repository: `https://repo.sourcify.dev/${chainId}/${address}` };
    }
  }
  return { provider: 'sourcify-v2', status: 'pending', verificationId: ticket.verificationId, compilerVersion };
}

module.exports = { verifyOnSourcify };
