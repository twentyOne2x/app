import { expect, test } from '@playwright/test'
import { ensureSignedIn } from './utils/auth'

test.describe('Chat layout', () => {
  test('prompt aligns with chat list and leaves breathing room', async ({ page }) => {
    await ensureSignedIn(page)
    await page.setViewportSize({ width: 1440, height: 520 })

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

    await expect(page.getByTestId('chat-message-content').first()).toBeVisible()

    const scrollRegion = page.getByTestId('chat-scroll-region')
    await expect(scrollRegion).toBeVisible()

    const [chatListBox, promptBox, promptContainerBox] = await Promise.all([
      chatList.boundingBox(),
      promptInput.boundingBox(),
      page.getByTestId('prompt-container').boundingBox()
    ])
    expect(chatListBox).not.toBeNull()
    expect(promptBox).not.toBeNull()
    expect(promptContainerBox).not.toBeNull()

    const chatLeftEdge = chatListBox!.x ?? 0
    const promptLeftEdge = promptContainerBox!.x ?? 0
    expect(Math.abs(chatLeftEdge - promptLeftEdge)).toBeLessThanOrEqual(60)
    expect(promptContainerBox!.width ?? 0).toBeGreaterThanOrEqual(chatListBox!.width ?? 0)

    const promptTop = promptContainerBox!.y ?? 0
    const chatBottom = (chatListBox!.y ?? 0) + (chatListBox!.height ?? 0)
    expect(promptTop - chatBottom).toBeGreaterThan(12)

    const bottomBar = page.getByTestId('chat-bottom-bar')
    const bottomCount = await bottomBar.count()
    console.log('bottom bar count', bottomCount)
    await expect(bottomBar).toBeVisible()
    const viewportHeight = await page.evaluate(() => window.innerHeight)
    const bottomBarBox = await bottomBar.boundingBox()
    expect(bottomBarBox).not.toBeNull()
    const bottomGap = viewportHeight - ((bottomBarBox?.y ?? 0) + (bottomBarBox?.height ?? 0))
    console.log('bottom gap', bottomGap)
    expect(Math.abs(bottomGap)).toBeLessThanOrEqual(24)

    const promptBoxAfter = await promptInput.boundingBox()
    expect(promptBoxAfter).not.toBeNull()
    const promptBottomGap = viewportHeight - ((promptBoxAfter?.y ?? 0) + (promptBoxAfter?.height ?? 0))
    console.log('prompt gap initial', promptBottomGap)
    expect(Math.abs(promptBottomGap)).toBeLessThanOrEqual(24)

    const channelFilter = page.getByTestId('channel-filter-bottom')
    if (await channelFilter.count()) {
      const filterBox = await channelFilter.boundingBox()
      expect(filterBox).not.toBeNull()
      const filterBottom = (filterBox?.y ?? 0) + (filterBox?.height ?? 0)
      const promptBottom = (promptContainerBox?.y ?? 0) + (promptContainerBox?.height ?? 0)
      console.log('filter bottom', filterBottom, 'prompt bottom', promptBottom)
      expect(Math.abs(filterBottom - promptBottom)).toBeLessThanOrEqual(24)
    }

    const overflowBehavior = await scrollRegion.evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll']).toContain(overflowBehavior)

    await page.mouse.wheel(0, 2000)

    const promptAfterScroll = await promptInput.boundingBox()
    expect(promptAfterScroll).not.toBeNull()
    const promptBottomGapAfterScroll = viewportHeight - ((promptAfterScroll?.y ?? 0) + (promptAfterScroll?.height ?? 0))
    expect(Math.abs(promptBottomGapAfterScroll)).toBeLessThanOrEqual(24)

  })
})
