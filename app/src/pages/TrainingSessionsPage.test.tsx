import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrainingSession } from '../types'
import TrainingSessionsPage from './TrainingSessionsPage'

const session: TrainingSession = {
  id: 5,
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(registrationResponse: Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve(registrationResponse)
    return Promise.resolve(jsonResponse(200, [session]))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function register(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(session.title)
  await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace')
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
  await user.click(screen.getByRole('button', { name: /register/i }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrainingSessionsPage registration', () => {
  it('posts the registration and updates the registered count from the response', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(
      jsonResponse(201, {
        id: 1,
        sessionId: 5,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'confirmed',
        createdAt: '2026-07-01T00:00:00Z',
        registered: 5,
        capacity: 10,
      })
    )
    render(<TrainingSessionsPage />)

    await register(user)

    expect(await screen.findByText(/5 \/ 10 registered/)).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent(/registered for/i)
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[0]).toBe('/api/training-sessions/5/registrations')
    expect(post?.[1]?.body).toBe(JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.com' }))
  })

  it('treats 202 as success, shows the waitlist position and leaves the count unchanged', async () => {
    const user = userEvent.setup()
    mockFetch(
      jsonResponse(202, {
        id: 2,
        sessionId: 5,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'waitlisted',
        position: 2,
        createdAt: '2026-07-01T00:00:00Z',
        registered: 10,
        capacity: 10,
      })
    )
    render(<TrainingSessionsPage />)

    await register(user)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/waitlist/i)
    expect(status).toHaveTextContent('2')
    expect(status).toHaveTextContent(/not confirmed/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/4 \/ 10 registered/)).toBeInTheDocument()
    expect(screen.queryByText(/10 \/ 10 registered/)).not.toBeInTheDocument()
  })

  it('shows the error message from the response body and leaves the count unchanged', async () => {
    const user = userEvent.setup()
    mockFetch(jsonResponse(400, { error: 'Name is required' }))
    render(<TrainingSessionsPage />)

    await register(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')
    expect(screen.getByText(/4 \/ 10 registered/)).toBeInTheDocument()
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    const user = userEvent.setup()
    mockFetch(new Response('boom', { status: 500 }))
    render(<TrainingSessionsPage />)

    await register(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration failed: 500')
  })
})
