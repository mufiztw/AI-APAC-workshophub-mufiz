import { Registration } from '@prisma/client'
import { SessionFullError, SessionNotFoundError, ValidationError } from '../errors'
import { createRegistration, RegistrationInput } from '../repositories/registrationRepository'

export type RegistrationResult = Registration & { registered: number; capacity: number }

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
): Promise<RegistrationResult> {
  const data = parseInput(input)
  const result = await createRegistration(sessionId, data)

  switch (result.status) {
    case 'not_found':
      throw new SessionNotFoundError()
    case 'full':
      throw new SessionFullError()
    case 'created':
      return { ...result.registration, registered: result.registered, capacity: result.capacity }
  }
}
