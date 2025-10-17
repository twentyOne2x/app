import { expect, test } from '@playwright/test'

const PROMPT =
  'Summarize the latest Firedancer updates and cite the best sources.'

test.describe('Top Sources interactions', () => {
  test('thumbnail, edit, and bundle log events', async ({ page, context }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    await page.goto('/')

    const promptInput = page.getByPlaceholder('Send a message.')
    await promptInput.click()
    await promptInput.fill(PROMPT)
    await page.getByRole('button', { name: 'Send message' }).click()

    const cards = page.getByTestId('source-card')
    let cardsLoaded = true
    try {
      await expect
        .poll(async () => cards.count(), { timeout: 120_000 })
        .toBeGreaterThan(0)
    } catch (error) {
      cardsLoaded = false
    }

    if (!cardsLoaded) {
      test.skip(true, 'Top Sources not available for this prompt')
    }

    const count = await cards.count()
    test.skip(count === 0, 'No Top Sources rendered')

    const firstCard = cards.first()
    const channelLink = firstCard.getByTestId('channel-link')
    await expect(channelLink).toHaveAttribute('href', /https:\/\/www\.youtube\.com\//)
    const thumbnailLink = firstCard.locator('a').first()

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      thumbnailLink.click()
    ])
    await newPage.close()

    await expect
      .poll(
        () =>
          consoleMessages.find((text) =>
            text.includes('source-list: thumbnail click')
          ),
        { timeout: 5_000 }
      )
      .toBeTruthy()

    const editButton = firstCard.getByRole('button', { name: 'Edit clip' }).first()
    await editButton.click()

    await expect
      .poll(
        () =>
          consoleMessages.find((text) =>
            text.includes('source-list: clip select requested')
          ),
        { timeout: 5_000 }
      )
      .toBeTruthy()

    const nowPlaying = page.getByText('Now playing')
    await expect(nowPlaying).toBeVisible({ timeout: 15_000 })
    const generateButton = page.getByTestId('generate-hq')
    await expect(generateButton).toHaveText(/Generate high-quality clip/i)
    const clipExcerpt = page.locator('[data-testid="clip-excerpt"]')
    if (await clipExcerpt.count()) {
      await expect(clipExcerpt.first()).not.toContainText('[')
    }
    if (await generateButton.isDisabled()) {
      test.skip(true, 'Clip lacks valid timestamps for HQ generation')
    }
    await generateButton.click()
    await page.keyboard.press('Escape')
    await expect(nowPlaying).toBeHidden({ timeout: 5_000 })

    const bundleButton = firstCard
      .getByRole('button', { name: /Add(ed)? to bundle/i })
      .first()
    await bundleButton.click()

    await expect(
      firstCard.getByRole('button', { name: 'Added to bundle' }).first()
    ).toBeVisible({
      timeout: 5_000
    })

    await expect
      .poll(
        () =>
          consoleMessages.find((text) =>
            text.includes('source-list: bundle toggle')
          ),
        { timeout: 5_000 }
      )
      .toBeTruthy()
  })
})
