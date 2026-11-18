import { createRegistration } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

const mockTx = {
  $executeRaw: jest.fn(),
  trainingSession: { findUnique: jest.fn() },
  registration: { create: jest.fn() },
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
      data: { sessionId: 7, name: 'Ada', email: 'ada@example.com' },
    })
    expect(result).toEqual({ status: 'created', registration, registered: 4, capacity: 10 })
  })

  it('returns full when no row was updated and the session exists', async () => {
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 10, capacity: 10 })

    const result = await createRegistration(7, input)

    expect(result).toEqual({ status: 'full' })
    expect(mockTx.registration.create).not.toHaveBeenCalled()
  })

  it('returns not_found when no row was updated and the session is missing', async () => {
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.trainingSession.findUnique.mockResolvedValue(null)

    const result = await createRegistration(999, input)

    expect(result).toEqual({ status: 'not_found' })
    expect(mockTx.registration.create).not.toHaveBeenCalled()
  })
})
