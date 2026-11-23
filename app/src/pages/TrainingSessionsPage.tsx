import { useEffect, useState } from 'react'
import type { RegistrationRequest, RegistrationResponse, TrainingSession } from '../types'
import TrainingSessionCard from '../components/TrainingSessionCard'
import './TrainingSessionsPage.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

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
      throw new Error(errorMessageFrom(body) ?? `Registration failed: ${res.status}`)
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
    return registration
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
      <div className="sessions-grid">
        {sessions.map((session) => (
          <TrainingSessionCard
            key={session.id}
            session={session}
            onRegister={(input) => handleRegister(session.id, input)}
          />
        ))}
      </div>
    </section>
  )
}

export default TrainingSessionsPage
