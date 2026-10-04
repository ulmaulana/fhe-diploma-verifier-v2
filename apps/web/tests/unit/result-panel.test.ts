import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIELD_KEYS, FIELD_LABELS, type VerificationDecision } from '@verifikasi/domain';
import { ResultPanel } from '../../src/features/verification/ResultPanel';
import type { VerificationJob } from '../../src/features/verification/types';

function result(decision: VerificationDecision, confidence: (number | null)[]): VerificationJob {
  return {
    id: 'result-panel-fixture', requestId: 'result-panel-fixture', status: 'COMPLETED', decision,
    fileName: 'synthetic.pdf', fileSize: 1, createdAt: '2026-10-05T00:00:00Z',
    expiresAt: '2026-10-06T00:00:00Z', artifactsExpireAt: '2026-10-05T01:00:00Z',
    fields: FIELD_KEYS.map((key, index) => ({ key, label: FIELD_LABELS[key], text: `fixture ${key}`,
      confidence: confidence[index]!, status: decision === 'MISMATCH' && index === 0 ? 'MISMATCH' : 'MATCH' })),
    mode: 'DOCUMENT', environment: 'testnet', synthetic: false, recordVerificationStatus: 'VERIFIED_RECORD',
    documentDecision: decision, scope: 'CHECKED_ATTRIBUTES', reportAvailable: true,
  };
}
const render = (job: VerificationJob) => renderToStaticMarkup(createElement(ResultPanel, { job, onRetry: () => {} }));

describe('OCR confidence information in document results', () => {
  it('keeps MATCH and field matches when one field has low reading confidence', () => {
    const html = render(result('MATCH', [0.4, 0.8, 0.9, 0.95]));
    expect(html).toContain('Atribut cocok');
    expect(html.match(/Keyakinan pembacaan rendah/g)).toHaveLength(1);
    expect(html.match(/field-status match/g)).toHaveLength(4);
    expect(html).not.toContain('Belum dapat diverifikasi');
  });

  it('keeps the FHE mismatch visible independently of mixed reading confidence', () => {
    const html = render(result('MISMATCH', [0.2, 0.7, 0.3, 0.4]));
    expect(html).toContain('Ditemukan ketidaksesuaian');
    expect(html.match(/Keyakinan pembacaan rendah/g)).toHaveLength(3);
    expect(html).toContain('field-status mismatch');
    expect(html).not.toContain('Belum dapat diverifikasi');
  });

  it('treats exactly 70% as sufficient and does not retain the old 90% warning threshold', () => {
    const html = render(result('MATCH', [0.7, 0.75, 0.85, 0.9]));
    expect(html).not.toContain('confidence-note');
    expect(html).toContain('Atribut cocok');
  });

  it('labels unavailable or invalid scores separately from valid low confidence', () => {
    const html = render(result('MATCH', [null, NaN, -0.1, 1.01]));
    expect(html).toContain('Keyakinan pembacaan tidak tersedia');
    expect(html.match(/Skor keyakinan tidak valid/g)).toHaveLength(3);
    expect(html).not.toContain('Keyakinan pembacaan rendah');
  });
});
