import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrainingSession } from '../types'
import TrainingSessionCard from './TrainingSessionCard'

const session: TrainingSession = {
  id: 1,
  title: 'TDD in Agentic Development Loop',
  description: 'Learn TDD with AI.',
  date: '2026-07-22T09:00:00Z',
  capacity: 10,
  registered: 4,
  location: 'Room A',
  deliveryMode: 'online',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace')
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
  await user.click(screen.getByRole('button', { name: /register/i }))
}

describe('TrainingSessionCard registration', () => {
  it('shows a form with name, email and an enabled Register button', () => {
    render(<TrainingSessionCard session={session} onRegister={vi.fn()} />)

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeEnabled()
  })

  it('disables the Register button when the session is full', () => {
    render(<TrainingSessionCard session={{ ...session, registered: 10 }} onRegister={vi.fn()} />)

    expect(screen.getByRole('button', { name: /register/i })).toBeDisabled()
  })

  it('shows a Full badge and disables the inputs when the session is full', () => {
    render(<TrainingSessionCard session={{ ...session, registered: 10 }} onRegister={vi.fn()} />)

    expect(screen.getByText('Full')).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeDisabled()
    expect(screen.getByLabelText(/email/i)).toBeDisabled()
  })

  it('does not show a Full badge when seats remain', () => {
    render(<TrainingSessionCard session={session} onRegister={vi.fn()} />)

    expect(screen.queryByText('Full')).not.toBeInTheDocument()
  })

  it('calls onRegister with the name and email on submit', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockResolvedValue(undefined)
    render(<TrainingSessionCard session={session} onRegister={onRegister} />)

    await fillAndSubmit(user)

    expect(onRegister).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com' })
  })

  it('shows a confirmation message after a successful registration', async () => {
    const user = userEvent.setup()
    render(
      <TrainingSessionCard session={session} onRegister={vi.fn().mockResolvedValue(undefined)} />
    )

    await fillAndSubmit(user)

    expect(await screen.findByRole('status')).toHaveTextContent(/registered/i)
  })

  it('shows an error message when registration fails', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockRejectedValue(new Error('Training session is full'))
    render(<TrainingSessionCard session={session} onRegister={onRegister} />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Training session is full')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('updates the displayed count when the session changes', () => {
    const { rerender } = render(<TrainingSessionCard session={session} onRegister={vi.fn()} />)
    expect(screen.getByText(/4 \/ 10 registered/)).toBeInTheDocument()

    rerender(<TrainingSessionCard session={{ ...session, registered: 5 }} onRegister={vi.fn()} />)

    expect(screen.getByText(/5 \/ 10 registered/)).toBeInTheDocument()
  })
})
