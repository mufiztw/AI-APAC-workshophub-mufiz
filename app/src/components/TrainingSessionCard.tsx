import { FormEvent, useState } from 'react'
import type { RegistrationRequest, RegistrationResponse, TrainingSession } from '../types'
import './TrainingSessionCard.css'

interface Props {
  session: TrainingSession
  onRegister: (input: RegistrationRequest) => Promise<RegistrationResponse>
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
  return new Date(dateStr).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function deliveryModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    'in-person': 'In Person',
    online: 'Online',
    hybrid: 'Hybrid',
  }
  return labels[mode] ?? mode
}

function TrainingSessionCard({ session, onRegister }: Props) {
  const spotsLeft = session.capacity - session.registered
  const isFull = spotsLeft <= 0
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setConfirmation(null)
    setErrorMessage(null)
    try {
      const result = await onRegister({ name, email })
      setConfirmation(
        result.status === 'waitlisted'
          ? `You are on the waitlist for ${session.title} at position ${result.position}. Your place is not confirmed.`
          : `You are registered for ${session.title}.`
      )
      setName('')
      setEmail('')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className={`session-card ${isFull ? 'session-card--full' : ''}`}>
      <div className="session-card__header">
        <span className={`session-badge session-badge--${session.deliveryMode}`}>
          {deliveryModeLabel(session.deliveryMode)}
        </span>
        {isFull && <span className="session-badge session-badge--full">Full</span>}
      </div>

      <h3 className="session-card__title">{session.title}</h3>
      <p className="session-card__description">{session.description}</p>

      <div className="session-card__meta">
        <div className="meta-item">
          <span className="meta-label">Date</span>
          <span className="meta-value">{formatDate(session.date)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Time</span>
          <span className="meta-value">{formatTime(session.date)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Location</span>
          <span className="meta-value">{session.location}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Capacity</span>
          <span className="meta-value">
            {session.registered} / {session.capacity} registered
            {!isFull && (
              <span className="spots-left">
                {' '}
                ({spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left)
              </span>
            )}
          </span>
        </div>
      </div>

      <form className="registration-form" onSubmit={handleSubmit}>
        {isFull && (
          <p className="registration-form__hint">
            This session is full. Join the waitlist and we will keep your place in line.
          </p>
        )}
        <label className="registration-form__field">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="registration-form__field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" className="registration-form__button" disabled={submitting}>
          {isFull ? 'Join Waitlist' : 'Register'}
        </button>
        {confirmation && (
          <p
            className="registration-form__message registration-form__message--success"
            role="status"
          >
            {confirmation}
          </p>
        )}
        {errorMessage && (
          <p className="registration-form__message registration-form__message--error" role="alert">
            {errorMessage}
          </p>
        )}
      </form>
    </article>
  )
}

export default TrainingSessionCard
