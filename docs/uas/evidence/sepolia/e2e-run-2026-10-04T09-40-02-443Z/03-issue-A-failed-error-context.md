# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sepolia.spec.ts >> institution signer issues three synthetic credentials with EIP-712 e-sign and downloads their PDFs
- Location: tests\e2e\sepolia.spec.ts:241:5

# Error details

```
TimeoutError: locator.check: Timeout 300000ms exceeded.
Call log:
  - waiting for getByLabel(/Saya telah meninjau data ini/)

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e2]:
    - link "Lewati ke konten" [ref=f2e3] [cursor=pointer]:
      - /url: "#main"
    - complementary "Navigasi utama" [ref=f2e4]:
      - generic [ref=f2e5]:
        - link "verifikasi" [ref=f2e6] [cursor=pointer]:
          - /url: /
        - button "Ringkas sidebar" [ref=f2e7] [cursor=pointer]
      - navigation [ref=f2e12]:
        - link "Beranda" [ref=f2e14] [cursor=pointer]:
          - /url: /
        - link "Verifikasi Ijazah" [ref=f2e21] [cursor=pointer]:
          - /url: /verifikasi
        - link "Riwayat Saya" [ref=f2e29] [cursor=pointer]:
          - /url: /riwayat
        - link "Panduan" [ref=f2e36] [cursor=pointer]:
          - /url: /panduan
      - generic [ref=f2e43]:
        - generic [ref=f2e44]: Data Anda, tetap terlindungi.
        - link "Portal Penerbit" [ref=f2e49] [cursor=pointer]:
          - /url: /penerbit
    - generic [ref=f2e58]:
      - banner [ref=f2e59]:
        - generic [ref=f2e61]:
          - combobox "Cari panduan verifikasi" [ref=f2e66]
          - button "Cari panduan" [ref=f2e67] [cursor=pointer]
        - button "Kelola wallet 0x39…a43e" [ref=f2e71] [cursor=pointer]:
          - generic [ref=f2e77]: 0x39…a43e
      - main [ref=f2e80]:
        - generic [ref=f2e82]:
          - heading "Portal Penerbit" [level=1] [ref=f2e83]
          - paragraph [ref=f2e84]: Kelola kredensial institusi dan terbitkan ijazah mahasiswa.
        - tablist "Pilih portal" [ref=f2e93]:
          - tab "Portal Kredensial Institusi" [ref=f2e94] [cursor=pointer]
          - tab "Portal Penerbitan Ijazah Mahasiswa" [selected] [ref=f2e95] [cursor=pointer]
          - tab "Data Ijazah Mahasiswa" [ref=f2e96] [cursor=pointer]
        - alert [ref=f2e97]: "Impossible to fetch public key: wrong relayer url. Details: Failed to fetch Version: @zama-fhe/relayer-sdk@0.4.1"
        - status [ref=f2e98]:
          - generic [ref=f2e99]: Menyiapkan referensi terenkripsi untuk ditinjau.
        - tabpanel "Portal Penerbitan Ijazah Mahasiswa" [ref=f2e101]:
          - paragraph [ref=f2e102]: Isi data mahasiswa, sahkan penerbitan, lalu unduh PDF ijazah.
          - region [ref=f2e103]:
            - heading "Terbitkan ijazah mahasiswa" [level=2] [ref=f2e104]
            - list "Tahap penerbitan" [ref=f2e105]:
              - listitem [ref=f2e106]:
                - generic [ref=f2e107]: "1"
                - text: Isi data
              - listitem [ref=f2e108]:
                - generic [ref=f2e109]: "2"
                - text: Tinjau data publik
              - listitem [ref=f2e110]:
                - generic [ref=f2e111]: "3"
                - text: Sahkan kredensial
              - listitem [ref=f2e112]:
                - generic [ref=f2e113]: "4"
                - text: Kirim penerbitan
              - listitem [ref=f2e114]:
                - generic [ref=f2e115]: "5"
                - text: Unduh ijazah
            - generic [ref=f2e116]:
              - generic [ref=f2e117]:
                - generic [ref=f2e118]:
                  - text: Nama lengkap
                  - textbox "Nama lengkap" [ref=f2e119]: ANDI PRATAMA
                - generic [ref=f2e120]:
                  - text: Nomor ijazah
                  - textbox "Nomor ijazah" [ref=f2e121]: UAS/2026/A001
                - generic [ref=f2e122]:
                  - text: Program studi
                  - textbox "Program studi" [ref=f2e123]: INFORMATIKA
                - generic [ref=f2e124]:
                  - text: Tanggal lulus (privat)
                  - textbox "Tanggal lulus (privat)" [ref=f2e125]: 2026-08-15
              - paragraph [ref=f2e126]: Nama, nomor ijazah, program studi, dan nama institusi akan tersedia pada halaman QR publik. Tanggal lulus disimpan dalam referensi terenkripsi dan PDF privat; tidak ditampilkan di halaman QR publik.
              - button "Siapkan data untuk ditinjau" [ref=f2e127] [cursor=pointer]
        - generic [ref=f2e132]:
          - generic [ref=f2e133]: Verifikasi dokumen dengan perlindungan data
          - generic [ref=f2e134]: Zama FHEVM
  - alert [ref=f2e136]
```

# Test source
