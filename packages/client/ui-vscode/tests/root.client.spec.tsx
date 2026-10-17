// @vitest-environment jsdom
/** Release decisions do not remount the conversation or steal its draft and focus. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ClientReleaseChange } from '@deepseek-ai/dsh-client-modules/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Root, type RootProps } from '../src/client/Root.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('keeps the conversation mounted through a same-version release notice and both decisions', () => {
  let change: ClientReleaseChange | undefined
  const dictionary: Readonly<Record<string, string>> = en
  const props: RootProps = {
    renderSlot: () => <textarea aria-label="Fixture draft" defaultValue="Unsent context" />,
    SessionProvider: ({ children }) => children,
    t: key => dictionary[key] ?? key,
    useReleaseChange: selector => selector(change), reload: vi.fn(), dismiss: vi.fn(),
  }
  const view = render(<Root {...props} />)
  const draft = screen.getByRole('textbox')
  draft.focus()
  change = { page: { version: 'fixture', commit: 'old-build' }, previous: { version: 'fixture', commit: 'old-build' },
    host: { version: 'fixture', commit: 'new-build' } }
  view.rerender(<Root {...props} />)
  expect(screen.getByRole('status').textContent).toContain('new-build')
  expect(screen.getByRole('textbox')).toBe(draft)
  expect(document.activeElement).toBe(draft)
  fireEvent.click(screen.getByRole('button', { name: en.releaseLater }))
  expect(props.dismiss).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: en.releaseReload }))
  expect(props.reload).toHaveBeenCalledOnce()
  change = { page: undefined, previous: undefined, host: undefined }
  view.rerender(<Root {...props} />)
  expect(screen.getByRole('status').textContent).toContain(en.releaseDescription)
  change = undefined
  view.rerender(<Root {...props} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('textbox')).toBe(draft)
  expect((draft as HTMLTextAreaElement).value).toBe('Unsent context')
})
