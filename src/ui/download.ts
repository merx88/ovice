// Hands the user a text as a file to keep.

/**
 * What must not be in a file name: control characters, the characters file
 * systems reserve (`\ / : * ? " < > |`), and the invisible characters that
 * hide or reorder text (zero-width marks, direction overrides).
 */
const REFUSED = /[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g
const MAX_LENGTH = 80
const FALLBACK = 'report'

/** Without spaces and dots at either end: no hidden file, and nothing Windows would strip. */
function trimEnds(name: string): string {
  return name.replace(/^[\s.]+|[\s.]+$/g, '')
}

/**
 * The file name for a document with this title: `<title>.md`, with the title
 * cleaned of anything a file system refuses or reads as a path, cut to 80
 * characters, and replaced by `report` if nothing is left of it.
 */
export function markdownFileName(title: string): string {
  const cleaned = trimEnds(title.replace(INVISIBLE, '').replace(REFUSED, ' ').replace(/\s+/g, ' '))
  // By code point, so that a character outside the basic plane is never cut in half.
  const short = trimEnds(Array.from(cleaned).slice(0, MAX_LENGTH).join(''))
  return `${short === '' ? FALLBACK : short}.md`
}

/** How long the browser gets to start the download before the text is let go of. */
const REVOKE_AFTER_MS = 1000

/** Downloads `markdown` as a Markdown file named after `title`. */
export function downloadMarkdown(title: string, markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = markdownFileName(title)
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
