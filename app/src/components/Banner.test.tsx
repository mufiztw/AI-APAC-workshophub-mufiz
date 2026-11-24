import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Banner from './Banner'

describe('Banner', () => {
  it.each(['registered', 'waitlisted'] as const)(
    'renders the message in a status region for kind %s',
    (kind) => {
      render(<Banner kind={kind} message="Hello there" onDismiss={vi.fn()} />)

      expect(screen.getByRole('status')).toHaveTextContent('Hello there')
    }
  )

  it('renders a Dismiss button that calls onDismiss once when clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Banner kind="registered" message="Hello there" onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss before the button is clicked', () => {
    const onDismiss = vi.fn()
    render(<Banner kind="waitlisted" message="Hello there" onDismiss={onDismiss} />)

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
