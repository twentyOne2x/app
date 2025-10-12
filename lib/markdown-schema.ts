import { defaultSchema } from 'rehype-sanitize'

const spanAttributeWhitelist: Array<any> = Array.isArray(defaultSchema.attributes?.span)
  ? [...(defaultSchema.attributes?.span as Array<unknown>)]
  : []

spanAttributeWhitelist.push(
  'className',
  'class',
  'style',
  new RegExp('^data-[\\w-]+$')
)

type SanitizeSchema = typeof defaultSchema

export const chatMarkdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: spanAttributeWhitelist
  }
}
