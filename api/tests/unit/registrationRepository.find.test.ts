import { findRegistrationWithSession } from '../../src/repositories/registrationRepository'
import prisma from '../../src/lib/prisma'

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    registration: { findUnique: jest.fn() },
  },
}))

const mockFindUnique = prisma.registration.findUnique as jest.Mock

afterEach(() => {
  jest.resetAllMocks()
})

describe('findRegistrationWithSession repository', () => {
  it('reads the registration by id including its session', async () => {
    mockFindUnique.mockResolvedValue(null)

    await findRegistrationWithSession(30)

    expect(mockFindUnique).toHaveBeenCalledTimes(1)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 30 },
      include: { session: true },
    })
  })

  it('returns the registration with its session', async () => {
    const found = {
      id: 30,
      sessionId: 7,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      status: 'confirmed',
      createdAt: new Date('2026-07-01T09:00:00Z'),
      session: { id: 7, title: 'Intro to TDD', date: new Date('2026-12-01T09:00:00Z') },
    }
    mockFindUnique.mockResolvedValue(found)

    expect(await findRegistrationWithSession(30)).toEqual(found)
  })

  it('returns null when the registration is absent', async () => {
    mockFindUnique.mockResolvedValue(null)

    expect(await findRegistrationWithSession(999)).toBeNull()
  })
})
