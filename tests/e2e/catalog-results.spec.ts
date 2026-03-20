import { expect, test } from '@playwright/test'

test.describe('Video catalog results', () => {
  test('renders catalog results in the right rail when structured sources are empty', async ({ page }) => {
    await page.route('**/api/chat/stream', async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    })

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'catalog-smoke',
          title: 'catalog-smoke',
          userId: null,
          createdAt: Date.now(),
          path: '/chat/catalog-smoke',
          message: { role: 'assistant', content: 'Top 1 videos about: Anza' },
          structured_metadata: [],
          diagnostics: {
            catalog_results: [
              {
                video_id: 'AkqCgmgFxEM',
                parent_id: 'AkqCgmgFxEM',
                title:
                  'Ship or Die at Accelerate 2025: IBRL (Kevin Bowers - Firedancer, Brennan Watt - Anza)',
                channel_name: '@SolanaFndn',
                channel_id: 'UC9AdQPUe4BdVJ8M9X7wxHUA',
                published_at: '2025-05-22',
                duration_s: 1506,
                url: 'https://www.youtube.com/watch?v=AkqCgmgFxEM',
                thumbnail_url: 'https://i.ytimg.com/vi/AkqCgmgFxEM/hqdefault.jpg',
                score: 1.4
              }
            ]
          }
        })
      })
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const promptInput = page.getByTestId('prompt-textarea')
    await promptInput.fill('all videos about Anza')
    await page.getByRole('button', { name: 'Send message' }).click()

    const rightRail = page.getByTestId('chat-right-rail')
    await expect(rightRail.getByText('Video Catalog')).toBeVisible()

    const results = page.getByTestId('catalog-results')
    await expect(results).toBeVisible()

    const cards = page.getByTestId('catalog-card')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=AkqCgmgFxEM'
    )

    // Metadata line: channel | publish date | duration
    await expect(cards.first()).toContainText('@SolanaFndn')
    await expect(cards.first()).toContainText('May 22, 2025')
    await expect(cards.first()).toContainText('25:06')
  })
})

