import { render } from '@testing-library/react'
import { createElement } from 'react'
import Markdown from 'react-markdown'
import { describe, expect, it } from 'vitest'
import { buildMockReport } from './mockReport'

const NOW = new Date(2026, 10, 12, 9, 30)

/** The body lines under a `## heading`, up to the next heading. */
function section(markdown: string, heading: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.indexOf(`## ${heading}`)
  expect(start).toBeGreaterThan(-1)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('#'))
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => line !== '')
}

function renderReport(prompt: string) {
  const { title, markdown } = buildMockReport(prompt, NOW)
  const { container } = render(createElement(Markdown, null, markdown))
  return { title, container }
}

/** Every element the rendered report is made of, in document order. */
function outline(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('*'), (element) => element.tagName)
}

describe('buildMockReport title', () => {
  it('uses a short prompt as the title', () => {
    expect(buildMockReport('Compare three note apps', NOW).title).toBe('Compare three note apps')
  })

  it('keeps a prompt of exactly 60 characters whole', () => {
    const prompt = 'a'.repeat(60)

    expect(buildMockReport(prompt, NOW).title).toBe(prompt)
  })

  it('cuts a longer prompt to its first 60 characters and adds an ellipsis', () => {
    const prompt = 'a'.repeat(60) + 'bcd'

    expect(buildMockReport(prompt, NOW).title).toBe('a'.repeat(60) + '…')
  })

  it('counts characters by code point so emoji and Korean are not split', () => {
    expect(buildMockReport('😀'.repeat(61), NOW).title).toBe('😀'.repeat(60) + '…')
    expect(buildMockReport('😀'.repeat(60), NOW).title).toBe('😀'.repeat(60))
    expect(buildMockReport('가'.repeat(61), NOW).title).toBe('가'.repeat(60) + '…')
  })

  it('turns line breaks into spaces', () => {
    expect(buildMockReport('first line\nsecond line', NOW).title).toBe('first line second line')
  })

  it('collapses any run of whitespace or control characters into one space', () => {
    expect(buildMockReport('  a \r\n\r\n\t b c\u0000d\u0085e  ', NOW).title).toBe('a b c d e')
  })

  it.each(['', '   ', '\n\t\n'])('falls back to a placeholder title for an empty prompt %j', (prompt) => {
    const { title, markdown } = buildMockReport(prompt, NOW)

    expect(title).toBe('제목 없는 요청')
    expect(markdown.split('\n')).toContain('# 제목 없는 요청')
  })

  it('returns the title unescaped', () => {
    expect(buildMockReport('# hi', NOW).title).toBe('# hi')
    expect(buildMockReport('<img src=x onerror=alert(1)>', NOW).title).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('buildMockReport markdown', () => {
  it('starts with the sample badge line', () => {
    expect(buildMockReport('Compare three note apps', NOW).markdown.split('\n')[0]).toBe('> 예시 결과물')
  })

  it('lays out badge, title, date and the three sections in order', () => {
    const lines = buildMockReport('Compare three note apps', NOW).markdown.split('\n')
    const positions = [
      '> 예시 결과물',
      '# Compare three note apps',
      '작성일: 2026-11-12',
      '## 요약',
      '## 주요 내용',
      '## 출처 (예시)',
    ].map((line) => lines.indexOf(line))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('formats the date as zero-padded local YYYY-MM-DD', () => {
    const { markdown } = buildMockReport('prompt', new Date(2027, 0, 5, 23, 59))

    expect(markdown.split('\n')).toContain('작성일: 2027-01-05')
  })

  it('gives a summary that mentions the request', () => {
    const summary = section(buildMockReport('Compare three note apps', NOW).markdown, '요약')

    expect(summary.join('\n')).toContain('Compare three note apps')
  })

  it('lists three to five key points', () => {
    const points = section(buildMockReport('Compare three note apps', NOW).markdown, '주요 내용')

    expect(points.length).toBeGreaterThanOrEqual(3)
    expect(points.length).toBeLessThanOrEqual(5)
    expect(points.every((line) => line.startsWith('- '))).toBe(true)
  })

  it('lists two or three example sources, all on example.com', () => {
    const sources = section(buildMockReport('Compare three note apps', NOW).markdown, '출처 (예시)')

    expect(sources.length).toBeGreaterThanOrEqual(2)
    expect(sources.length).toBeLessThanOrEqual(3)
    for (const source of sources) {
      expect(source).toMatch(/^- \[[^\]]+\]\(https:\/\/example\.com\/[^)\s]*\)$/)
    }
  })
})

describe('buildMockReport escaping', () => {
  it('backslash-escapes Markdown special characters from the prompt', () => {
    const { markdown } = buildMockReport('\\ ` * _ # < > [ ]', NOW)

    expect(markdown.split('\n')).toContain('# \\\\ \\` \\* \\_ \\# \\< \\> \\[ \\]')
  })

  it('escapes an HTML tag in the prompt wherever it appears', () => {
    const { markdown } = buildMockReport('<img src=x onerror=alert(1)>', NOW)

    expect(markdown).toContain('\\<img src\\=x onerror\\=alert\\(1\\)\\>')
    expect(markdown).not.toMatch(/(?<!\\)<img/)
  })

  it('escapes a heading marker in the prompt', () => {
    expect(buildMockReport('# hi', NOW).markdown.split('\n')).toContain('# \\# hi')
  })

  it('truncates before escaping so no escape is cut in half', () => {
    const { markdown } = buildMockReport('*'.repeat(61), NOW)

    expect(markdown.split('\n')).toContain('# ' + '\\*'.repeat(60) + '…')
  })

  it.each([
    '<img src=x onerror=alert(1)>',
    '# hi',
    '<script>alert(1)</script><b>bold</b>',
    '**bold** __strong__ *em* _em_ `code` ~~strike~~',
    '[link](https://evil.test) ![image](https://evil.test/x.png)',
    '](javascript:alert(1)) [x]: https://evil.test',
    '<https://evil.test> https://evil.test www.evil.test me@evil.test',
    '&lt;b&gt; &amp; &#35; &copy;',
    'a\\b ends with a backslash \\',
    '1. one',
    '- item',
    '> quote',
    '--- === ``` ~~~ | a | b |',
    'line one\n\n## injected\n\n- item\n\n    code',
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  ])('renders the prompt %j as plain text only', (prompt) => {
    const baseline = outline(renderReport('Compare three note apps').container)
    const { title, container } = renderReport(prompt)

    expect(container.querySelector('h1')?.textContent).toBe(title)
    expect(container.querySelector('h1')?.childElementCount).toBe(0)
    expect(container.querySelector('h1 + p + h2 + p')?.textContent).toContain(title)
    expect(outline(container)).toEqual(baseline)
    for (const link of Array.from(container.querySelectorAll('a'))) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/example\.com\//)
    }
  })

  it('renders as a badge quote, one title, three sections and two lists', () => {
    const { container } = renderReport('Compare three note apps')

    expect(container.firstElementChild?.tagName).toBe('BLOCKQUOTE')
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('예시 결과물')
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(Array.from(container.querySelectorAll('h2'), (heading) => heading.textContent)).toEqual([
      '요약',
      '주요 내용',
      '출처 (예시)',
    ])
    expect(container.querySelectorAll('ul')).toHaveLength(2)
  })
})
