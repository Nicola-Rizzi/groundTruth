import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('li');
});

test('todos load and appear in the list', async ({ page }) => {
  const items = page.locator('li');
  await expect(items.first()).toBeVisible();
});

test('mark a todo changes its label to completed', async ({ page }) => {
  const firstButton = page.locator('li').first().getByRole('button');
  await firstButton.click();
  await expect(firstButton).toHaveText('completed');
});

test('remove a todo removes it from the list', async ({ page }) => {
  const initialCount = await page.locator('li').count();
  await page.getByRole('button', { name: /remove/i }).first().click();
  await expect(page.locator('li')).toHaveCount(initialCount - 1);
});

test('add a todo appends it to the list and clears the input', async ({ page }) => {
  const initialCount = await page.locator('li').count();
  await page.getByRole('textbox').fill('Buy milk');
  await page.getByRole('button', { name: /add/i }).click();
  await expect(page.locator('li')).toHaveCount(initialCount + 1);
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('add with empty input does not add an item', async ({ page }) => {
  const initialCount = await page.locator('li').count();
  await page.getByRole('button', { name: /add/i }).click();
  await expect(page.locator('li')).toHaveCount(initialCount);
});

test('network failure shows error message', async ({ page }) => {
  await page.route('**/todos', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText(/failed to fetch|error|network/i)).toBeVisible();
});
