import { Registration } from '@prisma/client'
import { SessionNotFoundError, ValidationError } from '../errors'
import { createRegistration, RegistrationInput } from '../repositories/registrationRepository'

export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled'

// Prisma models `status` as a plain string (SQLite has no enums); the values written
// are limited to RegistrationStatus.
export type RegistrationResult = Registration & { registered: number; capacity: number }

export type WaitlistResult = RegistrationResult & { position: number }

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
    case 'waitlisted':
      return {
        ...result.registration,
        status: 'waitlisted',
        position: result.position,
        registered: result.registered,
        capacity: result.capacity,
      }
    case 'created':
      return { ...result.registration, registered: result.registered, capacity: result.capacity }
  }
}
