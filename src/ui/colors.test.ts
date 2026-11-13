import { describe, expect, it } from 'vitest'
import { cssVarName } from '../theme/cssVars'
import { tokens } from '../theme/tokens'

// Colours are defined in `src/theme/tokens.ts` and nowhere else: stylesheets
// get them as custom properties (`var(--c-…)`), components import the tokens.

/** The source of every file of the interface matching the patterns, by file name. */
const stylesheets = import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })
const components = import.meta.glob<string>(['./*.ts', './*.tsx', '!./*.test.ts', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i
/** Colour keywords, which are literals as well. Only looked for in the value of a declaration. */
const COLOR_KEYWORD = /\b(?:white|black|red|orange|yellow|green|blue|gr[ae]y|silver)\b/i

/** The lines of a source that are not comments, each with its line number. */
function codeLines(source: string): { line: number; text: string }[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  return withoutBlockComments
    .split('\n')
    .map((text, index) => ({ line: index + 1, text: text.replace(/^\s*\/\/.*$/, '') }))
}

describe('colours in the interface', () => {
  it('finds the files it is meant to check', () => {
    expect(Object.keys(stylesheets)).toContain('./ui.css')
    expect(Object.keys(components)).toContain('./Overlay.tsx')
    expect(Object.keys(components).filter((name) => name.includes('.test.'))).toEqual([])
    expect(stylesheets['./ui.css']).toContain('.ui {')
  })

  it.each(Object.keys(stylesheets))('%s holds no colour literal', (name) => {
    const found = codeLines(stylesheets[name])
      .filter(({ text }) => {
        const value = /^\s*[-\w]+\s*:(.*)$/.exec(text)?.[1] ?? ''
        return COLOR_LITERAL.test(text) || COLOR_KEYWORD.test(value.replace(/var\([^)]*\)/g, ''))
      })
      .map(({ line, text }) => `${name}:${line}: ${text.trim()}`)
    expect(found).toEqual([])
  })

  // A colour that is read but not defined makes its whole declaration void: no error, the rule just stops applying.
  it.each(Object.keys(stylesheets))('%s reads only colours that are defined', (name) => {
    const defined = new Set(Object.keys(tokens).map(cssVarName))
    const read = [...stylesheets[name].matchAll(/var\(\s*(--c-[\w-]+)/g)].map((match) => match[1])
    expect(read.filter((property) => !defined.has(property))).toEqual([])
  })

  it.each(Object.keys(components))('%s holds no colour literal', (name) => {
    const found = codeLines(components[name])
      .filter(({ text }) => COLOR_LITERAL.test(text))
      .map(({ line, text }) => `${name}:${line}: ${text.trim()}`)
    expect(found).toEqual([])
  })
})
