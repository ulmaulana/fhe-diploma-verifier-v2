import { describe, expect, it } from 'vitest';
import { articles } from '../../src/features/help/content';
import { searchArticles } from '../../src/features/help/search';

describe('guide topic search', () => {
  it.each([
    ['gimana upload ijzah', 'unggahan'],
    ['cara menghapus data', 'hapus'],
    ['hasil tidak cocok', 'berbeda'],
    ['kenapa dokumen tidak terbaca', 'ocr'],
    ['wallte kampus terbitkan', 'penerbit'],
    ['download laporan', 'laporan'],
    ['data saya aman atau bocor', 'privasi'],
    ['loading macet', 'gagal'],
    ['blockchain apa yang dipake', 'blockchain'],
    ['fungsi sepolia', 'sepolia'],
    ['fungsi zamafhe', 'zama'],
    ['beda zama sepolia', 'peran-jaringan'],
    ['alur sistem belakang layar', 'alur'],
    ['siapa bayar gas', 'gas'],
    ['template D1', 'unggahan'],
    ['buat pdf ijazah', 'pdf'],
  ])('finds the intended topic for %s', (query, id) => {
    expect(searchArticles(query)[0]?.article.id).toBe(id);
  });
  it('prioritizes every exact article title', () => {
    for (const article of articles) expect(searchArticles(article.title)[0]?.article.id).toBe(article.id);
  });
  it('supports partial input and punctuation', () => {
    expect(searchArticles('UPLOA!')[0]?.article.id).toBe('unggahan');
    expect(searchArticles('Q')[0]).toBeUndefined();
    expect(searchArticles('QR').some(result=>result.article.id==='qr')).toBe(true);
  });
  it('does not invent results for unrelated topics', () => {
    expect(searchArticles('resep nasi goreng')).toEqual([]);
    expect(searchArticles('zzzzzzzzzz')).toEqual([]);
    expect(searchArticles('bagaimana saya')).toEqual([]);
  });
  it('returns the guide index for blank input', () => {
    expect(searchArticles('   ').map(result=>result.article.id)).toEqual(articles.map(article=>article.id));
  });
});
