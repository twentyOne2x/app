process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { parseMetadataEntriesV2FromFinalKept } = require('../lib/utils.ts')
const { POST } = require('../app/api/clips/route.ts')

const mediaId = '0199a100-0000-7000-8000-000000000001'

test('final query clips preserve the canonical media id for generation', () => {
  const entries = parseMetadataEntriesV2FromFinalKept([
    {
      segment_id: 'seg-1',
      parent_id: 'video-1',
      video_id: 'video-1',
      media_id: mediaId,
      title: 'Canonical video',
      channel_name: 'Creator',
      start_hms: '00:00:10',
      end_hms: '00:00:20'
    }
  ])

  assert.equal(entries.length, 1)
  assert.equal(entries[0].mediaId, mediaId)
  assert.equal(entries[0].clips[0].mediaId, mediaId)
})

test('production clip proxy rejects source URLs and requires canonical media ids', async () => {
  const legacy = new Request('https://icm.fyi/api/clips', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: 'https://example.com/video.mp4',
      start: 0,
      end: 10,
      contextMode: 'seconds',
      padBefore: 0,
      padAfter: 0
    })
  })
  const rejected = await POST(legacy)
  assert.equal(rejected.status, 400)
  assert.match(await rejected.text(), /require mediaId/)

  const canonical = new Request('https://icm.fyi/api/clips', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mediaId,
      start: 0,
      end: 10,
      contextMode: 'seconds',
      padBefore: 0,
      padAfter: 0,
      preferVideo: true,
      renderProfile: 'hq-1080p-v1'
    })
  })
  const acceptedButUnavailable = await POST(canonical)
  assert.equal(acceptedButUnavailable.status, 503)
})
