import { createRegistration } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

const mockTx = {
  $executeRaw: jest.fn(),
  trainingSession: { findUnique: jest.fn() },
  registration: { create: jest.fn(), count: jest.fn() },
}

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
  },
}))

const mockTransaction = prisma.$transaction as jest.Mock

const input = { name: 'Ada', email: 'ada@example.com' }
const registration = {
  id: 1,
  sessionId: 7,
  name: 'Ada',
  email: 'ada@example.com',
  status: 'confirmed',
  createdAt: new Date('2026-07-01T09:00:00Z'),
}

beforeEach(() => {
  mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
    fn(mockTx)
  )
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('createRegistration', () => {
  it('creates the registration when the conditional increment succeeds', async () => {
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.registration.create.mockResolvedValue(registration)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 4, capacity: 10 })

    const result = await createRegistration(7, input)

    expect(mockTx.registration.create).toHaveBeenCalledWith({
      data: { sessionId: 7, name: 'Ada', email: 'ada@example.com', status: 'confirmed' },
    })
    expect(result).toEqual({ status: 'created', registration, registered: 4, capacity: 10 })
  })

  it('waitlists the registration when no seat is free and the session exists', async () => {
    const waitlisted = { ...registration, id: 12, status: 'waitlisted' }
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })
    mockTx.registration.create.mockResolvedValue(waitlisted)
    mockTx.registration.count.mockResolvedValue(3)

    const result = await createRegistration(7, input)

    expect(mockTx.registration.create).toHaveBeenCalledWith({
      data: { sessionId: 7, name: 'Ada', email: 'ada@example.com', status: 'waitlisted' },
    })
    expect(result).toEqual({
      status: 'waitlisted',
      registration: waitlisted,
      position: 3,
      registered: 10,
      capacity: 10,
    })
  })

  it('computes position from waitlisted rows of the same session up to the new id', async () => {
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })
    mockTx.registration.create.mockResolvedValue({ ...registration, id: 12, status: 'waitlisted' })
    mockTx.registration.count.mockResolvedValue(1)

    await createRegistration(7, input)

    expect(mockTx.registration.count).toHaveBeenCalledWith({
      where: { sessionId: 7, status: 'waitlisted', id: { lte: 12 } },
    })
  })

  it('returns not_found when no row was updated and the session is missing', async () => {
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue(null)

    const result = await createRegistration(999, input)

    expect(result).toEqual({ status: 'not_found' })
    expect(mockTx.registration.create).not.toHaveBeenCalled()
  })
})
