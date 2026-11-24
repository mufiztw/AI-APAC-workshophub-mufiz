import { cancelRegistration, getRegistration } from '../../src/services/registrationService'
import {
  cancelRegistration as repoCancel,
  getRegistration as repoGet,
} from '../../src/repositories/registrationRepository'
import { onRegistrationPromoted } from '../../src/services/waitlistPromotion'
import {
  RegistrationAlreadyCancelledError,
  RegistrationNotFoundError,
  ValidationError,
} from '../../src/errors'

jest.mock('../../src/repositories/registrationRepository', () => ({
  createRegistration: jest.fn(),
  cancelRegistration: jest.fn(),
  getRegistration: jest.fn(),
}))
jest.mock('../../src/services/waitlistPromotion', () => ({
  onRegistrationPromoted: jest.fn(),
}))

const mockRepoCancel = repoCancel as jest.Mock
const mockOnPromoted = onRegistrationPromoted as jest.Mock
const mockRepoGet = repoGet as jest.Mock

afterEach(() => {
  jest.resetAllMocks()
})

describe('cancelRegistration validation', () => {
  it.each([
    ['zero session id', 0, 1],
    ['negative session id', -1, 1],
    ['fractional session id', 1.5, 1],
    ['NaN session id', Number.NaN, 1],
    ['zero registration id', 1, 0],
    ['negative registration id', 1, -3],
    ['fractional registration id', 1, 2.5],
    ['NaN registration id', 1, Number.NaN],
  ])('rejects %s with ValidationError before touching the repository', async (_l, sid, rid) => {
    await expect(cancelRegistration(sid, rid)).rejects.toBeInstanceOf(ValidationError)
    expect(mockRepoCancel).not.toHaveBeenCalled()
    expect(mockOnPromoted).not.toHaveBeenCalled()
  })
})

describe('cancelRegistration', () => {
  it('returns the cancel response with promotedRegistrationId null when nobody was promoted', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 3,
      capacity: 10,
    })

    const result = await cancelRegistration(7, 12)

    expect(mockRepoCancel).toHaveBeenCalledWith(7, 12)
    expect(result).toEqual({
      status: 'cancelled',
      promotedRegistrationId: null,
      registered: 3,
      capacity: 10,
    })
  })

  it('returns the promoted registration id in the response', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({
      status: 'cancelled',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })
  })

  it('calls onRegistrationPromoted once with the session and promoted ids after a promotion', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })

    await cancelRegistration(7, 12)

    expect(mockOnPromoted).toHaveBeenCalledTimes(1)
    expect(mockOnPromoted).toHaveBeenCalledWith(7, 30)
  })

  it('returns the response without waiting for a hand-off that never resolves', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })
    mockOnPromoted.mockReturnValue(new Promise<void>(() => undefined))
    const timedOut = Symbol('timed out')

    const outcome = await Promise.race([
      cancelRegistration(7, 12),
      new Promise<symbol>((resolve) => setTimeout(() => resolve(timedOut), 200)),
    ])

    expect(outcome).not.toBe(timedOut)
    expect(outcome).toEqual({
      status: 'cancelled',
      promotedRegistrationId: 30,
      registered: 10,
      capacity: 10,
    })
    expect(mockOnPromoted).toHaveBeenCalledWith(7, 30)
  })

  it('does not call onRegistrationPromoted when nobody was promoted', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 3,
      capacity: 10,
    })

    await cancelRegistration(7, 12)

    expect(mockOnPromoted).not.toHaveBeenCalled()
  })

  it('does not call onRegistrationPromoted for a waitlisted cancellation', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'waitlisted',
      promotedRegistrationId: null,
      registered: 10,
      capacity: 10,
    })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({
      status: 'cancelled',
      promotedRegistrationId: null,
      registered: 10,
      capacity: 10,
    })
    expect(mockOnPromoted).not.toHaveBeenCalled()
  })

  it('does not expose previousStatus in the response', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      promotedRegistrationId: null,
      registered: 3,
      capacity: 10,
    })

    expect(await cancelRegistration(7, 12)).not.toHaveProperty('previousStatus')
  })

  it('throws RegistrationNotFoundError and skips the hand-off on not_found', async () => {
    mockRepoCancel.mockResolvedValue({ status: 'not_found' })

    await expect(cancelRegistration(7, 12)).rejects.toBeInstanceOf(RegistrationNotFoundError)
    expect(mockOnPromoted).not.toHaveBeenCalled()
  })

  it('throws RegistrationAlreadyCancelledError and skips the hand-off on already_cancelled', async () => {
    mockRepoCancel.mockResolvedValue({ status: 'already_cancelled' })

    await expect(cancelRegistration(7, 12)).rejects.toBeInstanceOf(
      RegistrationAlreadyCancelledError
    )
    expect(mockOnPromoted).not.toHaveBeenCalled()
  })

  it('does not call the hand-off when the repository throws', async () => {
    mockRepoCancel.mockRejectedValue(new Error('db down'))

    await expect(cancelRegistration(7, 12)).rejects.toThrow('db down')
    expect(mockOnPromoted).not.toHaveBeenCalled()
  })
})

describe('getRegistration validation', () => {
  it.each([
    ['zero session id', 0, 1],
    ['negative session id', -1, 1],
    ['fractional session id', 1.5, 1],
    ['NaN session id', Number.NaN, 1],
    ['zero registration id', 1, 0],
    ['negative registration id', 1, -3],
    ['fractional registration id', 1, 2.5],
    ['NaN registration id', 1, Number.NaN],
  ])('rejects %s with ValidationError before touching the repository', async (_l, sid, rid) => {
    await expect(getRegistration(sid, rid)).rejects.toBeInstanceOf(ValidationError)
    expect(mockRepoGet).not.toHaveBeenCalled()
  })
})

describe('getRegistration', () => {
  const row = {
    id: 12,
    sessionId: 7,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    status: 'confirmed',
    createdAt: new Date('2026-07-01T09:00:00Z'),
  }

  it('returns id, sessionId and status for a confirmed registration, without name or email', async () => {
    mockRepoGet.mockResolvedValue({ status: 'found', registration: row })

    const result = await getRegistration(7, 12)

    expect(mockRepoGet).toHaveBeenCalledWith(7, 12)
    expect(result).toEqual({ id: 12, sessionId: 7, status: 'confirmed' })
  })

  it('includes the position for a waitlisted registration', async () => {
    mockRepoGet.mockResolvedValue({
      status: 'found',
      registration: { ...row, status: 'waitlisted' },
      position: 2,
    })

    const result = await getRegistration(7, 12)

    expect(result).toEqual({ id: 12, sessionId: 7, status: 'waitlisted', position: 2 })
  })

  it('throws RegistrationNotFoundError when the repository reports not_found', async () => {
    mockRepoGet.mockResolvedValue({ status: 'not_found' })

    await expect(getRegistration(7, 12)).rejects.toBeInstanceOf(RegistrationNotFoundError)
  })
})

describe('cancellation errors', () => {
  it('RegistrationNotFoundError has the agreed message and name', () => {
    const error = new RegistrationNotFoundError()
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Registration not found')
    expect(error.name).toBe('RegistrationNotFoundError')
  })

  it('RegistrationAlreadyCancelledError has the agreed message and name', () => {
    const error = new RegistrationAlreadyCancelledError()
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Registration is already cancelled')
    expect(error.name).toBe('RegistrationAlreadyCancelledError')
  })
})
