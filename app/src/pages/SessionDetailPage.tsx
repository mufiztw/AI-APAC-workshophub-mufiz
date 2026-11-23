import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { RegistrationEntry, SessionRegistrations, TrainingSession } from '../types'
import './SessionDetailPage.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

function errorMessageFrom(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return typeof body.error === 'string' ? body.error : null
  }
  return null
}

class NotFoundError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 404) throw new NotFoundError('Training session not found')
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    throw new Error(errorMessageFrom(body) ?? `Server error: ${res.status}`)
  }
  return res.json()
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

function formatRegistrationDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SG', { dateStyle: 'medium' })
}

interface GroupProps {
  title: string
  entries: RegistrationEntry[]
}

function RegistrationGroup({ title, entries }: GroupProps) {
  return (
    <div className="roster-group">
      <h4 className="roster-group__heading">{`${title} (${entries.length})`}</h4>
      {entries.length === 0 ? (
        <p className="roster-group__empty">None</p>
      ) : (
        <ul className="roster-list">
          {entries.map((entry) => (
            <li key={entry.id} className="roster-entry">
              <span className="roster-entry__name">{entry.name}</span>
              <span className="roster-entry__email">{entry.email}</span>
              <span className="roster-entry__date">
                Registered {formatRegistrationDate(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [roster, setRoster] = useState<SessionRegistrations | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setError(null)
    Promise.all([
      fetchJson<TrainingSession>(`${API_BASE}/api/training-sessions/${id}`),
      fetchJson<SessionRegistrations>(`${API_BASE}/api/training-sessions/${id}/registrations`),
    ])
      .then(([loadedSession, loadedRoster]) => {
        if (!active) return
        setSession(loadedSession)
        setRoster(loadedRoster)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof NotFoundError) setNotFound(true)
        else setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  if (loading) {
    return <div className="page-state">Loading session...</div>
  }

  if (notFound) {
    return (
      <div className="page-state">
        <p>Training session not found</p>
        <Link to="/">Back to sessions</Link>
      </div>
    )
  }

  if (error || !session || !roster) {
    return (
      <div className="page-state page-state--error">
        <p>Failed to load session.</p>
        <p className="error-detail">{error}</p>
        <Link to="/">Back to sessions</Link>
      </div>
    )
  }

  const noRegistrations = roster.confirmed.length === 0 && roster.waitlisted.length === 0

  return (
    <section className="session-detail">
      <Link to="/" className="session-detail__back">
        Back to sessions
      </Link>
      <h2 className="session-detail__title">{session.title}</h2>
      <p className="session-detail__meta">
        {formatDate(session.date)}, {formatTime(session.date)} | {session.location}
      </p>
      <p className="session-detail__description">{session.description}</p>

      <h3 className="session-detail__section">Registrations</h3>
      {noRegistrations ? (
        <p className="roster-group__empty">No registrations yet</p>
      ) : (
        <>
          <RegistrationGroup title="Confirmed" entries={roster.confirmed} />
          <RegistrationGroup title="Waitlist" entries={roster.waitlisted} />
        </>
      )}
    </section>
  )
}

export default SessionDetailPage
