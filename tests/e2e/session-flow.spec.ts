import { expect, test } from '@playwright/test'

const WEEKLY_PROMPT = /Weekly brief: What moved ICM this week\?/i

test.describe('Session navigation surface', () => {
  test('loads conversations, copies profile link, and signs out', async ({ page }) => {
    await page.goto('/')

    const testerButtonAtLanding = page.getByRole('button', { name: 'Continue as E2E tester' })
    if ((await testerButtonAtLanding.count()) > 0) {
      await testerButtonAtLanding.first().click()
      await expect(page).toHaveURL(/\/$/)
    }

    const nav = page.getByRole('navigation', { name: 'Conversation history' })
    await expect(page).toHaveURL(/\/$/)
    await expect(nav).toBeVisible({ timeout: 60_000 })
    await expect(nav.getByText('Recent conversations')).toBeVisible()

    const fetchSamplesButton = nav.getByRole('button', { name: 'Fetch sample conversations' })
    if ((await fetchSamplesButton.count()) > 0) {
      await fetchSamplesButton.first().click()
      await expect(nav.getByRole('link', { name: WEEKLY_PROMPT })).toBeVisible({ timeout: 60_000 })
    }

    const firstConversation = nav.getByRole('link', { name: WEEKLY_PROMPT })
    await expect(firstConversation).toBeVisible()
    const conversationHref = await firstConversation.getAttribute('href')
    expect(conversationHref).toBeTruthy()
    await page.goto(conversationHref!, { waitUntil: 'networkidle' })
    await expect(
      page.getByRole('heading', { name: /Solana Firedancer testnet recap/i })
    ).toBeVisible({ timeout: 60_000 })

    const avatarButton = page.getByRole('button', { name: /E2E Researcher/i })
    await avatarButton.click()

    const copyProfileItem = page.getByRole('menuitem', { name: 'Copy profile link' })
    await expect(copyProfileItem).toBeVisible()
    await copyProfileItem.click()

    await avatarButton.click()
    await page.getByRole('menuitem', { name: 'Settings (soon)' }).click()
    await expect(page.getByText('Settings are coming soon.')).toBeVisible()

    await avatarButton.click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/sign-in/)
    const testerButton = page.getByRole('button', { name: 'Continue as E2E tester' })
    await expect(testerButton).toBeVisible()
    await testerButton.click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('navigation', { name: 'Conversation history' })).toBeVisible()
  })
})
