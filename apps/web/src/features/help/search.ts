import { articles } from './content';

const keywords: Record<string, string> = {
  mulai: 'cara cek verifikasi ijazah langkah mulai validasi',
  qr: 'qr barcode kode pindai scan kamera tautan link',
  unggahan: 'unggah upload foto scan gambar pdf jpg png ukuran batas file berkas buram blur resolusi password',
  rekaman: 'rekaman terverifikasi blockchain on chain sah valid',
  hasil: 'hasil cocok sesuai match arti status hijau',
  esign: 'esign e sign tanda tangan digital elektronik signature pengesahan',
  berbeda: 'berbeda tidak cocok tidak sama salah kesalahan typo koreksi mismatch',
  bukti: 'bukti tidak valid invalid proof signature rusak',
  ocr: 'ocr gagal terbaca tidak terbaca buram belum diverifikasi format tanggal ambigu',
  pencabutan: 'cabut dicabut pencabutan revoke revoked batal batalkan nonaktif',
  privasi: 'privasi keamanan aman rahasia bocor enkripsi fhe zama akses siapa membaca',
  hapus: 'hapus menghapus hilang penyimpanan simpan berapa lama durasi riwayat delete',
  laporan: 'laporan unduh download hasil pdf cetak report',
  gagal: 'error gagal gangguan terganggu loading lama macet timeout coba ulang koneksi jaringan',
  penerbit: 'terbitkan penerbitan ijazah mahasiswa kampus institusi wallet dompet akun daftar login masuk buat pdf',
};
const stopwords = new Set('apa apakah bagaimana gimana gmn bagaimanakah mengapa kenapa kapan siapa yang dan atau di ke dari untuk dengan pada dalam oleh ini itu saya aku anda mau ingin dong ya nya sih kok cara tentang sebuah suatu bisa dapat agar supaya kalau jika tolong mencari cari carikan jelaskan dipakai dipake digunakan pakai'.split(' '));
const synonyms: Record<string, string> = {};
for (const group of [
  ['unggah', 'upload', 'unggahan', 'mengunggah', 'mengupload'],
  ['unduh', 'download', 'mengunduh'], ['pindai', 'scan', 'scanning'],
  ['wallet', 'dompet'], ['institusi', 'kampus', 'universitas'],
  ['hapus', 'menghapus', 'penghapusan', 'delete'], ['cabut', 'dicabut', 'pencabutan', 'revoke', 'revoked'],
  ['verifikasi', 'memverifikasi', 'diverifikasi', 'validasi', 'cek'],
  ['terbitkan', 'menerbitkan', 'penerbitan', 'terbit'], ['buram', 'blur', 'kabur'],
  ['dokumen', 'file', 'berkas'], ['ijazah', 'diploma'], ['gagal', 'error', 'gangguan', 'terganggu'],
  ['berbeda', 'beda', 'mismatch'], ['terbaca', 'kebaca'], ['tidak', 'ga', 'gak', 'nggak', 'ngga'],
]) for (const word of group) synonyms[word] = group[0]!;

export function normalizeSearch(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(value: string) {
  const words = normalizeSearch(value).split(' ').map(word => synonyms[word] || word).join(' ').replace(/\btidak (?:cocok|sama|sesuai)\b/g, 'berbeda');
  return [...new Set(words.split(' ').filter(word => word && !stopwords.has(word)))];
}
const index = articles.map(article => ({ article, title: tokens(article.title), body: tokens([article.body, ...(article.steps || [])].join(' ')), keywords: tokens(`${keywords[article.id] || ''} ${article.keywords || ''}`) }));
const vocabulary = [...new Set(index.flatMap(item => [...item.title, ...item.body, ...item.keywords]))];
const frequency = new Map(vocabulary.map(word => [word, index.filter(item => [...item.title, ...item.body, ...item.keywords].includes(word)).length]));
const spellingVocabulary = [...new Set([...vocabulary, ...Object.keys(synonyms)])];

// Adjacent transpositions count as one typo (e.g. "ijzah" or "wallte").
function distance(left: string, right: string) {
  const grid = Array.from({ length: left.length + 1 }, (_, i) => Array.from({ length: right.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    grid[i]![j] = Math.min(grid[i - 1]![j]! + 1, grid[i]![j - 1]! + 1, grid[i - 1]![j - 1]! + Number(left[i - 1] !== right[j - 1]));
    if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) grid[i]![j] = Math.min(grid[i]![j]!, grid[i - 2]![j - 2]! + 1);
  }
  return grid[left.length]![right.length]!;
}
function alternatives(word: string) {
  if (frequency.has(word)) return [{ word, weight: 1 }];
  const prefixes = word.length >= 3 ? spellingVocabulary.filter(candidate => candidate.startsWith(word)).map(candidate => ({ word: synonyms[candidate] || candidate, weight: .8 })) : [];
  if (prefixes.length) return prefixes;
  if (word.length < 4) return [];
  const maximum = word.length >= 7 ? 2 : 1;
  const close = spellingVocabulary.filter(candidate => Math.abs(candidate.length - word.length) <= maximum).map(candidate => ({ word: candidate, distance: distance(word, candidate) })).filter(candidate => candidate.distance <= maximum);
  const best = Math.min(...close.map(candidate => candidate.distance));
  return close.filter(candidate => candidate.distance === best).map(candidate => ({ word: synonyms[candidate.word] || candidate.word, weight: .65 }));
}

export function searchArticles(query: string) {
  const normalized = normalizeSearch(query.slice(0, 160));
  const words = tokens(normalized).slice(0, 12);
  if (!normalized) return articles.map(article => ({ article, score: 0 }));
  if (!words.length) return [];
  const variants = words.map(alternatives);
  const matches = index.map(item => {
    let score = 0; let matched = 0;
    for (const options of variants) {
      let best = 0;
      for (const option of options) {
        const field = item.title.includes(option.word) ? 4.1 : item.keywords.includes(option.word) ? 4 : item.body.includes(option.word) ? 1 : 0;
        best = Math.max(best, field * option.weight * (1 + Math.log((articles.length + 1) / ((frequency.get(option.word) || 0) + 1))));
      }
      if (best > 0) matched++;
      score += best;
    }
    if (matched < Math.ceil(words.length * .6)) return { article: item.article, score: 0 };
    score *= matched / words.length;
    if (normalizeSearch(item.article.title).includes(normalized)) score += 12;
    return { article: item.article, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return matches.filter(item => item.score >= (matches[0]?.score || 0) * .4);
}

export const recommendedArticles = ['mulai', 'unggahan', 'penerbit', 'privasi'].map(id => articles.find(article => article.id === id)!);
