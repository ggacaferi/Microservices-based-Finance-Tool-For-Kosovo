import { test, expect } from '@playwright/test';

test('auth page renders', async ({ page }) => {
  await page.goto('/auth');
  await expect(
    page.getByText(/Sign in to continue, or create a new account/i),
  ).toBeVisible({ timeout: 60_000 });
});
