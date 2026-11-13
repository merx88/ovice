import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadMarkdown, markdownFileName } from './download'

describe('markdownFileName', () => {
  it('names the file after the title', () => {
    expect(markdownFileName('Five AI services in 2026')).toBe('Five AI services in 2026.md')
    expect(markdownFileName('사무실 의자 비교')).toBe('사무실 의자 비교.md')
  })

  it.each([
    ['a/b', 'a b.md'],
    ['a\\b', 'a b.md'],
    ['../../etc/passwd', 'etc passwd.md'],
    ['C:\\Windows\\system32', 'C Windows system32.md'],
    ['what? *really* "this" <one> | that: yes', 'what really this one that yes.md'],
    ['<img src=x onerror=alert(1)>', 'img src=x onerror=alert(1).md'],
  ])('takes out what a file system refuses or reads as a path: %j', (title, expected) => {
    expect(markdownFileName(title)).toBe(expected)
  })

  it('takes out control characters and characters that hide or reorder text', () => {
    expect(markdownFileName('line one\nline two\ttabbed\u0000\u0007\u007f\u0085')).toBe('line one line two tabbed.md')
    expect(markdownFileName('report\u202Efdp.exe')).toBe('reportfdp.exe.md')
    expect(markdownFileName('zero\u200Bwidth\uFEFF')).toBe('zerowidth.md')
  })

  it('trims spaces and dots at both ends', () => {
    expect(markdownFileName('   spaced out   ')).toBe('spaced out.md')
    expect(markdownFileName('.hidden')).toBe('hidden.md')
    expect(markdownFileName('trailing dots...')).toBe('trailing dots.md')
    expect(markdownFileName(' . title . ')).toBe('title.md')
  })

  it('keeps at most 80 characters of the title', () => {
    const name = markdownFileName('x'.repeat(200))
    expect(name).toBe(`${'x'.repeat(80)}.md`)
  })

  it('counts characters, not code units, so an emoji is never cut in half', () => {
    const name = markdownFileName('😀'.repeat(100))
    expect(name).toBe(`${'😀'.repeat(80)}.md`)
  })

  it('does not end on a space or a dot after cutting', () => {
    expect(markdownFileName(`${'x'.repeat(79)} yz`)).toBe(`${'x'.repeat(79)}.md`)
    expect(markdownFileName(`${'x'.repeat(79)}.yz`)).toBe(`${'x'.repeat(79)}.md`)
  })

  it.each(['', '   ', '...', '///', '\\/:*?"<>|', '\u0000\u0001', ' . / . '])(
    'falls back to "report" when nothing is left of %j',
    (title) => {
      expect(markdownFileName(title)).toBe('report.md')
    },
  )
})

describe('downloadMarkdown', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:ovice/1')
  const revokeObjectURL = vi.fn()
  let clicked: { href: string; download: string; inDocument: boolean }[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    clicked = []
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    // jsdom has neither of these.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, inDocument: this.isConnected })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('hands the browser the text as a Markdown file named after the title', async () => {
    downloadMarkdown('Five AI services: 2026', '# Five\n\n본문 <b>raw</b>')

    expect(clicked).toEqual([{ href: 'blob:ovice/1', download: 'Five AI services 2026.md', inDocument: true }])
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await blob.text()).toBe('# Five\n\n본문 <b>raw</b>')
  })

  it('leaves nothing behind: the link is removed and the object URL is revoked afterwards', () => {
    downloadMarkdown('title', 'text')
    expect(document.querySelector('a[download]')).toBeNull()
    // Not before the browser has had the chance to start the download.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ovice/1')
  })
})
