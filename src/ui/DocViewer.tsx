import { useId } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { useTasks, type Task } from '../store/tasks'
import { downloadMarkdown } from './download'
import { Icon } from './Icon'
import { useBackdropClose, useDialog } from './useDialog'
import './dialog.css'

type Result = NonNullable<Task['result']>

/**
 * How the document's elements are drawn. Only links differ from the default:
 * they open in a new tab, and that tab learns nothing about this page.
 */
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

function Viewer({ result, onClose }: { result: Result; onClose(): void }) {
  const dialog = useDialog<HTMLDivElement>(onClose)
  const backdrop = useBackdropClose(onClose)
  const titleId = useId()

  return (
    <div className="modal" data-modal="" {...backdrop}>
      <div ref={dialog} className="dialog dialog--doc" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="dialog__head">
          <div className="dialog__heading">
            <span className="badge">예시 결과물</span>
            <h2 id={titleId} className="dialog__title">
              {result.title}
            </h2>
          </div>
          <button type="button" className="dialog__action" onClick={() => downloadMarkdown(result.title, result.markdown)}>
            <Icon name="download" size={20} />
            .md 다운로드
          </button>
          <button type="button" className="dialog__close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        {/* A stop for the keyboard, so that a long document can be scrolled without a mouse. */}
        <div className="doc" role="region" aria-label="문서 내용" tabIndex={0}>
          {/* The Markdown is rendered as it comes; HTML inside it is shown as text, never as elements. */}
          <Markdown components={COMPONENTS}>{result.markdown}</Markdown>
        </div>
      </div>
    </div>
  )
}

/**
 * The result of a task as a document to read and download. It shows for as
 * long as the tasks store names a task with a result as the one being viewed.
 */
export function DocViewer() {
  const task = useTasks((state) =>
    state.viewingId === null ? undefined : state.tasks.find((candidate) => candidate.id === state.viewingId),
  )
  const setViewing = useTasks((state) => state.setViewing)

  if (!task?.result) return null
  return <Viewer key={task.id} result={task.result} onClose={() => setViewing(null)} />
}
