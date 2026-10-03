/** Log only allowlisted codes: RPC/driver messages can contain secrets or document data. */
export type DiagnosticStage = 'CONFIGURATION' | 'RPC' | 'PROOF_STORAGE' | 'SESSION_STORAGE' | 'OCR' | 'FHE' | 'ARCHIVE' | 'DISPATCH';
export function diagnostic(stage: DiagnosticStage, error: unknown) {
  const raw = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const code = ['CHAIN_CONFIGURATION_INVALID', 'INSUFFICIENT_FUNDS', 'NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'CALL_EXCEPTION', 'BAD_DATA', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '42P01', '28P01'].includes(raw) ? raw : `${stage}_UNAVAILABLE`;
  console.error(JSON.stringify({ event: 'verification_failure', stage, code }));
  return code;
}
export async function readWithRetry<T>(stage: DiagnosticStage, read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (attempt >= 2 || !['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '08006'].includes(code)) { diagnostic(stage, error); throw error; }
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}
