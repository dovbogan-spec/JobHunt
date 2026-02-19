import { expect, test } from '@playwright/test';

test('typing remains stable without focus/scroll jumps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interests' }).click();
  await page.getByRole('button', { name: '+ Add interest' }).click();
  const input = page.locator('.editor-body input').last();
  await input.click();
  const before = await page.evaluate(() => window.scrollY);
  await input.fill('Interests');
  await expect(input).toHaveValue('Interests');
  await expect(input).toBeFocused();
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThan(20);
});

test('profile enter inserts paragraph and no list by default', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();
  const editor = page.locator('.profile-editor');
  await editor.click();
  await page.keyboard.type('Line 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Line 2');
  const html = await editor.innerHTML();
  expect(html).toContain('Line 1');
  expect(html).toContain('Line 2');
  expect(html).not.toContain('<ul');
  expect(html).not.toContain('<ol');
});

test('drag reorders languages and preview updates level format', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Languages' }).click();
  await page.getByRole('button', { name: '+ Add language' }).click();
  const rows = page.locator('.editor-body .tile.row');
  await rows.nth(1).locator('input').fill('Spanish');
  await rows.nth(1).locator('select').selectOption('Professional');
  const dragHandle = rows.nth(1).locator('.drag-handle');
  const target = rows.nth(0);
  await dragHandle.dragTo(target);
  await expect(page.locator('.paper')).toContainText('Spanish — Professional');
});
