import { Prisma, Registration } from '@prisma/client'
import prisma from '../lib/prisma'

// SQLite serialises writers, so concurrent registrations queue for the write lock.
// Generous limits stop a burst of requests failing on Prisma's 2s/5s defaults.
const TRANSACTION_MAX_WAIT_MS = 10_000
const TRANSACTION_TIMEOUT_MS = 15_000

export interface RegistrationInput {
  name: string
  email: string
}

export type CreateRegistrationResult =
  | { status: 'created'; registration: Registration; registered: number; capacity: number }
  | {
      status: 'waitlisted'
      registration: Registration
      position: number
      registered: number
      capacity: number
    }
  | { status: 'not_found' }

async function claimSeatAndRegister(
  tx: Prisma.TransactionClient,
  sessionId: number,
  input: RegistrationInput
): Promise<CreateRegistrationResult> {
  const updated = await tx.$executeRaw`
    UPDATE training_sessions
    SET registered = registered + 1
    WHERE id = ${sessionId} AND registered < capacity`

  if (updated === 0) {
    // No seat was free: the same transaction decides to waitlist, so the outcome
    // always matches the seat count.
    const existing = await tx.trainingSession.findUnique({ where: { id: sessionId } })
    if (!existing) {
      return { status: 'not_found' }
    }
    const registration = await tx.registration.create({
      data: { sessionId, name: input.name, email: input.email, status: 'waitlisted' },
    })
    // Position is derived from join order (id) rather than stored.
    const position = await tx.registration.count({
      where: { sessionId, status: 'waitlisted', id: { lte: registration.id } },
    })
    return {
      status: 'waitlisted',
      registration,
      position,
      registered: existing.registered,
      capacity: existing.capacity,
    }
  }

  const registration = await tx.registration.create({
    data: { sessionId, name: input.name, email: input.email, status: 'confirmed' },
  })
  const session = await tx.trainingSession.findUnique({
    where: { id: sessionId },
    select: { registered: true, capacity: true },
  })
  if (!session) {
    throw new Error('Session disappeared during registration')
  }

  return {
    status: 'created',
    registration,
    registered: session.registered,
    capacity: session.capacity,
  }
}

/**
 * Atomically claims a seat (conditional UPDATE) and records the registration as confirmed,
 * or as waitlisted when the session is full, in one transaction, so concurrent requests can never push `registered` above `capacity`.
 */
export async function createRegistration(
  sessionId: number,
  input: RegistrationInput
): Promise<CreateRegistrationResult> {
  return prisma.$transaction((tx) => claimSeatAndRegister(tx, sessionId, input), {
    maxWait: TRANSACTION_MAX_WAIT_MS,
    timeout: TRANSACTION_TIMEOUT_MS,
  })
}
