import { FormEvent, useEffect, useRef, useState } from 'react'
import type {
  CancelResponse,
  RegistrationLookup,
  RegistrationRequest,
  RegistrationResponse,
  RegistrationStatus,
  TrainingSession,
} from '../types'
import './TrainingSessionCard.css'

interface Props {
  session: TrainingSession
  onRegister: (input: RegistrationRequest) => Promise<RegistrationResponse>
  onCancel: (registrationId: number) => Promise<CancelResponse>
  onLookup: (registrationId: number) => Promise<RegistrationLookup>
}

// Storage can be missing or throw (private mode, disabled), so it must never break the card.
function readStoredId(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key)
    if (value === null) return null
    const id = Number(value)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function storeId(key: string, id: number): void {
  try {
    window.localStorage.setItem(key, String(id))
  } catch {
    // Remembering the registration is best effort.
  }
}

function clearStoredId(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function statusLine(status: RegistrationStatus, position: number | undefined): string {
  if (status === 'waitlisted') return `Your registration: Waitlisted (position ${position})`
  return `Your registration: ${status === 'confirmed' ? 'Confirmed' : 'Cancelled'}`
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

function TrainingSessionCard({ session, onRegister, onCancel, onLookup }: Props) {
  const spotsLeft = session.capacity - session.registered
  const isFull = spotsLeft <= 0
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [registration, setRegistration] = useState<{
    id: number
    status: RegistrationStatus
  } | null>(null)
  const [position, setPosition] = useState<number | undefined>(undefined)
  const [cancelling, setCancelling] = useState(false)
  const storageKey = `workshophub.registration.${session.id}`

  // The parent recreates onLookup on every render; keep the latest one in a ref so the
  // load-time lookup below runs once per session instead of on every render.
  const onLookupRef = useRef(onLookup)
  useEffect(() => {
    onLookupRef.current = onLookup
  })

  useEffect(() => {
    const storedId = readStoredId(storageKey)
    if (storedId === null) return
    let active = true
    onLookupRef.current(storedId).then(
      (found) => {
        if (!active) return
        setRegistration({ id: found.id, status: found.status })
        setPosition(found.position)
      },
      () => clearStoredId(storageKey)
    )
    return () => {
      active = false
    }
  }, [storageKey])

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
      setRegistration({ id: result.id, status: result.status })
      setPosition(result.position)
      storeId(storageKey, result.id)
      setName('')
      setEmail('')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!registration) return
    if (
      !window.confirm(`Are you sure you want to cancel your registration for ${session.title}?`)
    ) {
      return
    }
    setCancelling(true)
    setConfirmation(null)
    setErrorMessage(null)
    try {
      await onCancel(registration.id)
      setRegistration({ ...registration, status: 'cancelled' })
      setConfirmation('Your registration has been cancelled')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Cancellation failed')
    } finally {
      setCancelling(false)
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
        {registration?.status === 'confirmed' && (
          <button
            type="button"
            className="registration-form__button"
            onClick={handleCancel}
            disabled={cancelling}
          >
            Cancel Registration
          </button>
        )}
        {registration?.status === 'cancelled' && (
          <button type="button" className="registration-form__button" disabled>
            Cancelled
          </button>
        )}
        {registration && (
          <p className="registration-form__status">{statusLine(registration.status, position)}</p>
        )}
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
