import { Registration } from '@prisma/client'
import {
  RegistrationAlreadyCancelledError,
  RegistrationDeadlinePassedError,
  RegistrationNotFoundError,
  SessionNotFoundError,
  ValidationError,
} from '../errors'
import {
  cancelRegistration as cancelRegistrationInRepository,
  createRegistration,
  getRegistration as getRegistrationFromRepository,
  listRegistrationAudit,
  listSessionRegistrations,
  RegistrationInput,
} from '../repositories/registrationRepository'
import { notifyRegistration } from './notificationService'
import { onRegistrationPromoted } from './waitlistPromotion'

export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled'

// Prisma models `status` as a plain string (SQLite has no enums); the values written
// are limited to RegistrationStatus.
export type RegistrationResult = Registration & { registered: number; capacity: number }

export type WaitlistResult = RegistrationResult & { position: number }

export interface CancelResponse {
  status: 'cancelled'
  promotedRegistrationId: number | null
  registered: number
  capacity: number
}

export interface RegistrationLookup {
  id: number
  sessionId: number
  status: RegistrationStatus
  position?: number
}

const MAX_NAME_LENGTH = 100
const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`)
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`)
  }
  return trimmed
}

function parseInput(input: unknown): RegistrationInput {
  const body = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const name = requireString(body.name, 'name', MAX_NAME_LENGTH)
  const email = requireString(body.email, 'email', MAX_EMAIL_LENGTH)
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('email is invalid')
  }
  return { name, email }
}

export async function registerForSession(
  sessionId: number,
  input: unknown
): Promise<RegistrationResult | WaitlistResult> {
  const data = parseInput(input)
  const result = await createRegistration(sessionId, data)

  switch (result.status) {
    case 'not_found':
      throw new SessionNotFoundError()
    case 'deadline_passed':
      throw new RegistrationDeadlinePassedError()
    case 'waitlisted':
      return {
        ...result.registration,
        status: 'waitlisted',
        position: result.position,
        registered: result.registered,
        capacity: result.capacity,
      }
    case 'created':
      notifyRegistration({
        name: result.registration.name,
        email: result.registration.email,
        sessionTitle: result.sessionTitle,
        sessionDate: result.sessionDate,
        status: 'confirmed',
      })
      return { ...result.registration, registered: result.registered, capacity: result.capacity }
  }
}

export async function cancelRegistration(
  sessionId: number,
  registrationId: number
): Promise<CancelResponse> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ValidationError('session id must be a positive whole number')
  }
  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    throw new ValidationError('registration id must be a positive whole number')
  }

  const result = await cancelRegistrationInRepository(sessionId, registrationId)

  switch (result.status) {
    case 'not_found':
      throw new RegistrationNotFoundError()
    case 'already_cancelled':
      throw new RegistrationAlreadyCancelledError()
    case 'cancelled':
      // After the commit and not awaited, so a notification problem or delay cannot
      // undo or slow a valid cancellation.
      if (result.promotedRegistrationId !== null) {
        Promise.resolve(onRegistrationPromoted(sessionId, result.promotedRegistrationId)).catch(
          (error: unknown) => {
            console.error('[notification] promotion hand-off failed', error)
          }
        )
      }
      return {
        status: 'cancelled',
        promotedRegistrationId: result.promotedRegistrationId,
        registered: result.registered,
        capacity: result.capacity,
      }
  }
}

export async function getRegistration(
  sessionId: number,
  registrationId: number
): Promise<RegistrationLookup> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ValidationError('session id must be a positive whole number')
  }
  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    throw new ValidationError('registration id must be a positive whole number')
  }

  const result = await getRegistrationFromRepository(sessionId, registrationId)
  if (result.status === 'not_found') {
    throw new RegistrationNotFoundError()
  }

  const { registration, position } = result
  const lookup: RegistrationLookup = {
    id: registration.id,
    sessionId: registration.sessionId,
    status: registration.status as RegistrationStatus,
  }
  if (position !== undefined) {
    lookup.position = position
  }
  return lookup
}

export interface RegistrationEntry {
  id: number
  name: string
  email: string
  status: RegistrationStatus
  createdAt: Date
}

export interface SessionRegistrations {
  confirmed: RegistrationEntry[]
  waitlisted: RegistrationEntry[]
}

export async function getSessionRegistrations(sessionId: number): Promise<SessionRegistrations> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ValidationError('Invalid session ID')
  }

  const result = await listSessionRegistrations(sessionId)
  if (result.status === 'not_found') {
    throw new SessionNotFoundError()
  }

  const roster: SessionRegistrations = { confirmed: [], waitlisted: [] }
  for (const registration of result.registrations) {
    const entry: RegistrationEntry = {
      id: registration.id,
      name: registration.name,
      email: registration.email,
      status: registration.status as RegistrationStatus,
      createdAt: registration.createdAt,
    }
    if (registration.status === 'confirmed') roster.confirmed.push(entry)
    else if (registration.status === 'waitlisted') roster.waitlisted.push(entry)
  }
  return roster
}

export interface AuditEntry {
  id: number
  registrationId: number
  fromStatus: RegistrationStatus | null
  toStatus: RegistrationStatus
  changedAt: Date
  reason: string | null
}

export async function getRegistrationAudit(
  sessionId: number,
  registrationId: number
): Promise<AuditEntry[]> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ValidationError('session id must be a positive whole number')
  }
  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    throw new ValidationError('registration id must be a positive whole number')
  }

  const result = await listRegistrationAudit(sessionId, registrationId)
  if (result.status === 'not_found') {
    throw new RegistrationNotFoundError()
  }

  return result.entries.map((entry) => ({
    id: entry.id,
    registrationId: entry.registrationId,
    fromStatus: entry.fromStatus as RegistrationStatus | null,
    toStatus: entry.toStatus as RegistrationStatus,
    changedAt: entry.changedAt,
    reason: entry.reason,
  }))
}
