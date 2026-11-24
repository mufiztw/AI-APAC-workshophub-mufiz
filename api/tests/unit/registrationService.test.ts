import { registerForSession } from '../../src/services/registrationService'
import { createRegistration } from '../../src/repositories/registrationRepository'
import { notifyRegistration } from '../../src/services/notificationService'
import { SessionNotFoundError, ValidationError } from '../../src/errors'

jest.mock('../../src/repositories/registrationRepository', () => ({
  createRegistration: jest.fn(),
}))

jest.mock('../../src/services/notificationService', () => ({
  notifyRegistration: jest.fn(),
}))

const mockCreate = createRegistration as jest.Mock
const mockNotify = notifyRegistration as jest.Mock

const created = {
  registration: {
    id: 1,
    sessionId: 7,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    status: 'confirmed',
    createdAt: new Date('2026-07-01T09:00:00Z'),
  },
  registered: 4,
  capacity: 10,
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('registerForSession validation', () => {
  it.each([
    ['undefined body', undefined],
    ['null body', null],
    ['non-object body', 'text'],
    ['empty object', {}],
    ['missing name', { email: 'ada@example.com' }],
    ['missing email', { name: 'Ada' }],
    ['blank name', { name: '   ', email: 'ada@example.com' }],
    ['blank email', { name: 'Ada', email: '  ' }],
    ['non-string name', { name: 42, email: 'ada@example.com' }],
    ['non-string email', { name: 'Ada', email: ['a@b.com'] }],
    ['malformed email', { name: 'Ada', email: 'not-an-email' }],
    ['email with spaces', { name: 'Ada', email: 'a da@example.com' }],
    ['name over 100 characters', { name: 'a'.repeat(101), email: 'ada@example.com' }],
    ['email over 254 characters', { name: 'Ada', email: `${'a'.repeat(250)}@b.com` }],
  ])('rejects %s with ValidationError', async (_label, input) => {
    await expect(registerForSession(7, input)).rejects.toBeInstanceOf(ValidationError)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('registerForSession length boundaries', () => {
  it('accepts a 100 character name and a 254 character email', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created })
    const email = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`
    expect(email).toHaveLength(254)

    await registerForSession(7, { name: 'a'.repeat(100), email })

    expect(mockCreate).toHaveBeenCalledWith(7, { name: 'a'.repeat(100), email })
  })
})

describe('registerForSession maximum length (exact boundaries)', () => {
  const email254 = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`
  const email255 = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`

  it('accepts a name of exactly 100 characters', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created })
    await registerForSession(7, { name: 'a'.repeat(100), email: 'ada@example.com' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('accepts an email of exactly 254 characters', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created })
    expect(email254).toHaveLength(254)
    await registerForSession(7, { name: 'Ada', email: email254 })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('rejects a name of exactly 101 characters with a ValidationError naming the limit', async () => {
    await expect(
      registerForSession(7, { name: 'a'.repeat(101), email: 'ada@example.com' })
    ).rejects.toThrow(/name.*100/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects an email of exactly 255 characters with a ValidationError naming the limit', async () => {
    expect(email255).toHaveLength(255)
    await expect(registerForSession(7, { name: 'Ada', email: email255 })).rejects.toThrow(
      /email.*254/
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('registerForSession', () => {
  it('trims input and delegates to the repository', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created })

    const result = await registerForSession(7, {
      name: '  Ada Lovelace ',
      email: ' ada@example.com ',
    })

    expect(mockCreate).toHaveBeenCalledWith(7, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
    expect(result).toEqual({
      ...created.registration,
      status: 'confirmed',
      registered: 4,
      capacity: 10,
    })
  })

  it('throws SessionNotFoundError when the repository reports not_found', async () => {
    mockCreate.mockResolvedValue({ status: 'not_found' })

    await expect(
      registerForSession(999, { name: 'Ada', email: 'ada@example.com' })
    ).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('returns a waitlisted result with position when the repository waitlists', async () => {
    const waitlistedRegistration = { ...created.registration, id: 9, status: 'waitlisted' }
    mockCreate.mockResolvedValue({
      status: 'waitlisted',
      registration: waitlistedRegistration,
      position: 2,
      registered: 10,
      capacity: 10,
    })

    const result = await registerForSession(7, { name: 'Ada', email: 'ada@example.com' })

    expect(result).toEqual({
      ...waitlistedRegistration,
      status: 'waitlisted',
      position: 2,
      registered: 10,
      capacity: 10,
    })
  })

  it('does not include a position on a confirmed result', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created })

    const result = await registerForSession(7, { name: 'Ada', email: 'ada@example.com' })

    expect(result).not.toHaveProperty('position')
  })

  it('validates input identically before waitlisting', async () => {
    await expect(
      registerForSession(7, { name: '', email: 'ada@example.com' })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('registerForSession notification (LATC-8)', () => {
  const sessionTitle = 'Intro to TDD'
  const sessionDate = new Date('2026-12-01T09:00:00Z')

  it('notifies once with the confirmed registration details and session info', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created, sessionTitle, sessionDate })

    await registerForSession(7, { name: 'Ada Lovelace', email: 'ada@example.com' })

    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      sessionTitle,
      sessionDate,
      status: 'confirmed',
    })
  })

  it('returns the registration unchanged, without sessionTitle or sessionDate', async () => {
    mockCreate.mockResolvedValue({ status: 'created', ...created, sessionTitle, sessionDate })

    const result = await registerForSession(7, { name: 'Ada Lovelace', email: 'ada@example.com' })

    expect(result).toEqual({ ...created.registration, registered: 4, capacity: 10 })
    expect(result).not.toHaveProperty('sessionTitle')
    expect(result).not.toHaveProperty('sessionDate')
  })

  it('does not notify when the registration is waitlisted', async () => {
    mockCreate.mockResolvedValue({
      status: 'waitlisted',
      registration: { ...created.registration, id: 9, status: 'waitlisted' },
      position: 1,
      registered: 10,
      capacity: 10,
    })

    await registerForSession(7, { name: 'Ada', email: 'ada@example.com' })

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('does not notify when the session is not found', async () => {
    mockCreate.mockResolvedValue({ status: 'not_found' })

    await expect(
      registerForSession(999, { name: 'Ada', email: 'ada@example.com' })
    ).rejects.toBeInstanceOf(SessionNotFoundError)

    expect(mockNotify).not.toHaveBeenCalled()
  })
})
