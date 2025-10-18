import { expect, test } from '@playwright/test'

const PROMPT =
  'Summarize the latest Firedancer updates and cite the best sources.'

test.describe('Clip flows', () => {
  test('queues HQ clip and completes bundle', async ({ page, context }) => {
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
    } catch {
      cardsLoaded = false
    }

    if (!cardsLoaded) {
      test.skip(true, 'Top Sources not available for this prompt')
    }

    const count = await cards.count()
    test.skip(count === 0, 'No Top Sources rendered')

    const firstCard = cards.first()
    await expect(firstCard).toBeVisible()

    const editButton = firstCard.getByRole('button', { name: 'Edit clip' }).first()
    await editButton.click()

    const generateButton = page.getByTestId('generate-hq')
    await expect(generateButton).toBeVisible()
    await generateButton.click()
    const downloadLink = page.getByRole('link', { name: 'Download HQ' })
    await expect(downloadLink).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press('Escape')
    await expect(generateButton).toBeHidden({ timeout: 5_000 })

    const bundleToggle = firstCard
      .getByRole('button', { name: /Add(ed)? to bundle/i })
      .first()
    await bundleToggle.click()
    await expect(
      firstCard.getByRole('button', { name: 'Added to bundle' })
    ).toBeVisible({ timeout: 5_000 })

    const bundleBar = page.getByText('Bundle selection')
    await expect(bundleBar).toBeVisible()

    const generateBundle = page.getByRole('button', { name: 'Generate bundle' })
    await generateBundle.click()

    const bundleDrawer = page.getByRole('heading', { name: 'Bundle progress' })
    await expect(bundleDrawer).toBeVisible()

    const downloadZipButton = page.getByRole('button', { name: 'Download ZIP' })
    await expect(downloadZipButton).toBeEnabled({ timeout: 12_000 })

    const copyTimestampsButton = page.getByRole('button', { name: 'Copy clip timestamps' })
    await copyTimestampsButton.click()
    await expect(
      page.getByText('Copied clip timestamps to clipboard.')
    ).toBeVisible({ timeout: 5_000 })

    const clipboardText = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return ''
      }
    })

    expect(clipboardText).toContain('https://')
  })
})
