import { expect, type Page } from '@playwright/test'

export async function ensureSignedIn(page: Page) {
  await page.goto('/sign-in')
  const testerButton = page.getByRole('button', { name: 'Continue as E2E tester' })
  if (await testerButton.count()) {
    await testerButton.first().click()
    await expect(page).toHaveURL(/\/$/)
    return
  }

  if (!/\/$/.test(page.url())) {
    await page.goto('/')
  }
  await expect(page).toHaveURL(/\/$/)
}
