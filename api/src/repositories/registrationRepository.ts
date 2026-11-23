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

export type CancelRegistrationResult =
  | {
      status: 'cancelled'
      previousStatus: string
      promotedRegistrationId: number | null
      registered: number
      capacity: number
    }
  | { status: 'not_found' }
  | { status: 'already_cancelled' }

// Join order (createdAt, then id) matches the derived waitlist position. The conditional
// update skips a candidate that a competing change already took.
async function promoteFirstWaitlisted(
  tx: Prisma.TransactionClient,
  sessionId: number
): Promise<number | null> {
  for (;;) {
    const candidate = await tx.registration.findFirst({
      where: { sessionId, status: 'waitlisted' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    if (!candidate) {
      return null
    }
    const promoted = await tx.registration.updateMany({
      where: { id: candidate.id, status: 'waitlisted' },
      data: { status: 'confirmed' },
    })
    if (promoted.count === 1) {
      return candidate.id
    }
  }
}

async function cancelAndReleaseSeat(
  tx: Prisma.TransactionClient,
  sessionId: number,
  registrationId: number
): Promise<CancelRegistrationResult> {
  const registration = await tx.registration.findFirst({
    where: { id: registrationId, sessionId },
  })
  if (!registration) {
    return { status: 'not_found' }
  }
  if (registration.status === 'cancelled') {
    return { status: 'already_cancelled' }
  }

  // Conditional on the status just read: if a concurrent cancel won, no row changes
  // and this request must not release a second seat.
  const updated = await tx.registration.updateMany({
    where: { id: registrationId, status: registration.status },
    data: { status: 'cancelled' },
  })
  if (updated.count === 0) {
    return { status: 'already_cancelled' }
  }

  let promotedRegistrationId: number | null = null
  if (registration.status === 'confirmed') {
    // Promotion runs in the cancellation transaction so the freed seat is never
    // visible to a newcomer while someone is waiting.
    promotedRegistrationId = await promoteFirstWaitlisted(tx, sessionId)
    if (promotedRegistrationId === null) {
      await tx.$executeRaw`
        UPDATE training_sessions
        SET registered = registered - 1
        WHERE id = ${sessionId} AND registered > 0`
    }
  }

  const session = await tx.trainingSession.findUnique({
    where: { id: sessionId },
    select: { registered: true, capacity: true },
  })
  if (!session) {
    throw new Error('Session disappeared during cancellation')
  }

  return {
    status: 'cancelled',
    previousStatus: registration.status,
    promotedRegistrationId,
    registered: session.registered,
    capacity: session.capacity,
  }
}

/**
 * Soft-cancels a registration and, if it was confirmed, gives its seat back, in one transaction.
 */
export async function cancelRegistration(
  sessionId: number,
  registrationId: number
): Promise<CancelRegistrationResult> {
  return prisma.$transaction((tx) => cancelAndReleaseSeat(tx, sessionId, registrationId), {
    maxWait: TRANSACTION_MAX_WAIT_MS,
    timeout: TRANSACTION_TIMEOUT_MS,
  })
}

export type RegistrationLookupResult =
  | { status: 'found'; registration: Registration; position?: number }
  | { status: 'not_found' }

export async function getRegistration(
  sessionId: number,
  registrationId: number
): Promise<RegistrationLookupResult> {
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, sessionId },
  })
  if (!registration) {
    return { status: 'not_found' }
  }
  if (registration.status !== 'waitlisted') {
    return { status: 'found', registration }
  }
  const position = await prisma.registration.count({
    where: { sessionId, status: 'waitlisted', id: { lte: registration.id } },
  })
  return { status: 'found', registration, position }
}
