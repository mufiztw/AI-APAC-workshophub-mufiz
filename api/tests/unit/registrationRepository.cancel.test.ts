import { cancelRegistration, getRegistration } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

const mockTx = {
  $executeRaw: jest.fn(),
  trainingSession: { findUnique: jest.fn() },
  registration: { findFirst: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
}

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    registration: { findFirst: jest.fn(), count: jest.fn() },
  },
}))

const mockTransaction = prisma.$transaction as jest.Mock

beforeEach(() => {
  mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
    fn(mockTx)
  )
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('cancelRegistration repository', () => {
  it('cancels a confirmed registration and releases one seat when nobody is waiting', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 3,
      capacity: 10,
    })
  })

  it('runs in a single transaction', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('finds the registration scoped to the session', async () => {
    mockTx.registration.findFirst.mockResolvedValue(null)

    await cancelRegistration(7, 12)

    expect(mockTx.registration.findFirst).toHaveBeenCalledWith({
      where: { id: 12, sessionId: 7 },
    })
  })

  it('updates status conditionally on the value just read', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'waitlisted' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTx.registration.updateMany).toHaveBeenCalledWith({
      where: { id: 12, status: 'waitlisted' },
      data: { status: 'cancelled' },
    })
  })

  it('cancels a waitlisted registration without touching registered', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'waitlisted' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'waitlisted',
      promotedRegistrationId: null,
      registered: 10,
      capacity: 10,
    })
  })

  it('returns not_found when the registration is missing or in another session', async () => {
    mockTx.registration.findFirst.mockResolvedValue(null)

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({ status: 'not_found' })
    expect(mockTx.registration.updateMany).not.toHaveBeenCalled()
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('returns already_cancelled when the registration is already cancelled', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'cancelled' })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({ status: 'already_cancelled' })
    expect(mockTx.registration.updateMany).not.toHaveBeenCalled()
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('returns already_cancelled and releases no seat when a concurrent cancel won', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'confirmed' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 0 })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({ status: 'already_cancelled' })
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    expect(mockTx.registration.findFirst).toHaveBeenCalledTimes(1)
  })

  it('reports the unchanged count when the guarded decrement affects no row at zero', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 0, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 0,
      capacity: 10,
    })
  })
})

describe('cancelRegistration repository promotion', () => {
  const confirmed = { id: 12, sessionId: 7, status: 'confirmed' }
  const waitlisted = (id: number) => ({ id, sessionId: 7, status: 'waitlisted' })

  it('looks for the earliest waitlisted registration ordered by createdAt then id', async () => {
    mockTx.registration.findFirst.mockResolvedValueOnce(confirmed).mockResolvedValueOnce(null)
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTx.registration.findFirst).toHaveBeenNthCalledWith(2, {
      where: { sessionId: 7, status: 'waitlisted' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
  })

  it('promotes the first waitlisted registration conditionally and reports its id', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(waitlisted(30))
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.registration.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 30, status: 'waitlisted' },
      data: { status: 'confirmed' },
    })
    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })
  })

  it('does not change registered when a registration is promoted', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(waitlisted(30))
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('tries the next candidate when the first was already taken by a competing change', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(waitlisted(30))
      .mockResolvedValueOnce(waitlisted(31))
    mockTx.registration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.registration.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: 31, status: 'waitlisted' },
      data: { status: 'confirmed' },
    })
    expect(result).toMatchObject({ status: 'cancelled', promotedRegistrationId: 31 })
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('releases the seat when every candidate was taken and none is left', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(waitlisted(30))
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 9, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 9,
      capacity: 10,
    })
  })

  it('never looks for a waitlisted candidate when a waitlisted registration is cancelled', async () => {
    mockTx.registration.findFirst.mockResolvedValueOnce(waitlisted(12))
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.registration.findFirst).toHaveBeenCalledTimes(1)
    expect(mockTx.registration.updateMany).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ promotedRegistrationId: null })
  })
})

describe('getRegistration repository', () => {
  const mockPrisma = prisma as unknown as {
    registration: { findFirst: jest.Mock; count: jest.Mock }
  }

  it('returns not_found when no registration matches the id and session', async () => {
    mockPrisma.registration.findFirst.mockResolvedValue(null)

    const result = await getRegistration(7, 12)

    expect(mockPrisma.registration.findFirst).toHaveBeenCalledWith({
      where: { id: 12, sessionId: 7 },
    })
    expect(result).toEqual({ status: 'not_found' })
  })

  it('returns a confirmed registration without a position', async () => {
    const row = { id: 12, sessionId: 7, status: 'confirmed' }
    mockPrisma.registration.findFirst.mockResolvedValue(row)

    const result = await getRegistration(7, 12)

    expect(result).toEqual({ status: 'found', registration: row })
    expect(mockPrisma.registration.count).not.toHaveBeenCalled()
  })

  it('returns the waitlist position derived from join order', async () => {
    const row = { id: 12, sessionId: 7, status: 'waitlisted' }
    mockPrisma.registration.findFirst.mockResolvedValue(row)
    mockPrisma.registration.count.mockResolvedValue(3)

    const result = await getRegistration(7, 12)

    expect(mockPrisma.registration.count).toHaveBeenCalledWith({
      where: { sessionId: 7, status: 'waitlisted', id: { lte: 12 } },
    })
    expect(result).toEqual({ status: 'found', registration: row, position: 3 })
  })

  it('does not compute a position for a cancelled registration', async () => {
    const row = { id: 12, sessionId: 7, status: 'cancelled' }
    mockPrisma.registration.findFirst.mockResolvedValue(row)

    const result = await getRegistration(7, 12)

    expect(result).toEqual({ status: 'found', registration: row })
    expect(mockPrisma.registration.count).not.toHaveBeenCalled()
  })
})
