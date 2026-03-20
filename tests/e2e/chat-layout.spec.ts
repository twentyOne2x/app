import { expect, test } from '@playwright/test'
import { ensureSignedIn } from './utils/auth'

test.describe('Chat layout', () => {
  test('prompt aligns with chat list and leaves breathing room', async ({ page }) => {
    await ensureSignedIn(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    const toggleSidebar = page.getByRole('button', { name: 'Toggle Sidebar' })
    await toggleSidebar.click()

    const fetchSamples = page.getByRole('button', { name: 'Fetch sample conversations' })
    if (await fetchSamples.count()) {
      await fetchSamples.first().click()
    }

    await page.goto('/chat/icm-weekly-brief')

    const chatList = page.getByTestId('chat-list')
    await expect(chatList).toBeVisible()

    const leftRail = page.getByTestId('chat-left-rail')
    const middleRail = page.getByTestId('chat-middle-rail')
    const rightRail = page.getByTestId('chat-right-rail')
    const [leftRailBox, middleRailBox, rightRailBox] = await Promise.all([
      leftRail.boundingBox(),
      middleRail.boundingBox(),
      rightRail.boundingBox()
    ])
    console.log('layout rail widths', {
      left: leftRailBox?.width,
      middle: middleRailBox?.width,
      right: rightRailBox?.width
    })

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
    console.log('alignment left edges', { chatLeftEdge, promptLeftEdge })
    console.log('prompt container metrics', promptContainerBox)
    console.log('chat list metrics', chatListBox)
    expect(Math.abs(chatLeftEdge - promptLeftEdge)).toBeLessThanOrEqual(400)
    expect(promptContainerBox!.width ?? 0).toBeGreaterThanOrEqual(300)

    const promptTop = promptContainerBox!.y ?? 0
    const chatBottom = (chatListBox!.y ?? 0) + (chatListBox!.height ?? 0)
    expect(promptTop - chatBottom).toBeGreaterThan(12)

    const bottomBar = page.getByTestId('chat-bottom-bar')
    const bottomCount = await bottomBar.count()
    console.log('bottom bar count', bottomCount)
    await expect(bottomBar).toBeVisible()
    const bottomLeft = page.getByTestId('chat-bottom-left')
    const bottomMiddle = page.getByTestId('chat-bottom-middle')
    const bottomRight = page.getByTestId('chat-bottom-right')
    const [bottomLeftBox, bottomMiddleBox, bottomRightBox] = await Promise.all([
      bottomLeft.boundingBox(),
      bottomMiddle.boundingBox(),
      bottomRight.boundingBox()
    ])
    console.log('bottom bar widths', {
      left: bottomLeftBox?.width,
      middle: bottomMiddleBox?.width,
      right: bottomRightBox?.width
    })
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
      console.log('filter metrics', filterBox)
      expect(Math.abs(filterBottom - promptBottom)).toBeLessThanOrEqual(24)
    }

    const overflowBehavior = await scrollRegion.evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll']).toContain(overflowBehavior)

    // Make the scroll region overflow deterministically (avoid depending on backend/sample chat length).
    // Use a pseudo-element instead of DOM injection so React rerenders can't wipe it out.
    await page.addStyleTag({
      content:
        '[data-testid="chat-scroll-region"]::after { content: ""; display: block; height: 3000px; width: 1px; }'
    })

    const canScroll = await scrollRegion.evaluate(
      (el) => (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight
    )
    expect(canScroll).toBeTruthy()

    const scrollTopBefore = await scrollRegion.evaluate((el) => (el as HTMLElement).scrollTop)
    await scrollRegion.hover()
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(50)
    const scrollTopAfter = await scrollRegion.evaluate((el) => (el as HTMLElement).scrollTop)
    expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore)

    const promptAfterScroll = await promptInput.boundingBox()
    expect(promptAfterScroll).not.toBeNull()
    const promptBottomGapAfterScroll = viewportHeight - ((promptAfterScroll?.y ?? 0) + (promptAfterScroll?.height ?? 0))
    expect(Math.abs(promptBottomGapAfterScroll)).toBeLessThanOrEqual(24)

    await page.screenshot({ path: 'test-results/chat-layout-alignment.png', fullPage: true })
  })
})
