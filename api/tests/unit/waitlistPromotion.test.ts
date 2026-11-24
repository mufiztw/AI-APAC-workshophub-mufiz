import { Registration, TrainingSession } from '@prisma/client'
import { onRegistrationPromoted } from '../../src/services/waitlistPromotion'
import { findRegistrationWithSession } from '../../src/repositories/registrationRepository'
import { notifyRegistration } from '../../src/services/notificationService'

jest.mock('../../src/repositories/registrationRepository', () => ({
  findRegistrationWithSession: jest.fn(),
}))
jest.mock('../../src/services/notificationService', () => ({
  notifyRegistration: jest.fn(),
}))

const mockFind = findRegistrationWithSession as jest.Mock
const mockNotify = notifyRegistration as jest.Mock

const sessionDate = new Date('2026-12-01T09:00:00.000Z')

function row(
  overrides: Partial<Registration> = {}
): Registration & { session: Pick<TrainingSession, 'id' | 'title' | 'date'> } {
  return {
    id: 30,
    sessionId: 7,
    name: 'Grace Hopper',
    email: 'grace@example.com',
    status: 'confirmed',
    createdAt: new Date('2026-07-01T09:00:00Z'),
    session: { id: 7, title: 'Intro to TDD', date: sessionDate },
    ...overrides,
  }
}

afterEach(() => {
  jest.resetAllMocks()
})

describe('onRegistrationPromoted', () => {
  it('loads the promoted registration by id', async () => {
    mockFind.mockResolvedValue(row())

    await onRegistrationPromoted(7, 30)

    expect(mockFind).toHaveBeenCalledWith(30)
  })

  it('sends one promoted notification with the registrant and session details', async () => {
    mockFind.mockResolvedValue(row())

    await onRegistrationPromoted(7, 30)

    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      sessionTitle: 'Intro to TDD',
      sessionDate,
      status: 'promoted',
    })
  })

  it('sends nothing when the registration is not found', async () => {
    mockFind.mockResolvedValue(null)

    await onRegistrationPromoted(7, 30)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('sends nothing when the registration belongs to a different session', async () => {
    mockFind.mockResolvedValue(row({ sessionId: 8 }))

    await onRegistrationPromoted(7, 30)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it.each(['waitlisted', 'cancelled'])('sends nothing when the status is %s', async (status) => {
    mockFind.mockResolvedValue(row({ status }))

    await onRegistrationPromoted(7, 30)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('resolves when the repository rejects, without notifying', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFind.mockRejectedValue(new Error('db down'))

    await expect(onRegistrationPromoted(7, 30)).resolves.toBeUndefined()

    expect(mockNotify).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('resolves when the notifier throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFind.mockResolvedValue(row())
    mockNotify.mockImplementation(() => {
      throw new Error('notifier broke')
    })

    await expect(onRegistrationPromoted(7, 30)).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })
})
