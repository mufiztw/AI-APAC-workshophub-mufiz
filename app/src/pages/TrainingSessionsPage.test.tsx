import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrainingSession } from '../types'
import TrainingSessionsPage from './TrainingSessionsPage'

// Cards and pages render router links, so every render is wrapped in a MemoryRouter.
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: MemoryRouter })
}

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

// Node's experimental localStorage can shadow jsdom's and be undefined, so tests install
// an in-memory Storage to stay independent of the runtime.
function installMemoryStorage(): Storage {
  const data = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, String(value))
    },
  }
  for (const target of [window, globalThis]) {
    Object.defineProperty(target, 'localStorage', { value: storage, configurable: true })
  }
  return storage
}

beforeEach(() => {
  installMemoryStorage()
})

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

describe('TrainingSessionsPage cancellation', () => {
  const confirmedBody = {
    id: 7,
    sessionId: 5,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    status: 'confirmed',
    createdAt: '2026-07-01T00:00:00Z',
    registered: 5,
    capacity: 10,
  }

  function mockFetchWithDelete(deleteResponse: Response) {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse(201, confirmedBody))
      if (init?.method === 'DELETE') return Promise.resolve(deleteResponse)
      return Promise.resolve(jsonResponse(200, [session]))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    return fetchMock
  }

  async function registerAndCancel(user: ReturnType<typeof userEvent.setup>) {
    await register(user)
    await screen.findByText(/5 \/ 10 registered/)
    await user.click(await screen.findByRole('button', { name: 'Cancel Registration' }))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends DELETE to the cancel endpoint and updates the count from the response', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetchWithDelete(
      jsonResponse(200, {
        status: 'cancelled',
        promotedRegistrationId: 8,
        registered: 4,
        capacity: 10,
      })
    )
    render(<TrainingSessionsPage />)

    await registerAndCancel(user)

    expect(await screen.findByText(/4 \/ 10 registered/)).toBeInTheDocument()
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(del?.[0]).toBe('/api/training-sessions/5/registrations/7')
    expect(await screen.findByRole('button', { name: 'Cancelled' })).toBeDisabled()
  })

  it('shows the API error message when cancelling is rejected', async () => {
    const user = userEvent.setup()
    mockFetchWithDelete(jsonResponse(409, { error: 'Registration is already cancelled' }))
    render(<TrainingSessionsPage />)

    await registerAndCancel(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration is already cancelled')
    expect(screen.getByText(/5 \/ 10 registered/)).toBeInTheDocument()
  })

  it('falls back to Cancellation failed with the status when the body is not JSON', async () => {
    const user = userEvent.setup()
    mockFetchWithDelete(new Response('boom', { status: 500 }))
    render(<TrainingSessionsPage />)

    await registerAndCancel(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cancellation failed: 500')
  })
})

describe('TrainingSessionsPage registration lookup', () => {
  function mockFetchWithLookup(lookupResponse: Response) {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === undefined && String(input).includes('/registrations/')) {
        return Promise.resolve(lookupResponse)
      }
      return Promise.resolve(jsonResponse(200, [session]))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('requests the stored registration and shows its status', async () => {
    window.localStorage.setItem('workshophub.registration.5', '9')
    const fetchMock = mockFetchWithLookup(
      jsonResponse(200, { id: 9, sessionId: 5, status: 'waitlisted', position: 2 })
    )
    render(<TrainingSessionsPage />)

    expect(
      await screen.findByText('Your registration: Waitlisted (position 2)')
    ).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/registrations/9'))
    expect(call?.[0]).toBe('/api/training-sessions/5/registrations/9')
  })

  it('clears the stored id when the lookup returns 404', async () => {
    window.localStorage.setItem('workshophub.registration.5', '9')
    mockFetchWithLookup(jsonResponse(404, { error: 'Registration not found' }))
    render(<TrainingSessionsPage />)

    await screen.findByText(session.title)
    await waitFor(() =>
      expect(window.localStorage.getItem('workshophub.registration.5')).toBeNull()
    )
    expect(screen.queryByText(/Your registration:/)).not.toBeInTheDocument()
  })

  it('treats a non-JSON failure as a rejected lookup and clears the stored id', async () => {
    window.localStorage.setItem('workshophub.registration.5', '9')
    mockFetchWithLookup(new Response('boom', { status: 500 }))
    render(<TrainingSessionsPage />)

    await screen.findByText(session.title)
    await waitFor(() =>
      expect(window.localStorage.getItem('workshophub.registration.5')).toBeNull()
    )
  })
})
