import { isCredentialId, requireHex32, type Hex32 } from "../schema";

export type QrResult = { ok: true; credentialId: Hex32 } | { ok: false; reason: string };

/** Parses locally. Never fetches a URL from an untrusted QR payload. */
export function parseCredentialQr(value: string, appOrigin: string): QrResult {
  try {
    const expected = new URL(appOrigin);
    if (!/^https?:$/.test(expected.protocol)) throw new Error("Invalid application origin");
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.origin !== expected.origin || url.username || url.password) {
      return { ok: false, reason: "QR berasal dari origin lain atau format tautannya tidak didukung." };
    }
    const match = /^\/c\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
    if (!match || url.search || url.hash || value !== value.trim()) {
      return { ok: false, reason: "Format QR tidak valid; gunakan QR rekaman resmi penerbit." };
    }
    // Reject encoded/dot-segment forms URL would otherwise silently canonicalize.
    const canonical = `${url.origin}/c/${match[1]}`;
    if (value !== canonical) return { ok: false, reason: "Format tautan QR bukan format resmi yang didukung." };
    return { ok: true, credentialId: requireHex32(match[1]!) };
  } catch {
    return { ok: false, reason: "QR bukan tautan rekaman yang valid." };
  }
}

export function resolveQrCandidates(candidates: string[], appOrigin: string, expectedCredentialId?: string): QrResult {
  if (candidates.length === 0) return { ok: false, reason: "QR tidak ditemukan pada dokumen. Unggah halaman ijazah dengan QR yang jelas." };
  const ids = new Set<Hex32>();
  for (const candidate of candidates) {
    const parsed = parseCredentialQr(candidate, appOrigin);
    if (!parsed.ok) return parsed;
    ids.add(parsed.credentialId);
  }
  if (ids.size !== 1) return { ok: false, reason: "Ditemukan lebih dari satu kandidat rekaman. QR ambigu tidak dipilih otomatis." };
  const credentialId = [...ids][0]!;
  if (expectedCredentialId !== undefined && (!isCredentialId(expectedCredentialId) || expectedCredentialId.toLowerCase() !== credentialId)) {
    return { ok: false, reason: "QR pada unggahan berbeda dari rekaman pada tautan awal." };
  }
  return { ok: true, credentialId };
}

export function credentialQrUrl(credentialId: string, appOrigin: string): string {
  const origin = new URL(appOrigin);
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) throw new Error("Invalid application origin");
  return `${origin.origin}/c/${requireHex32(credentialId)}`;
}
