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
const { render, fireEvent } = require('@testing-library/react')

const { useClipPadding } = require('../lib/hooks/use-clip-padding.ts')

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.navigator = dom.window.navigator
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MutationObserver = dom.window.MutationObserver

if (!globalThis.window.matchMedia) {
  globalThis.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    }
  })
}

globalThis.matchMedia = globalThis.window.matchMedia

function PaddingHarness({ parent, clip }) {
  const { settings, setMode, setPadBeforeSeconds, setPadAfterSeconds } = useClipPadding(parent, clip)

  return (
    React.createElement(
      React.Fragment,
      null,
      React.createElement('span', { 'data-testid': 'mode' }, settings.mode),
      React.createElement('span', { 'data-testid': 'before' }, settings.padBeforeSeconds),
      React.createElement('span', { 'data-testid': 'after' }, settings.padAfterSeconds),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setMode('manual')
        },
        'Switch to manual'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setMode('smart')
        },
        'Switch to smart'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setPadBeforeSeconds(12)
        },
        'Pad before 12'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setPadAfterSeconds(7)
        },
        'Pad after 7'
      )
    )
  )
}

const parent = {
  parentTitle: 'Example Video',
  channel: 'Example Channel',
  date: '2024-07-01',
  url: 'https://example.com/watch'
}

const clip = {
  parentTitle: 'Segment',
  channel: 'Example Channel',
  startS: 120,
  endS: 150,
  startHMS: '00:02:00',
  endHMS: '00:02:30'
}

test('useClipPadding toggles modes and persists per clip', () => {
  window.localStorage.clear()

  const renderHarness = () =>
    render(
      React.createElement(PaddingHarness, {
        parent,
        clip
      })
    )

  let view = renderHarness()

  const read = () => ({
    mode: view.getByTestId('mode').textContent,
    before: view.getByTestId('before').textContent,
    after: view.getByTestId('after').textContent
  })

  let state = read()
  assert.equal(state.mode, 'smart')
  assert.equal(state.before, '5')
  assert.equal(state.after, '5')

  fireEvent.click(view.getByText('Switch to manual'))
  fireEvent.click(view.getByText('Pad before 12'))
  fireEvent.click(view.getByText('Pad after 7'))

  state = read()
  assert.equal(state.mode, 'manual')
  assert.equal(state.before, '12')
  assert.equal(state.after, '7')

  view.unmount()
  view = renderHarness()
  state = read()
  assert.equal(state.mode, 'manual')
  assert.equal(state.before, '12')
  assert.equal(state.after, '7')

  fireEvent.click(view.getByText('Switch to smart'))
  state = read()
  assert.equal(state.mode, 'smart')

  view.unmount()
})
