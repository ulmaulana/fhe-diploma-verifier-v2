import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`guide recommendations, typo search and repeated navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Cari panduan verifikasi' });
    await search.focus();
    await expect(page.getByText('Rekomendasi topik', { exact: true })).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(4);
    await search.fill('gimana upload ijzah');
    await expect(page.getByRole('option').first()).toContainText('Seperti apa foto atau scan yang dapat dibaca?');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`search-${width}.png`), fullPage: true, animations: 'disabled' });
    await search.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Cari topik panduan' })).toHaveValue('gimana upload ijzah');
    await expect(page.getByText('Berikut topik terdekat berdasarkan kata terkait atau ejaan yang mirip.')).toBeVisible();
    await expect(page.locator('details#unggahan')).toHaveAttribute('open', '');

    // Searching again on the same route must replace the previous guide query.
    await search.fill('download laporan');
    await search.press('ArrowDown');
    await expect(page.getByRole('option', { selected: true })).toContainText('Apa yang tercantum dalam laporan?');
    await search.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Cari topik panduan' })).toHaveValue('Apa yang tercantum dalam laporan?');
    await expect(page.locator('details#laporan')).toHaveAttribute('open', '');
    await expect(search).toHaveAttribute('aria-expanded', 'false');

    await search.fill('wallet');
    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await search.fill('resep nasi goreng');
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(page.getByText('Belum ada topik yang cocok.', { exact: false })).toBeVisible();
    await page.getByText('Verifikasi dokumen dengan perlindungan data', { exact: true }).click();
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await search.fill('hapus data');
    await page.getByRole('option', { name: /Kapan data dihapus/ }).click();
    await expect(page.locator('details#hapus')).toHaveAttribute('open', '');
  });
}

test('guide search ranks related words and offers category and no-result recovery', async ({ page }) => {
  await page.goto('/panduan');
  const search = page.getByRole('textbox', { name: 'Cari topik panduan' });
  await search.fill('hasil ga cocok');
  await expect(page.locator('.guide-article').first()).toHaveAttribute('id', 'berbeda');
  await page.getByRole('navigation', { name: 'Kategori panduan' }).getByRole('button', { name: 'Penerbit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Topik belum ditemukan' })).toBeVisible();
  await page.getByRole('button', { name: 'Cari di semua kategori', exact: true }).click();
  await expect(page.locator('.guide-article').first()).toHaveAttribute('id', 'berbeda');
  await search.fill('resep nasi goreng');
  await expect(page.getByRole('heading', { name: 'Topik belum ditemukan' })).toBeVisible();
  await page.getByRole('button', { name: 'Bagaimana kampus menerbitkan rekaman?', exact: true }).click();
  await expect(page.locator('.guide-article').first()).toHaveAttribute('id', 'penerbit');
});
