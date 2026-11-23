import { cancelRegistration } from '../../src/services/registrationService'
import { cancelRegistration as repoCancel } from '../../src/repositories/registrationRepository'
import { onSeatFreed } from '../../src/services/waitlistPromotion'
import {
  RegistrationAlreadyCancelledError,
  RegistrationNotFoundError,
  ValidationError,
} from '../../src/errors'

jest.mock('../../src/repositories/registrationRepository', () => ({
  createRegistration: jest.fn(),
  cancelRegistration: jest.fn(),
}))
jest.mock('../../src/services/waitlistPromotion', () => ({
  onSeatFreed: jest.fn(),
}))

const mockRepoCancel = repoCancel as jest.Mock
const mockOnSeatFreed = onSeatFreed as jest.Mock

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
    expect(mockOnSeatFreed).not.toHaveBeenCalled()
  })
})

describe('cancelRegistration', () => {
  it('returns the cancel response for a confirmed registration', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      registered: 3,
      capacity: 10,
    })

    const result = await cancelRegistration(7, 12)

    expect(mockRepoCancel).toHaveBeenCalledWith(7, 12)
    expect(result).toEqual({ status: 'cancelled', registered: 3, capacity: 10 })
  })

  it('calls onSeatFreed once with the session id after a confirmed cancellation', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      registered: 3,
      capacity: 10,
    })

    await cancelRegistration(7, 12)

    expect(mockOnSeatFreed).toHaveBeenCalledTimes(1)
    expect(mockOnSeatFreed).toHaveBeenCalledWith(7)
  })

  it('does not call onSeatFreed for a waitlisted cancellation', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'waitlisted',
      registered: 10,
      capacity: 10,
    })

    const result = await cancelRegistration(7, 12)

    expect(result).toEqual({ status: 'cancelled', registered: 10, capacity: 10 })
    expect(mockOnSeatFreed).not.toHaveBeenCalled()
  })

  it('does not expose previousStatus in the response', async () => {
    mockRepoCancel.mockResolvedValue({
      status: 'cancelled',
      previousStatus: 'confirmed',
      registered: 3,
      capacity: 10,
    })

    expect(await cancelRegistration(7, 12)).not.toHaveProperty('previousStatus')
  })

  it('throws RegistrationNotFoundError and skips onSeatFreed on not_found', async () => {
    mockRepoCancel.mockResolvedValue({ status: 'not_found' })

    await expect(cancelRegistration(7, 12)).rejects.toBeInstanceOf(RegistrationNotFoundError)
    expect(mockOnSeatFreed).not.toHaveBeenCalled()
  })

  it('throws RegistrationAlreadyCancelledError and skips onSeatFreed on already_cancelled', async () => {
    mockRepoCancel.mockResolvedValue({ status: 'already_cancelled' })

    await expect(cancelRegistration(7, 12)).rejects.toBeInstanceOf(
      RegistrationAlreadyCancelledError
    )
    expect(mockOnSeatFreed).not.toHaveBeenCalled()
  })

  it('does not call onSeatFreed when the repository throws', async () => {
    mockRepoCancel.mockRejectedValue(new Error('db down'))

    await expect(cancelRegistration(7, 12)).rejects.toThrow('db down')
    expect(mockOnSeatFreed).not.toHaveBeenCalled()
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
