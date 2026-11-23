import { listSessionRegistrations } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    trainingSession: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
  },
}))

const mockFindSession = prisma.trainingSession.findUnique as jest.Mock
const mockFindMany = prisma.registration.findMany as jest.Mock

afterEach(() => {
  jest.resetAllMocks()
})

describe('listSessionRegistrations repository', () => {
  it('returns not_found for an unknown session without reading registrations', async () => {
    mockFindSession.mockResolvedValue(null)

    const result = await listSessionRegistrations(99)

    expect(mockFindSession).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 99 } }))
    expect(result).toEqual({ status: 'not_found' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns found with the registrations read for the session', async () => {
    const rows = [
      {
        id: 1,
        sessionId: 7,
        name: 'A',
        email: 'a@x.com',
        status: 'confirmed',
        createdAt: new Date(),
      },
    ]
    mockFindSession.mockResolvedValue({ id: 7 })
    mockFindMany.mockResolvedValue(rows)

    const result = await listSessionRegistrations(7)

    expect(result).toEqual({ status: 'found', registrations: rows })
  })

  it('filters cancelled out in the query and orders by createdAt then id', async () => {
    mockFindSession.mockResolvedValue({ id: 7 })
    mockFindMany.mockResolvedValue([])

    await listSessionRegistrations(7)

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 7, status: { in: ['confirmed', 'waitlisted'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    )
  })
})
