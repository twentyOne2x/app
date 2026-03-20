import { expect, test } from '@playwright/test'

test.describe('Landing page scroll', () => {
  test('chat scroll region scrolls after a long response', async ({ page }) => {
    // Force legacy /api/chat path (avoid SSE parsing in this test).
    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    })

    const LONG_RESPONSE = [
      'SCROLL_TEST_START',
      ...Array.from({ length: 140 }, (_, i) => `Line ${i + 1}: lorem ipsum dolor sit amet`),
      'SCROLL_TEST_END'
    ].join('\n')

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'scroll-smoke',
          title: 'scroll-smoke',
          userId: null,
          createdAt: Date.now(),
          path: '/chat/scroll-smoke',
          message: { role: 'assistant', content: LONG_RESPONSE },
          structured_metadata: [],
          diagnostics: {}
        })
      })
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const promptInput = page.getByTestId('prompt-textarea')
    await expect(promptInput).toBeVisible()
    await promptInput.fill('scroll test')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.getByText('SCROLL_TEST_END')).toBeVisible()

    const scrollRegion = page.getByTestId('chat-scroll-region')
    await expect(scrollRegion).toBeVisible()

    const overflowY = await scrollRegion.evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll']).toContain(overflowY)

    const initialScrollTop = await scrollRegion.evaluate((el) => el.scrollTop)
    await scrollRegion.hover()
    await page.mouse.wheel(0, 1800)

    await expect
      .poll(async () => scrollRegion.evaluate((el) => el.scrollTop), { timeout: 5000 })
      .toBeGreaterThan(initialScrollTop)
  })
})

