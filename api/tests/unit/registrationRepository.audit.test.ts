import {
  cancelRegistration,
  createRegistration,
  listRegistrationAudit,
} from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

const mockTx = {
  $executeRaw: jest.fn(),
  trainingSession: { findUnique: jest.fn() },
  registration: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
}

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    registration: { findFirst: jest.fn() },
    auditLog: { findMany: jest.fn() },
  },
}))

const mockTransaction = prisma.$transaction as jest.Mock
const mockFindRegistration = prisma.registration.findFirst as jest.Mock
const mockFindAudit = prisma.auditLog.findMany as jest.Mock

const input = { name: 'Ada', email: 'ada@example.com' }

beforeEach(() => {
  mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
    fn(mockTx)
  )
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('audit entries on registration', () => {
  it('records null -> confirmed (registered) when a seat is claimed', async () => {
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.registration.create.mockResolvedValue({ id: 5, status: 'confirmed' })
    mockTx.trainingSession.findUnique
      .mockResolvedValueOnce({ registrationDeadline: null })
      .mockResolvedValue({ registered: 1, capacity: 10, title: 'T', date: new Date() })

    await createRegistration(7, input)

    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: { registrationId: 5, fromStatus: null, toStatus: 'confirmed', reason: 'registered' },
    })
  })

  it('records null -> waitlisted (waitlisted) when the session is full', async () => {
    mockTx.$executeRaw.mockResolvedValue(0)
    mockTx.registration.create.mockResolvedValue({ id: 6, status: 'waitlisted' })
    mockTx.registration.count.mockResolvedValue(1)
    mockTx.trainingSession.findUnique
      .mockResolvedValueOnce({ registrationDeadline: null })
      .mockResolvedValue({ registered: 10, capacity: 10 })

    await createRegistration(7, input)

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: { registrationId: 6, fromStatus: null, toStatus: 'waitlisted', reason: 'waitlisted' },
    })
  })

  it('records nothing when the session is not found', async () => {
    mockTx.trainingSession.findUnique.mockResolvedValue(null)
    await createRegistration(7, input)
    expect(mockTx.auditLog.create).not.toHaveBeenCalled()
  })

  it('records nothing when the deadline has passed', async () => {
    mockTx.trainingSession.findUnique.mockResolvedValue({
      registrationDeadline: new Date(Date.now() - 1000),
    })
    await createRegistration(7, input)
    expect(mockTx.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('audit entries on cancellation', () => {
  it('records confirmed -> cancelled when nobody is waiting', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        registrationId: 12,
        fromStatus: 'confirmed',
        toStatus: 'cancelled',
        reason: 'cancelled',
      },
    })
  })

  it('records waitlisted -> cancelled for a waitlisted registration', async () => {
    mockTx.registration.findFirst.mockResolvedValueOnce({
      id: 13,
      sessionId: 7,
      status: 'waitlisted',
    })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 13)

    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        registrationId: 13,
        fromStatus: 'waitlisted',
        toStatus: 'cancelled',
        reason: 'cancelled',
      },
    })
  })

  it('records the cancel entry then the promotion entry in the same transaction', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce({ id: 30, sessionId: 7, status: 'waitlisted' })
    mockTx.registration.updateMany.mockResolvedValue({ count: 1 })
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTx.auditLog.create.mock.calls).toEqual([
      [
        {
          data: {
            registrationId: 12,
            fromStatus: 'confirmed',
            toStatus: 'cancelled',
            reason: 'cancelled',
          },
        },
      ],
      [
        {
          data: {
            registrationId: 30,
            fromStatus: 'waitlisted',
            toStatus: 'confirmed',
            reason: 'promoted',
          },
        },
      ],
    ])
  })

  it('writes no promotion entry when the conditional promotion update lost', async () => {
    mockTx.registration.findFirst
      .mockResolvedValueOnce({ id: 12, sessionId: 7, status: 'confirmed' })
      .mockResolvedValueOnce({ id: 30, sessionId: 7, status: 'waitlisted' })
      .mockResolvedValueOnce(null)
    mockTx.registration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.trainingSession.findUnique.mockResolvedValue({ registered: 3, capacity: 10 })

    await cancelRegistration(7, 12)

    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toStatus: 'cancelled' }) })
    )
  })

  it('records nothing for not_found, already_cancelled or a lost cancel update', async () => {
    mockTx.registration.findFirst.mockResolvedValueOnce(null)
    await cancelRegistration(7, 1)

    mockTx.registration.findFirst.mockResolvedValueOnce({ id: 2, status: 'cancelled' })
    await cancelRegistration(7, 2)

    mockTx.registration.findFirst.mockResolvedValueOnce({ id: 3, status: 'confirmed' })
    mockTx.registration.updateMany.mockResolvedValueOnce({ count: 0 })
    await cancelRegistration(7, 3)

    expect(mockTx.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('listRegistrationAudit', () => {
  it('returns not_found when the registration is missing or in another session', async () => {
    mockFindRegistration.mockResolvedValue(null)

    const result = await listRegistrationAudit(7, 12)

    expect(mockFindRegistration).toHaveBeenCalledWith({ where: { id: 12, sessionId: 7 } })
    expect(result).toEqual({ status: 'not_found' })
    expect(mockFindAudit).not.toHaveBeenCalled()
  })

  it('returns entries ordered by changedAt then id', async () => {
    const entries = [{ id: 1 }, { id: 2 }]
    mockFindRegistration.mockResolvedValue({ id: 12, sessionId: 7 })
    mockFindAudit.mockResolvedValue(entries)

    const result = await listRegistrationAudit(7, 12)

    expect(mockFindAudit).toHaveBeenCalledWith({
      where: { registrationId: 12 },
      orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
    })
    expect(result).toEqual({ status: 'found', entries })
  })
})
