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
  | { status: 'full' }
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
    const existing = await tx.trainingSession.findUnique({ where: { id: sessionId } })
    return existing ? { status: 'full' } : { status: 'not_found' }
  }

  const registration = await tx.registration.create({
    data: { sessionId, name: input.name, email: input.email },
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
 * Atomically claims a seat (conditional UPDATE) and records the registration in one
 * transaction, so concurrent requests can never push `registered` above `capacity`.
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
