import { getRegistrationAudit } from '../../src/services/registrationService'
import { listRegistrationAudit } from '../../src/repositories/registrationRepository'
import { RegistrationNotFoundError, ValidationError } from '../../src/errors'

jest.mock('../../src/repositories/registrationRepository', () => ({
  createRegistration: jest.fn(),
  cancelRegistration: jest.fn(),
  getRegistration: jest.fn(),
  listSessionRegistrations: jest.fn(),
  listRegistrationAudit: jest.fn(),
}))
jest.mock('../../src/services/waitlistPromotion', () => ({
  onRegistrationPromoted: jest.fn(),
}))

const mockList = listRegistrationAudit as jest.Mock

afterEach(() => {
  jest.resetAllMocks()
})

describe('getRegistrationAudit validation', () => {
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ])('rejects %s session id', async (_l, id) => {
    await expect(getRegistrationAudit(id, 1)).rejects.toThrow(
      new ValidationError('session id must be a positive whole number')
    )
    expect(mockList).not.toHaveBeenCalled()
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('rejects %s registration id', async (_l, id) => {
    await expect(getRegistrationAudit(1, id)).rejects.toThrow(
      new ValidationError('registration id must be a positive whole number')
    )
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('getRegistrationAudit', () => {
  it('throws RegistrationNotFoundError on not_found', async () => {
    mockList.mockResolvedValue({ status: 'not_found' })
    await expect(getRegistrationAudit(7, 12)).rejects.toBeInstanceOf(RegistrationNotFoundError)
  })

  it('maps rows to audit entries', async () => {
    const changedAt = new Date('2026-07-01T09:00:00Z')
    mockList.mockResolvedValue({
      status: 'found',
      entries: [
        {
          id: 1,
          registrationId: 12,
          fromStatus: null,
          toStatus: 'confirmed',
          changedAt,
          reason: 'registered',
        },
      ],
    })

    const result = await getRegistrationAudit(7, 12)

    expect(result).toEqual([
      {
        id: 1,
        registrationId: 12,
        fromStatus: null,
        toStatus: 'confirmed',
        changedAt,
        reason: 'registered',
      },
    ])
  })

  it('returns an empty array when there is no history', async () => {
    mockList.mockResolvedValue({ status: 'found', entries: [] })
    await expect(getRegistrationAudit(7, 12)).resolves.toEqual([])
  })
})
