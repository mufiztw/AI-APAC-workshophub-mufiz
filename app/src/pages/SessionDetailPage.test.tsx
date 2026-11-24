import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionRegistrations, TrainingSession } from '../types'
import SessionDetailPage from './SessionDetailPage'

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
  registrationDeadline: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const roster: SessionRegistrations = {
  confirmed: [
    {
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'confirmed',
      createdAt: '2026-07-01T09:00:00Z',
    },
    {
      id: 2,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      status: 'confirmed',
      createdAt: '2026-07-02T09:00:00Z',
    },
  ],
  waitlisted: [
    {
      id: 3,
      name: 'Alan Turing',
      email: 'alan@example.com',
      status: 'waitlisted',
      createdAt: '2026-07-03T09:00:00Z',
    },
  ],
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(sessionResponse: Response, rosterResponse: Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/registrations')) return Promise.resolve(rosterResponse)
    return Promise.resolve(sessionResponse)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage(path = '/sessions/5') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Sessions list</p>} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SessionDetailPage', () => {
  it('fetches the session and its registrations for the id in the route', async () => {
    const fetchMock = mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()
    await screen.findByText(session.title)

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((u) => u.endsWith('/api/training-sessions/5'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/api/training-sessions/5/registrations'))).toBe(true)
  })

  it('shows the session title, location, description and date', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()

    expect(await screen.findByRole('heading', { name: session.title })).toBeInTheDocument()
    expect(screen.getByText(/Room A/)).toBeInTheDocument()
    expect(screen.getByText('Learn TDD with AI.')).toBeInTheDocument()
    // The roster dates also contain 2026, so match the long session date form only.
    expect(screen.getByText(/22 July 2026/)).toBeInTheDocument()
  })

  it('shows a Registrations section with Confirmed (N) and Waitlist (N) counts', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()

    expect(await screen.findByRole('heading', { name: /registrations/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Confirmed (2)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Waitlist (1)' })).toBeInTheDocument()
  })

  it('shows name and email for every confirmed and waitlisted entry', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()

    for (const entry of [...roster.confirmed, ...roster.waitlisted]) {
      expect(await screen.findByText(entry.name)).toBeInTheDocument()
      expect(screen.getByText(entry.email)).toBeInTheDocument()
    }
  })

  it('shows each registration date formatted for en-SG', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()
    await screen.findByText('Ada Lovelace')

    const expected = new Date(roster.confirmed[0].createdAt).toLocaleDateString('en-SG', {
      dateStyle: 'medium',
    })
    expect(
      screen.getAllByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length
    ).toBeGreaterThan(0)
  })

  it('lists confirmed entries under Confirmed and waitlisted entries under Waitlist', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()

    const confirmedHeading = await screen.findByRole('heading', { name: 'Confirmed (2)' })
    const confirmedSection = confirmedHeading.parentElement as HTMLElement
    expect(within(confirmedSection).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(confirmedSection).queryByText('Alan Turing')).not.toBeInTheDocument()

    const waitlistHeading = screen.getByRole('heading', { name: 'Waitlist (1)' })
    const waitlistSection = waitlistHeading.parentElement as HTMLElement
    expect(within(waitlistSection).getByText('Alan Turing')).toBeInTheDocument()
  })

  it('shows "No registrations yet" instead of the subsections when both are empty', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, { confirmed: [], waitlisted: [] }))

    renderPage()

    expect(await screen.findByText('No registrations yet')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Confirmed/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Waitlist/ })).not.toBeInTheDocument()
  })

  it('keeps both headings and shows None for an empty subsection when the other has entries', async () => {
    mockFetch(
      jsonResponse(200, session),
      jsonResponse(200, { confirmed: roster.confirmed, waitlisted: [] })
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Confirmed (2)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Waitlist (0)' })).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
    expect(screen.queryByText('No registrations yet')).not.toBeInTheDocument()
  })

  it('shows a loading state before data arrives', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    )

    renderPage()

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows "Training session not found" with a link back when the session returns 404', async () => {
    mockFetch(
      jsonResponse(404, { error: 'Training session not found' }),
      jsonResponse(404, { error: 'Training session not found' })
    )

    renderPage()

    expect(await screen.findByText('Training session not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to sessions/i })).toHaveAttribute('href', '/')
  })

  it('shows "Training session not found" when only the registrations call returns 404', async () => {
    mockFetch(
      jsonResponse(200, session),
      jsonResponse(404, { error: 'Training session not found' })
    )

    renderPage()

    expect(await screen.findByText('Training session not found')).toBeInTheDocument()
  })

  it('shows "Failed to load session" with the server detail on a non-OK status', async () => {
    mockFetch(
      jsonResponse(200, session),
      jsonResponse(500, { error: 'Failed to fetch session registrations' })
    )

    renderPage()

    expect(await screen.findByText(/Failed to load session/)).toBeInTheDocument()
    expect(screen.getByText(/Failed to fetch session registrations/)).toBeInTheDocument()
  })

  it('shows "Failed to load session" when the network request rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    )

    renderPage()

    expect(await screen.findByText(/Failed to load session/)).toBeInTheDocument()
  })

  it('has a "Back to sessions" link to the list', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()

    expect(await screen.findByRole('link', { name: /back to sessions/i })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('offers no login prompt and no cancel, edit or export controls', async () => {
    mockFetch(jsonResponse(200, session), jsonResponse(200, roster))

    renderPage()
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/log ?in|sign ?in/i)).not.toBeInTheDocument()
  })
})
