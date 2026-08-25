process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  jsx: 'react-jsx'
})

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const React = require('react')
const { render, fireEvent, cleanup } = require('@testing-library/react')

const { useClipSelection } = require('../lib/hooks/use-clip-selection.ts')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost'
})

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.navigator = dom.window.navigator

globalThis.matchMedia =
  globalThis.matchMedia ||
  function matchMedia() {
    return {
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      }
    }
  }

globalThis.window.matchMedia = globalThis.matchMedia

const parent = {
  parentTitle: 'Sample Parent',
  channel: 'Demo Channel',
  date: '2024-05-01',
  url: 'https://example.com/watch',
  mediaId: '0199a100-0000-7000-8000-000000000001'
}

const clip = {
  parentTitle: 'Segment 1',
  channel: 'Demo Channel',
  startHMS: '00:01:00',
  endHMS: '00:01:30',
  startS: 60,
  endS: 90,
  speaker: 'Speaker',
  excerpt: 'Interesting moment'
}

function Harness({ scope }) {
  const selection = useClipSelection(scope)

  return React.createElement(
    'div',
    null,
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => selection.toggleClip(parent, clip)
      },
      'Toggle'
    ),
    React.createElement(
      'span',
      { 'data-testid': 'count' },
      selection.selectionCount
    )
  )
}

function renderHarness(scope) {
  return render(React.createElement(Harness, { scope }))
}

test('useClipSelection toggles and persists selections', () => {
  window.localStorage.clear()

  const scope = 'clip-selection-test'
  let view = renderHarness(scope)

  const count = () => Number(view.getByTestId('count').textContent)

  assert.equal(count(), 0)
  fireEvent.click(view.getByText('Toggle'))
  assert.equal(count(), 1)
  const persisted = JSON.parse(
    window.localStorage.getItem(`clip-selection:${scope}`)
  )
  assert.equal(persisted[0].parent.mediaId, parent.mediaId)
  assert.equal(persisted[0].clip.mediaId, parent.mediaId)

  view.unmount()
  view = renderHarness(scope)
  assert.equal(count(), 1)

  fireEvent.click(view.getByText('Toggle'))
  assert.equal(count(), 0)

  cleanup()
})
