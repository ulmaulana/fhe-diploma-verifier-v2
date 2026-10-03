import { randomUUID } from 'node:crypto';
import { FIELD_KEYS } from '@verifikasi/domain';
import { ApiError, config } from './config';
import { limit } from './http';
import { finish } from './jobs';
import { withState } from './store';
import { FIELD_LABELS, type Decision, type Job, type Session } from './types';

export async function createDemo(current: Session, scenario: unknown) {
  if (config().mode !== 'demo') throw new ApiError(404, 'DEMO_DISABLED', 'Contoh hanya tersedia pada mode demonstrasi.');
  const decisions: Record<string, Decision> = { match: 'MATCH', mismatch: 'MISMATCH', revoked: 'REVOKED', not_found: 'NOT_FOUND', invalid_proof: 'INVALID_PROOF', inconclusive: 'INCONCLUSIVE', error: 'ERROR' };
  const decision = typeof scenario === 'string' ? decisions[scenario] : undefined;
  if (!decision) throw new ApiError(400, 'INVALID_SCENARIO', 'Pilih skenario contoh yang tersedia.');
  const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + config().historyMs).toISOString();
  const job: Job = { id: randomUUID(), owner: current.id, idempotencyKey: randomUUID(), status: 'RECEIVED', fileName: 'CONTOH - ijazah sintetis.pdf', fileSize: 0, mimeType: 'application/pdf', createdAt: now, expiresAt, artifactsExpireAt: expiresAt, mode: 'demo', synthetic: true, attempts: 0, credentialId: `0x${'12'.repeat(32)}`, issuerName: 'Universitas Contoh Nusantara (data sintetis)' };
  await withState(state => { limit(state, `demo:${current.id}`, 30, 3600_000); state.jobs[job.id] = job; });
  const texts = { full_name: 'ANDI PRATAMA (CONTOH)', diploma_number: decision === 'MISMATCH' ? 'CONTOH/2026/0099' : 'CONTOH/2026/0042', study_program: 'TEKNIK INFORMATIKA', graduation_date: '15 Agustus 2026' };
  const fields = FIELD_KEYS.map(key => ({ key, label: FIELD_LABELS[key], text: decision === 'INCONCLUSIVE' && key === 'full_name' ? 'A... PRATAMA' : texts[key], confidence: decision === 'INCONCLUSIVE' ? 0.62 : 0.98, status: decision === 'MATCH' ? 'MATCH' as const : decision === 'MISMATCH' ? key === 'diploma_number' ? 'MISMATCH' as const : 'MATCH' as const : 'NOT_COMPARED' as const }));
  const reasons: Record<Decision, string> = { MATCH: 'Contoh tampilan: keempat atribut cocok. Ini data sintetis, bukan hasil OCR atau transaksi FHE.', MISMATCH: 'Contoh tampilan: nomor ijazah berbeda. Ini data sintetis, bukan hasil pemeriksaan dokumen.', REVOKED: 'Contoh tampilan: penerbit telah mencabut kredensial sintetis ini.', NOT_FOUND: 'Contoh tampilan: ID sintetis tidak ditemukan pada rekaman contoh.', INVALID_PROOF: 'Contoh tampilan: bukti pengesahan tidak cocok dengan rekaman. Data sintetis.', INCONCLUSIVE: 'Contoh tampilan: nama belum terbaca jelas. Unggah dokumen dengan pencahayaan dan resolusi lebih baik.', ERROR: 'Contoh tampilan gangguan layanan. Tidak ada transaksi blockchain yang dikirim.' };
  await finish(job.id, { status: decision === 'ERROR' ? 'FAILED' : 'COMPLETED', decision, reason: reasons[decision] }, fields);
  return withState(state => state.jobs[job.id]!);
}
