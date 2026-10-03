import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractDocument } from '@verifikasi/ocr';
import { assessOcr, normalizeAttributes } from '@verifikasi/domain';
import { generateDiploma } from '../../src/server/diploma-pdf';

const id = `0x${'12'.repeat(32)}`;
const profile = { schemaVersion: 1, disclosurePolicyVersion: 1, issuerId: `0x${'34'.repeat(32)}` as `0x${string}`, issuerDisplayName: 'Universitas Contoh Indonesia', fullName: 'ANDI PRATAMA', diplomaNumber: 'IF-2026-001', studyProgram: 'TEKNIK INFORMATIKA' };
describe('generated diploma, real OCR and QR engines', () => {
  it.each([
    ['Maulana Y', 'IF', '2027-03-09'],
    ['Maulana Y', 'IF', '2026-08-15'],
    ['Budi S', 'TI', '2027-03-09'],
    ['Siti Aminah', 'Informatika', '2027-03-09'],
  ])('reads mixed case names and short programs: %s / %s / %s', async (fullName, studyProgram, graduationDate) => {
    const origin = 'https://sage-daifuku-cef5a6.netlify.app';
    const credentialId = '0x2c63873e2b80a168615fd1cf9580e2bab7e82a454ac287e9934ddc2d0c1957d3';
    const diplomaNumber = '199847723';
    const pdf = await generateDiploma({ credentialId, profile: { ...profile, issuerDisplayName: 'UNSIL', fullName, diplomaNumber, studyProgram }, graduationDate, origin, createdAt: '2026-09-27T00:00:00Z' });
    const extraction = await extractDocument(pdf, 'application/pdf');
    expect(extraction.errorCode).toBeUndefined();
    expect(extraction.qrCandidates).toEqual([`${origin}/c/${credentialId}`]);
    const assessment = assessOcr(extraction.fields, { templateSupported: Boolean(extraction.templateId), qrPage: extraction.qrPage ?? undefined, dateFormat: extraction.dateFormat });
    expect(assessment.issues).toEqual([]);
    expect(assessment.canonical).toEqual(normalizeAttributes({ full_name: fullName, diploma_number: diplomaNumber, study_program: studyProgram, graduation_date: graduationDate }));
  }, 120_000);
  it.each(['ANDI PRATAMA', 'ANDI PRATAMA PUTRA WIJAYA KUSUMA NUGRAHA SAPUTRA BUDI SANTOSO WIRAWAN SETIAWAN KURNIAWAN'])('reads all visible attributes including wrapped name %s', async fullName => {
    const pdf = await generateDiploma({ credentialId: id, profile: { ...profile, fullName }, graduationDate: '2026-08-15', origin: 'http://localhost:3000', createdAt: '2026-09-25T00:00:00Z' });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(841.89);
    const extraction = await extractDocument(pdf, 'application/pdf');
    expect(extraction.errorCode).toBeUndefined();
    expect(extraction.templateId).toBe('issued-diploma-v1');
    expect(extraction.qrCandidates).toEqual([`http://localhost:3000/c/${id}`]);
    const assessment = assessOcr(extraction.fields, { templateSupported: true, qrPage: extraction.qrPage ?? undefined, dateFormat: extraction.dateFormat });
    expect(assessment.issues).toEqual([]);
    expect(assessment.eligible).toBe(true);
    expect(assessment.canonical).toEqual(normalizeAttributes({ full_name: fullName, diploma_number: profile.diplomaNumber, study_program: profile.studyProgram, graduation_date: '2026-08-15' }));
  }, 120_000);
});
