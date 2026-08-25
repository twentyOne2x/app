process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', jsx: 'react-jsx' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const React = require('react')
const { render, fireEvent, waitFor, cleanup } = require('@testing-library/react')

const { useClipGeneration } = require('../lib/hooks/use-clip-generation.ts')

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.navigator = dom.window.navigator
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MutationObserver = dom.window.MutationObserver

const parent = {
  parentTitle: 'Video',
  channel: 'Creator',
  mediaId: '0199a100-0000-7000-8000-000000000001'
}
const clip = {
  parentTitle: 'Segment',
  channel: 'Creator',
  startS: 10,
  endS: 20
}
const padding = {
  mode: 'manual',
  smartPadSeconds: 5,
  padBeforeSeconds: 0,
  padAfterSeconds: 0
}

function Harness() {
  const generation = useClipGeneration(parent, clip, padding)
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { 'data-testid': 'status' }, generation.status),
    React.createElement('span', { 'data-testid': 'clip-id' }, generation.clipId ?? ''),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => void generation.generate({ force: generation.status === 'error' }).catch(() => {})
      },
      'Create'
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => void generation.retry().catch(() => {})
      },
      'Retry'
    )
  )
}

function storedRecord() {
  const store = JSON.parse(window.localStorage.getItem('clip-generation-records/v1'))
  return Object.values(store)[0]
}

test('ambiguous create retry reuses the persisted external idempotency key', async () => {
  window.localStorage.clear()
  const beforeFetch = global.fetch
  const bodies = []
  let calls = 0
  global.fetch = async (url, init) => {
    assert.equal(url, '/api/clips')
    calls += 1
    bodies.push(JSON.parse(init.body))
    if (calls === 1) throw new Error('connection closed after submit')
    return new Response(JSON.stringify({ id: 'a'.repeat(32), status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const view = render(React.createElement(Harness))
    fireEvent.click(view.getByText('Create'))
    await waitFor(() => assert.equal(view.getByTestId('status').textContent, 'error'))
    const stableKey = storedRecord().requestPayload.idempotencyKey
    assert.match(stableKey, /^clip-create-/)

    fireEvent.click(view.getByText('Create'))
    await waitFor(() => assert.equal(view.getByTestId('status').textContent, 'queued'))
    assert.equal(calls, 2)
    assert.equal(bodies[0].idempotencyKey, stableKey)
    assert.equal(bodies[1].idempotencyKey, stableKey)
    view.unmount()
  } finally {
    global.fetch = beforeFetch
    cleanup()
  }
})
test('duplicate terminal retry clicks converge on one request and one stable retry key', async () => {
  window.localStorage.clear()
  const beforeFetch = global.fetch
  let retryCalls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  let retryPayload
  global.fetch = async (url, init) => {
    if (url === '/api/clips') {
      return new Response(JSON.stringify({ id: 'a'.repeat(32), status: 'error' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    assert.equal(url, `/api/clips/${'a'.repeat(32)}/retry`)
    retryCalls += 1
    retryPayload = JSON.parse(init.body)
    await gate
    return new Response(JSON.stringify({ id: 'b'.repeat(32), status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const view = render(React.createElement(Harness))
    fireEvent.click(view.getByText('Create'))
    await waitFor(() => assert.equal(view.getByTestId('status').textContent, 'error'))
    fireEvent.click(view.getByText('Retry'))
    fireEvent.click(view.getByText('Retry'))
    assert.equal(retryCalls, 1)
    assert.match(retryPayload.idempotencyKey, /^clip-retry-/)
    assert.equal(storedRecord().retryIdempotencyKey, retryPayload.idempotencyKey)
    release()
    await waitFor(() => assert.equal(view.getByTestId('clip-id').textContent, 'b'.repeat(32)))
    view.unmount()
  } finally {
    global.fetch = beforeFetch
    cleanup()
  }
})
