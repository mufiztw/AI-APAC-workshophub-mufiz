import { getSessionRegistrations } from '../../src/services/registrationService'
import { listSessionRegistrations } from '../../src/repositories/registrationRepository'
import { SessionNotFoundError, ValidationError } from '../../src/errors'

jest.mock('../../src/repositories/registrationRepository', () => ({
  createRegistration: jest.fn(),
  cancelRegistration: jest.fn(),
  getRegistration: jest.fn(),
  listSessionRegistrations: jest.fn(),
}))
jest.mock('../../src/services/waitlistPromotion', () => ({
  onRegistrationPromoted: jest.fn(),
}))

const mockList = listSessionRegistrations as jest.Mock

afterEach(() => {
  jest.resetAllMocks()
})

function row(id: number, status: 'confirmed' | 'waitlisted', minute: number) {
  return {
    id,
    sessionId: 7,
    name: `Person ${id}`,
    email: `p${id}@example.com`,
    status,
    createdAt: new Date(Date.UTC(2026, 6, 1, 9, minute)),
    updatedAt: new Date(),
  }
}

describe('getSessionRegistrations validation', () => {
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ])(
    'rejects %s session id with ValidationError before touching the repository',
    async (_l, id) => {
      await expect(getSessionRegistrations(id)).rejects.toBeInstanceOf(ValidationError)
      expect(mockList).not.toHaveBeenCalled()
    }
  )
})

describe('getSessionRegistrations', () => {
  it('throws SessionNotFoundError when the repository returns not_found', async () => {
    mockList.mockResolvedValue({ status: 'not_found' })

    await expect(getSessionRegistrations(99)).rejects.toBeInstanceOf(SessionNotFoundError)
    expect(mockList).toHaveBeenCalledWith(99)
  })

  it('groups registrations into confirmed and waitlisted keeping repository order', async () => {
    mockList.mockResolvedValue({
      status: 'found',
      registrations: [
        row(1, 'confirmed', 0),
        row(2, 'waitlisted', 1),
        row(3, 'confirmed', 2),
        row(4, 'waitlisted', 3),
      ],
    })

    const result = await getSessionRegistrations(7)

    expect(result.confirmed.map((r) => r.id)).toEqual([1, 3])
    expect(result.waitlisted.map((r) => r.id)).toEqual([2, 4])
  })

  it('maps each entry to only id, name, email, status and createdAt', async () => {
    const r = row(1, 'confirmed', 0)
    mockList.mockResolvedValue({ status: 'found', registrations: [r] })

    const result = await getSessionRegistrations(7)

    expect(result.confirmed[0]).toEqual({
      id: 1,
      name: 'Person 1',
      email: 'p1@example.com',
      status: 'confirmed',
      createdAt: r.createdAt,
    })
    expect(result.confirmed[0]).not.toHaveProperty('sessionId')
  })

  it('returns empty arrays when the session has no active registrations', async () => {
    mockList.mockResolvedValue({ status: 'found', registrations: [] })

    await expect(getSessionRegistrations(7)).resolves.toEqual({ confirmed: [], waitlisted: [] })
  })
})
