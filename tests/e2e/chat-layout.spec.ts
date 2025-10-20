import { expect, test } from '@playwright/test'
import { ensureSignedIn } from './utils/auth'

test.describe('Chat layout', () => {
  test('prompt aligns with chat list and leaves breathing room', async ({ page }) => {
    await ensureSignedIn(page)

    const toggleSidebar = page.getByRole('button', { name: 'Toggle Sidebar' })
    await toggleSidebar.click()

    const fetchSamples = page.getByRole('button', { name: 'Fetch sample conversations' })
    if (await fetchSamples.count()) {
      await fetchSamples.first().click()
    }

    await page.goto('/chat/icm-weekly-brief')

    const chatList = page.getByTestId('chat-list')
    await expect(chatList).toBeVisible()

    const promptInput = page.getByTestId('prompt-textarea')
    await expect(promptInput).toBeVisible()

    const messageContent = page.getByTestId('chat-message-content').first()
    await expect(messageContent).toBeVisible()

    const [chatBox, promptBox] = await Promise.all([messageContent.boundingBox(), promptInput.boundingBox()])
    expect(chatBox).not.toBeNull()
    expect(promptBox).not.toBeNull()

    const widthDiff = Math.abs((chatBox!.width ?? 0) - (promptBox!.width ?? 0))
    const xDiff = Math.abs((chatBox!.x ?? 0) - (promptBox!.x ?? 0))
    expect(widthDiff).toBeLessThanOrEqual(8)
    expect(xDiff).toBeLessThanOrEqual(25)

    const promptTop = (promptBox!.y ?? 0)
    const chatBottom = (chatBox!.y ?? 0) + (chatBox!.height ?? 0)
    expect(promptTop - chatBottom).toBeGreaterThan(12)

    const shareButton = page.getByRole('button', { name: /share chat/i })
    await expect(shareButton).toBeVisible()
    const header = page.locator('header').first()
    const headerBox = await header.boundingBox()
    const shareBox = await shareButton.boundingBox()
    expect(shareBox).not.toBeNull()
    expect(shareBox!.y).toBeLessThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0))

    await page.mouse.wheel(0, 2000)
    const shareBoxAfterScroll = await shareButton.boundingBox()
    expect(shareBoxAfterScroll).not.toBeNull()
    expect(shareBoxAfterScroll!.y).toBeLessThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0))

    await toggleSidebar.click()
  })
})
