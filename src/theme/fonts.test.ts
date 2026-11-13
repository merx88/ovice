import { describe, expect, it } from 'vitest'

// Latin text and digits are set in Poppins, which comes in four weights and has
// no Korean; Korean falls through to Pretendard, the next font in the stack.

/** The page and every stylesheet of the app, as text, by file name. */
const pages = import.meta.glob<string>('../../index.html', { query: '?raw', import: 'default', eager: true })
const stylesheets = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })

const page = pages['../../index.html']
const POPPINS_WEIGHTS = ['400', '500', '600', '700']

/** A stylesheet without its comments, which may name anything. */
function rules(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('fonts', () => {
  it('finds the files it is meant to check', () => {
    expect(page).toContain('<div id="root">')
    expect(Object.keys(stylesheets)).toEqual(
      expect.arrayContaining(['../index.css', '../ui/ui.css', '../ui/prompt.css', '../ui/dock.css', '../ui/dialog.css', '../ui/bubble.css']),
    )
    expect(stylesheets['../index.css']).toContain('font-family')
  })

  it('asks Google Fonts for Poppins in its four weights', () => {
    const links = [...page.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/[^"]*)"/g)].map((match) => match[1])
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('family=Poppins:wght@400;500;600;700')
    expect(links[0]).toContain('display=swap')
  })

  it('still asks for Pretendard, for Korean', () => {
    expect(page).toMatch(/href="https:\/\/cdn\.jsdelivr\.net\/npm\/pretendard@[^"]*pretendardvariable[^"]*\.css"/)
  })

  it('sets the page in Poppins first and Pretendard second', () => {
    const body = /body\s*\{[^}]*\}/.exec(rules(stylesheets['../index.css']))?.[0] ?? ''
    const stack = /font-family:\s*([^;]+);/.exec(body)?.[1] ?? ''
    expect(stack).toMatch(/^'Poppins', 'Pretendard Variable',/)
  })

  it('names Inter nowhere', () => {
    expect(page).not.toMatch(/\bInter\b/)
    for (const [name, source] of Object.entries(stylesheets)) expect(source, name).not.toMatch(/\bInter\b/)
  })

  it.each(Object.keys(stylesheets))('%s uses only the weights Poppins comes in', (name) => {
    const weights = [...rules(stylesheets[name]).matchAll(/font-weight:\s*([^;}]+)/g)].map((match) => match[1].trim())
    expect(weights.filter((weight) => !POPPINS_WEIGHTS.includes(weight))).toEqual([])
  })

  it.each(Object.keys(stylesheets))('%s sets a weight only through font-weight', (name) => {
    // The `font` shorthand could carry a weight past the check above; only `inherit` is let through.
    const shorthands = [...rules(stylesheets[name]).matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)].map((match) => match[1].trim())
    expect(shorthands.filter((value) => value !== 'inherit')).toEqual([])
  })
})
