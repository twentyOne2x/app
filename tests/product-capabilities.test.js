process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', jsx: 'react-jsx' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const { isClipBundleEnabled } = require('../lib/product-capabilities.ts')
const SourceList = require('../components/source-list.tsx').default

test('clip bundle UI is default-off and requires an explicit capability', () => {
  const before = process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED
  try {
    delete process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED
    assert.equal(isClipBundleEnabled(), false)
    process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED = '0'
    assert.equal(isClipBundleEnabled(), false)
    process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED = '1'
    assert.equal(isClipBundleEnabled(), true)
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED
    else process.env.NEXT_PUBLIC_CLIP_BUNDLE_ENABLED = before
  }
})

test('top sources hide unsupported bundle controls unless capability is enabled', () => {
  const entries = [{
    parentTitle: 'Video',
    channel: 'Creator',
    date: '2026-08-25',
    url: 'https://example.com/video',
    clips: [{
      parentTitle: 'Segment',
      channel: 'Creator',
      startS: 10,
      endS: 20,
      excerpt: 'A retained segment.'
    }]
  }]
  const hidden = renderToStaticMarkup(
    React.createElement(SourceList, { entries, bundleEnabled: false })
  )
  assert.doesNotMatch(hidden, /Add to bundle/)

  const enabled = renderToStaticMarkup(
    React.createElement(SourceList, { entries, bundleEnabled: true })
  )
  assert.match(enabled, /Add to bundle/)
})
