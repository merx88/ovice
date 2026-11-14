import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockReport } from '../agent/mockReport'
import { useTasks, type Task } from '../store/tasks'
import { DocViewer } from './DocViewer'
import { downloadMarkdown } from './download'

vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  downloadMarkdown: vi.fn(),
}))

const BADGE = '예시 결과물'

function done(id: string, title: string, markdown: string): Task {
  return {
    id,
    prompt: title,
    status: 'done',
    step: 'writing',
    message: null,
    result: { title, markdown },
    error: null,
    createdAt: 1,
    finishedAt: 2,
  }
}

/** Shows the viewer on a finished task with this result. */
function view(title: string, markdown: string) {
  useTasks.setState({ tasks: [done('shown', title, markdown)], activeId: null, viewingId: 'shown' })
  return render(<DocViewer />)
}

beforeEach(() => {
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  vi.mocked(downloadMarkdown).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DocViewer: when it shows', () => {
  it('shows nothing while no result is being viewed', () => {
    useTasks.setState({ tasks: [done('a', 'title', 'text')] })
    const { container } = render(<DocViewer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing for an id that names no task', () => {
    useTasks.setState({ tasks: [done('a', 'title', 'text')], viewingId: 'gone' })
    const { container } = render(<DocViewer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing for a task that has no result', () => {
    useTasks.setState({ tasks: [{ ...done('a', 'title', 'text'), status: 'failed', result: null }], viewingId: 'a' })
    const { container } = render(<DocViewer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens as a dialog over the page, named by the title of the document', () => {
    view('Five AI services in 2026', 'text')
    const dialog = screen.getByRole('dialog', { name: 'Five AI services in 2026' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: 'Five AI services in 2026' })).toBeInTheDocument()
  })

  it('marks the document as a sample', () => {
    view('title', 'no mark in the text itself')
    expect(screen.getByText(BADGE)).toBeInTheDocument()
  })

  it('opens when a result is chosen while it is on the page, and follows a change of result', () => {
    useTasks.setState({ tasks: [done('a', 'first', 'one'), done('b', 'second', 'two')] })
    render(<DocViewer />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => useTasks.getState().setViewing('a'))
    expect(screen.getByRole('dialog', { name: 'first' })).toBeInTheDocument()
    act(() => useTasks.getState().setViewing('b'))
    expect(screen.getByRole('dialog', { name: 'second' })).toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()
  })
})

describe('DocViewer: the document', () => {
  it('renders the Markdown of the result', () => {
    view('title', '# Heading\n\nA paragraph with **strong** words.\n\n- one\n- two\n\n> quoted')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['one', 'two'])
    expect(within(dialog).getByText('strong').tagName).toBe('STRONG')
    expect(within(dialog).getByText('quoted').closest('blockquote')).not.toBeNull()
  })

  it('never turns HTML in the document into elements', () => {
    const { baseElement } = view(
      'title',
      'before\n\n<img src=x onerror=alert(1)>\n\n<script>window.pwned = true</script>\n\ninline <b onclick="x()">bold</b> <iframe src="https://example.com"></iframe>\n\nafter',
    )
    expect(baseElement.querySelector('img, script, iframe, b, [onclick], [onerror]')).toBeNull()
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect((window as { pwned?: boolean }).pwned).toBeUndefined()
  })

  it('shows a title made of markup as the text it is', () => {
    const hostile = '<img src=x onerror=alert(1)> **bold** # heading'
    const { baseElement } = view(hostile, 'text')
    expect(screen.getByRole('heading', { name: hostile })).toBeInTheDocument()
    expect(baseElement.querySelector('img')).toBeNull()
    expect(screen.getByRole('heading', { name: hostile }).querySelector('strong')).toBeNull()
  })

  it('shows the sample report for a hostile prompt without running any of it', () => {
    const report = buildMockReport('<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1))', new Date(0))
    const { baseElement } = view(report.title, report.markdown)
    const dialog = screen.getByRole('dialog')
    expect(baseElement.querySelector('img, [onerror]')).toBeNull()
    expect(within(dialog).queryByText('bold', { selector: 'strong' })).toBeNull()
    for (const link of within(dialog).queryAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/example\.com\//)
    }
  })

  it('opens links in a new tab without handing the page over to them', () => {
    view('title', 'See [the source](https://example.com/a) and <https://example.com/b>.')
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('fetches no images: a picture in the document stands as a link to it, named by its description', () => {
    const { baseElement } = view('title', 'A chart: ![x](https://example.com/a.png)\n\nAnd one undescribed: ![](https://example.com/b.png)')
    expect(baseElement.querySelector('img')).toBeNull()
    const described = screen.getByRole('link', { name: 'x' })
    expect(described).toHaveAttribute('href', 'https://example.com/a.png')
    expect(described).toHaveAttribute('target', '_blank')
    expect(described).toHaveAttribute('rel', 'noopener noreferrer')
    // Without a description the link is named by the address.
    expect(screen.getByRole('link', { name: 'https://example.com/b.png' })).toHaveAttribute('href', 'https://example.com/b.png')
  })

  it('leaves only the description of a picture whose address would run script', () => {
    const { baseElement } = view('title', 'Look: ![a chart](javascript:alert(1))')
    expect(baseElement.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '문서 내용' })).toHaveTextContent('Look: a chart')
  })

  it('drops links that would run script', () => {
    view('title', '[click me](javascript:alert(1)) and [data](data:text/html,<script>alert(1)</script>)')
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^(javascript|data):/i)
    }
    expect(document.querySelector('a[href^="javascript:" i], a[href^="data:" i]')).toBeNull()
  })

  it('keeps tables and strikethrough as plain text: only core Markdown is read', () => {
    const { baseElement } = view('title', '| a | b |\n| - | - |\n| 1 | 2 |\n\n~~struck~~')
    expect(baseElement.querySelector('table, del')).toBeNull()
  })
})

describe('DocViewer: closing and downloading', () => {
  it('closes with the close button', async () => {
    view('title', 'text')
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(useTasks.getState().viewingId).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    view('title', 'text')
    await userEvent.keyboard('{Escape}')
    expect(useTasks.getState().viewingId).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('takes the Escape for itself, so that nothing underneath closes as well', async () => {
    const underneath = vi.fn()
    document.addEventListener('keydown', underneath)
    try {
      view('title', 'text')
      await userEvent.keyboard('{Escape}')
      expect(underneath).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', underneath)
    }
  })

  it('closes when the dimmed page around it is pressed, but not when the document is', async () => {
    view('title', 'the text of the document')
    await userEvent.click(screen.getByText('the text of the document'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(useTasks.getState().viewingId).toBeNull()
  })

  it('downloads the document as it is, under its title', async () => {
    view('Five AI services: 2026', '# Five\n\n<img src=x onerror=alert(1)>')
    await userEvent.click(screen.getByRole('button', { name: /다운로드/ }))
    expect(downloadMarkdown).toHaveBeenCalledTimes(1)
    expect(downloadMarkdown).toHaveBeenCalledWith('Five AI services: 2026', '# Five\n\n<img src=x onerror=alert(1)>')
    // Downloading does not close the document.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('DocViewer: the keyboard', () => {
  it('takes the focus when it opens and gives it back to where it was when it closes', async () => {
    useTasks.setState({ tasks: [done('a', 'title', 'text')] })
    render(
      <>
        <button type="button" onClick={() => useTasks.getState().setViewing('a')}>
          open the result
        </button>
        <DocViewer />
      </>,
    )
    const opener = screen.getByRole('button', { name: 'open the result' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('keeps the focus inside while it is open, going round in both directions', async () => {
    render(
      <>
        <button type="button">before</button>
        <DocViewer />
        <button type="button">after</button>
      </>,
    )
    act(() => useTasks.setState({ tasks: [done('a', 'title', '[a link](https://example.com)')], viewingId: 'a' }))
    const dialog = screen.getByRole('dialog')
    const inside = () => expect(dialog).toContainElement(document.activeElement as HTMLElement)

    const seen = new Set<Element | null>()
    for (let press = 0; press < 8; press += 1) {
      await userEvent.tab()
      inside()
      seen.add(document.activeElement)
    }
    // Everything that can be reached is reached: download, close, the text and the link in it.
    expect(seen.size).toBe(4)

    for (let press = 0; press < 8; press += 1) {
      await userEvent.tab({ shift: true })
      inside()
    }
  })

  it('names its buttons and hides its icons from screen readers', () => {
    view('title', 'text')
    const dialog = screen.getByRole('dialog')
    for (const button of within(dialog).getAllByRole('button')) expect(button).toHaveAccessibleName()
    for (const icon of dialog.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
