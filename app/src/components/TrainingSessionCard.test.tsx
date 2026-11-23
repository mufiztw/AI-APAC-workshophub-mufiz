import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CancelResponse, RegistrationResponse, TrainingSession } from '../types'
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

const confirmedResponse: RegistrationResponse = {
  id: 1,
  sessionId: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  status: 'confirmed',
  createdAt: '2026-07-01T00:00:00Z',
  registered: 5,
  capacity: 10,
}

const waitlistedResponse: RegistrationResponse = {
  ...confirmedResponse,
  status: 'waitlisted',
  position: 3,
  registered: 10,
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace')
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
  await user.click(screen.getByRole('button', { name: /register|join waitlist/i }))
}

describe('TrainingSessionCard registration', () => {
  it('shows a form with name, email and an enabled Register button', () => {
    render(<TrainingSessionCard session={session} onRegister={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeEnabled()
  })

  it('shows a Join Waitlist button instead of Register when the session is full', () => {
    render(
      <TrainingSessionCard
        session={{ ...session, registered: 10 }}
        onRegister={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Join Waitlist' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument()
  })

  it('keeps the Full badge and enabled inputs when the session is full', () => {
    render(
      <TrainingSessionCard
        session={{ ...session, registered: 10 }}
        onRegister={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Full')).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeEnabled()
    expect(screen.getByLabelText(/email/i)).toBeEnabled()
  })

  it('does not show a Full badge when seats remain', () => {
    render(<TrainingSessionCard session={session} onRegister={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByText('Full')).not.toBeInTheDocument()
  })

  it('calls onRegister with the name and email on submit', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockResolvedValue(confirmedResponse)
    render(<TrainingSessionCard session={session} onRegister={onRegister} onCancel={vi.fn()} />)

    await fillAndSubmit(user)

    expect(onRegister).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com' })
  })

  it('shows a confirmation message after a successful registration', async () => {
    const user = userEvent.setup()
    render(
      <TrainingSessionCard
        session={session}
        onRegister={vi.fn().mockResolvedValue(confirmedResponse)}
        onCancel={vi.fn()}
      />
    )

    await fillAndSubmit(user)

    expect(await screen.findByRole('status')).toHaveTextContent(/registered/i)
  })

  it('submits to onRegister from a full session and shows the waitlist message with position', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockResolvedValue(waitlistedResponse)
    render(
      <TrainingSessionCard
        session={{ ...session, registered: 10 }}
        onRegister={onRegister}
        onCancel={vi.fn()}
      />
    )

    await fillAndSubmit(user)

    expect(onRegister).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com' })
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/waitlist/i)
    expect(status).toHaveTextContent('3')
    expect(status).toHaveTextContent(/not confirmed/i)
    expect(status).toHaveTextContent(session.title)
  })

  it('leaves the displayed count unchanged after a waitlisted submission', async () => {
    const user = userEvent.setup()
    render(
      <TrainingSessionCard
        session={{ ...session, registered: 10 }}
        onRegister={vi.fn().mockResolvedValue(waitlistedResponse)}
        onCancel={vi.fn()}
      />
    )

    await fillAndSubmit(user)
    await screen.findByRole('status')

    expect(screen.getByText(/10 \/ 10 registered/)).toBeInTheDocument()
  })

  it('does not say not confirmed for a confirmed registration', async () => {
    const user = userEvent.setup()
    render(
      <TrainingSessionCard
        session={session}
        onRegister={vi.fn().mockResolvedValue(confirmedResponse)}
        onCancel={vi.fn()}
      />
    )

    await fillAndSubmit(user)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/registered for/i)
    expect(status).not.toHaveTextContent(/waitlist/i)
  })

  it('shows an error message when registration fails', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn().mockRejectedValue(new Error('Training session is full'))
    render(<TrainingSessionCard session={session} onRegister={onRegister} onCancel={vi.fn()} />)

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Training session is full')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('updates the displayed count when the session changes', () => {
    const { rerender } = render(
      <TrainingSessionCard session={session} onRegister={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByText(/4 \/ 10 registered/)).toBeInTheDocument()

    rerender(
      <TrainingSessionCard
        session={{ ...session, registered: 5 }}
        onRegister={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/5 \/ 10 registered/)).toBeInTheDocument()
  })
})

describe('TrainingSessionCard cancellation', () => {
  const cancelResponse: CancelResponse = { status: 'cancelled', registered: 4, capacity: 10 }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function registerConfirmed(
    user: ReturnType<typeof userEvent.setup>,
    onCancel: (registrationId: number) => Promise<CancelResponse>
  ) {
    render(
      <TrainingSessionCard
        session={session}
        onRegister={vi.fn().mockResolvedValue(confirmedResponse)}
        onCancel={onCancel}
      />
    )
    await fillAndSubmit(user)
    await screen.findByRole('status')
  }

  it('does not show Cancel Registration before registering', () => {
    render(<TrainingSessionCard session={session} onRegister={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Cancel Registration' })).not.toBeInTheDocument()
  })

  it('shows Cancel Registration after a confirmed registration', async () => {
    const user = userEvent.setup()
    await registerConfirmed(user, vi.fn())

    expect(screen.getByRole('button', { name: 'Cancel Registration' })).toBeEnabled()
  })

  it('does not show Cancel Registration after a waitlisted outcome', async () => {
    const user = userEvent.setup()
    render(
      <TrainingSessionCard
        session={{ ...session, registered: 10 }}
        onRegister={vi.fn().mockResolvedValue(waitlistedResponse)}
        onCancel={vi.fn()}
      />
    )

    await fillAndSubmit(user)
    await screen.findByRole('status')

    expect(screen.queryByRole('button', { name: 'Cancel Registration' })).not.toBeInTheDocument()
  })

  it('asks for confirmation with the session title', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await registerConfirmed(user, vi.fn())

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(confirmSpy).toHaveBeenCalledWith(
      `Are you sure you want to cancel your registration for ${session.title}?`
    )
  })

  it('sends nothing when the employee declines the prompt', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onCancel = vi.fn()
    await registerConfirmed(user, onCancel)

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cancel Registration' })).toBeEnabled()
  })

  it('calls onCancel with the registration id when the employee accepts', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onCancel = vi.fn().mockResolvedValue(cancelResponse)
    await registerConfirmed(user, onCancel)

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledWith(confirmedResponse.id)
  })

  it('shows the success message after cancelling', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await registerConfirmed(user, vi.fn().mockResolvedValue(cancelResponse))

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your registration has been cancelled'
    )
  })

  it('shows a disabled Cancelled button after cancelling', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await registerConfirmed(user, vi.fn().mockResolvedValue(cancelResponse))

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(await screen.findByRole('button', { name: 'Cancelled' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel Registration' })).not.toBeInTheDocument()
  })

  it('disables the button while the cancellation is in flight', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let resolveCancel: (value: CancelResponse) => void = () => undefined
    const onCancel = vi.fn(
      () =>
        new Promise<CancelResponse>((resolve) => {
          resolveCancel = resolve
        })
    )
    await registerConfirmed(user, onCancel)

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(screen.getByRole('button', { name: 'Cancel Registration' })).toBeDisabled()
    resolveCancel(cancelResponse)
    expect(await screen.findByRole('button', { name: 'Cancelled' })).toBeDisabled()
  })

  it('shows the error and keeps the Cancel button when cancelling fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await registerConfirmed(
      user,
      vi.fn().mockRejectedValue(new Error('Registration is already cancelled'))
    )

    await user.click(screen.getByRole('button', { name: 'Cancel Registration' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration is already cancelled')
    expect(screen.getByRole('button', { name: 'Cancel Registration' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Cancelled' })).not.toBeInTheDocument()
  })
})
