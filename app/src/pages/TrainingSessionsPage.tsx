import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../types'
import type {
  CancelResponse,
  RegistrationLookup,
  RegistrationRequest,
  RegistrationResponse,
  TrainingSession,
} from '../types'
import Banner from '../components/Banner'
import TrainingSessionCard from '../components/TrainingSessionCard'
import './TrainingSessionsPage.css'

const API_BASE = import.meta.env.VITE_API_URL || ''
const BANNER_AUTO_DISMISS_MS = 5000

interface BannerState {
  id: number
  kind: 'registered' | 'waitlisted'
  message: string
}

function errorMessageFrom(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return typeof body.error === 'string' ? body.error : null
  }
  return null
}

function TrainingSessionsPage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<BannerState | null>(null)
  const bannerCounter = useRef(0)

  const bannerId = banner?.id
  useEffect(() => {
    if (bannerId === undefined) return
    const timer = setTimeout(() => setBanner(null), BANNER_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [bannerId])

  useEffect(() => {
    fetch(`${API_BASE}/api/training-sessions`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`)
        return res.json()
      })
      .then((data: TrainingSession[]) => {
        setSessions(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  async function handleRegister(
    sessionId: number,
    input: RegistrationRequest
  ): Promise<RegistrationResponse> {
    const res = await fetch(`${API_BASE}/api/training-sessions/${sessionId}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new ApiError(errorMessageFrom(body) ?? `Registration failed: ${res.status}`, res.status)
    }
    const registration: RegistrationResponse = await res.json()
    if (registration.status === 'confirmed') {
      setSessions((current) =>
        current.map((s) =>
          s.id === sessionId
            ? { ...s, registered: registration.registered, capacity: registration.capacity }
            : s
        )
      )
    }
    const registeredSession = sessions.find((s) => s.id === sessionId)
    if (registeredSession) {
      const date = new Date(registeredSession.date).toLocaleDateString('en-SG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      bannerCounter.current += 1
      setBanner({
        id: bannerCounter.current,
        kind: registration.status === 'waitlisted' ? 'waitlisted' : 'registered',
        message:
          registration.status === 'waitlisted'
            ? `You're on the waitlist for ${registeredSession.title}. We'll let you know if a spot opens up.`
            : `You're registered! ${registeredSession.title} on ${date}`,
      })
    }
    return registration
  }

  async function handleCancel(sessionId: number, registrationId: number): Promise<CancelResponse> {
    const res = await fetch(
      `${API_BASE}/api/training-sessions/${sessionId}/registrations/${registrationId}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new Error(errorMessageFrom(body) ?? `Cancellation failed: ${res.status}`)
    }
    const result: CancelResponse = await res.json()
    setSessions((current) =>
      current.map((s) =>
        s.id === sessionId ? { ...s, registered: result.registered, capacity: result.capacity } : s
      )
    )
    return result
  }

  async function handleLookup(
    sessionId: number,
    registrationId: number
  ): Promise<RegistrationLookup> {
    const res = await fetch(
      `${API_BASE}/api/training-sessions/${sessionId}/registrations/${registrationId}`
    )
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new Error(errorMessageFrom(body) ?? `Lookup failed: ${res.status}`)
    }
    return res.json()
  }

  if (loading) {
    return <div className="page-state">Loading training sessions...</div>
  }

  if (error) {
    return (
      <div className="page-state page-state--error">
        <p>Failed to load training sessions.</p>
        <p className="error-detail">{error}</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return <div className="page-state">No training sessions available.</div>
  }

  return (
    <section className="sessions-page">
      <h2 className="sessions-heading">Available Training Sessions</h2>
      <p className="sessions-count">
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} available
      </p>
      {banner && (
        <Banner kind={banner.kind} message={banner.message} onDismiss={() => setBanner(null)} />
      )}
      <div className="sessions-grid">
        {sessions.map((session) => (
          <TrainingSessionCard
            key={session.id}
            session={session}
            onRegister={(input) => handleRegister(session.id, input)}
            onCancel={(registrationId) => handleCancel(session.id, registrationId)}
            onLookup={(registrationId) => handleLookup(session.id, registrationId)}
          />
        ))}
      </div>
    </section>
  )
}

export default TrainingSessionsPage
