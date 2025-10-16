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

    const list = page.getByTestId('top-sources-list')
    await expect(list).toBeVisible({ timeout: 120_000 })

    const cards = list.getByTestId('source-card')
    const count = await cards.count()
    test.skip(count === 0, 'No Top Sources rendered')

    const firstCard = cards.first()
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

    const editButton = firstCard.getByRole('button', { name: 'Edit clip' })
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
    await page.keyboard.press('Escape')
    await expect(nowPlaying).toBeHidden({ timeout: 5_000 })

    const bundleButton = firstCard.getByRole('button', { name: /Add(ed)? to bundle/i })
    await bundleButton.click()

    await expect(firstCard.getByRole('button', { name: 'Added to bundle' })).toBeVisible({
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
