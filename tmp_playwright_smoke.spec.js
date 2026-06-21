const { test, expect } = require('@playwright/test');

test('homepage loads', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/Localpdf/i);
});
