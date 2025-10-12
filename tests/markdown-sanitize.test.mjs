import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

const spanAttributeWhitelist = Array.isArray(defaultSchema.attributes?.span)
  ? [...defaultSchema.attributes.span]
  : []

spanAttributeWhitelist.push('className', 'style', /^data-[\w-]+$/u)

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: spanAttributeWhitelist
  }
}

test('markdown renderer keeps span markup', () => {
  const markdown = 'Flight status: <span class="badge">In flight</span>'
  const html = renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkMath],
        rehypePlugins: [rehypeRaw, [rehypeSanitize, schema]]
      },
      markdown
    )
  )

  assert.match(
    html,
    /<span[^>]*class="badge"[^>]*>In flight<\/span>/,
    'expected the sanitized HTML to retain span badge markup'
  )
})
