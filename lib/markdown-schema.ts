import type { Schema } from 'rehype-sanitize'
import { defaultSchema } from 'rehype-sanitize'

const spanAttributeWhitelist = Array.isArray(defaultSchema.attributes?.span)
  ? [...(defaultSchema.attributes?.span as Array<unknown>)]
  : []

spanAttributeWhitelist.push('className', 'style', /^data-[\w-]+$/u)

export const chatMarkdownSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: spanAttributeWhitelist
  }
}
