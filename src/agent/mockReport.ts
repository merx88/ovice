const UNTITLED = '제목 없는 요청'
const TITLE_MAX_LENGTH = 60

/** The prompt as a single line of plain text, cut to 60 characters. */
function toTitle(prompt: string): string {
  // Control characters count as whitespace, so the title is always one clean line.
  const line = prompt.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
  if (line === '') return UNTITLED

  // Split by code point, not UTF-16 unit, so an emoji is never cut in half.
  const characters = Array.from(line)
  if (characters.length <= TITLE_MAX_LENGTH) return line
  return `${characters.slice(0, TITLE_MAX_LENGTH).join('')}…`
}

/**
 * Makes user text safe to place inside a line of Markdown. CommonMark reads a
 * backslash before any ASCII punctuation character as that literal character,
 * so escaping all of them leaves no syntax (emphasis, links, HTML tags,
 * entities, headings, autolinks) to pick out and get wrong.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[!-/:-@[-`{-~]/g, '\\$&')
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Builds the sample report the mock agent hands over. Nothing in it is
 * researched: the body only shows what a finished report looks like.
 */
export function buildMockReport(prompt: string, now: Date): { title: string; markdown: string } {
  const title = toTitle(prompt)
  const topic = escapeMarkdown(title)

  const markdown = [
    '> 예시 결과물',
    '',
    `# ${topic}`,
    '',
    `작성일: ${formatDate(now)}`,
    '',
    '## 요약',
    '',
    `“${topic}” 요청에 대한 예시 리포트입니다. 프로토타입 모드에서는 실제 조사를 하지 않으며, 아래 내용은 결과 문서가 어떤 모습으로 전달되는지 보여 주기 위한 견본입니다.`,
    '',
    '## 주요 내용',
    '',
    `- “${topic}” 요청에서 답해야 할 핵심 질문이 이 자리에 정리됩니다.`,
    '- 찾은 자료를 같은 기준으로 나란히 비교한 결과가 이어집니다.',
    '- 비교에서 드러난 차이점과 주의할 점이 항목별로 들어갑니다.',
    '- 마지막으로 다음에 확인하면 좋을 질문과 추천 방향이 담깁니다.',
    '',
    '## 출처 (예시)',
    '',
    '- [예시 자료 1: 개요](https://example.com/sample/overview)',
    '- [예시 자료 2: 비교 정리](https://example.com/sample/comparison)',
    '- [예시 자료 3: 참고 노트](https://example.com/sample/notes)',
    '',
  ].join('\n')

  return { title, markdown }
}
