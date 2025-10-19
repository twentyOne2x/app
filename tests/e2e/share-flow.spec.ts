import { expect, test } from '@playwright/test'
import { ensureSignedIn } from './utils/auth'

test.describe('Share flow', () => {
  test('can share a conversation and open the shared link', async ({ page, context }) => {
    await ensureSignedIn(page)

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(page.url()).origin
    })
    await page.evaluate(() => {
      return navigator.clipboard.writeText('')
        .catch(() => undefined)
    })

    const toggleSidebar = page.getByRole('button', { name: 'Toggle Sidebar' })
    await toggleSidebar.click()

    const fetchSamples = page.getByRole('button', { name: 'Fetch sample conversations' })
    if (await fetchSamples.count()) {
      await fetchSamples.first().click()
    }

    await page.goto('/chat/icm-weekly-brief')

    // Ensure historical messages render (regression guard for showChatList)
    await expect(page.getByTestId('chat-message').first()).toBeVisible()

    const shareButton = page.getByRole('button', { name: /share chat/i })
    await shareButton.click()

    await expect(page.getByText('Share link copied to clipboard')).toBeVisible()

    const shareUrl = (await page.evaluate(() => navigator.clipboard.readText())).trim()
    expect(shareUrl).toContain('/share/')

    const [sharePage] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((href) => window.open(href, '_blank'), shareUrl)
    ])
    await sharePage.waitForLoadState('domcontentloaded')
    await expect(sharePage.getByRole('heading', { name: /Weekly brief/ })).toBeVisible()
    await sharePage.close()
  })
})
