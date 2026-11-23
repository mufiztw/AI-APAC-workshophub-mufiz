import { cancelRegistration } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

const mockTx = {
  $executeRaw: jest.fn(),
  trainingSession: { findUnique: jest.fn() },
  registration: { findFirst: jest.fn(), updateMany: jest.fn() },
}

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
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
  it('cancels a confirmed registration and releases one seat', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'confirmed' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      registered: 3,
      capacity: 10,
    })
  })

  it('runs in a single transaction', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'confirmed' })
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
  })

  it('reports the unchanged count when the guarded decrement affects no row at zero', async () => {
    mockTx.registration.findFirst.mockResolvedValue({ id: 12, sessionId: 7, status: 'confirmed' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 0, capacity: 10 })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({
      status: 'cancelled',
      previousStatus: 'confirmed',
      registered: 0,
      capacity: 10,
    })
  })
})
