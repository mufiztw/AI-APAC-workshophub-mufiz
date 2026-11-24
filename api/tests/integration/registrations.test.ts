import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/lib/prisma'

const createdSessionIds: number[] = []

async function createSession(
  capacity: number,
  registered = 0,
  registrationDeadline: Date | null = null
): Promise<number> {
  const session = await prisma.trainingSession.create({
    data: {
      title: 'LATC-2 test session',
      description: 'Created by registrations integration tests',
      date: new Date('2030-01-01T09:00:00Z'),
      capacity,
      registered,
      registrationDeadline,
      location: 'Test room',
      deliveryMode: 'online',
    },
  })
  createdSessionIds.push(session.id)
  return session.id
}

const validBody = { name: 'Ada Lovelace', email: 'ada@example.com' }

function post(id: number | string, body: unknown) {
  return request(app)
    .post(`/api/training-sessions/${id}/registrations`)
    .send(body as object)
}

async function getRegistered(id: number): Promise<number> {
  const response = await request(app).get(`/api/training-sessions/${id}`)
  return response.body.registered
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { registration: { sessionId: { in: createdSessionIds } } },
  })
  await prisma.registration.deleteMany({ where: { sessionId: { in: createdSessionIds } } })
  await prisma.trainingSession.deleteMany({ where: { id: { in: createdSessionIds } } })
  await prisma.$disconnect()
})

describe('POST /api/training-sessions/:id/registrations', () => {
  it('returns 201 with registration details and increments registered', async () => {
    const id = await createSession(5)

    const response = await post(id, validBody)

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      sessionId: id,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      registered: 1,
      capacity: 5,
    })
    expect(response.body.id).toEqual(expect.any(Number))
    expect(response.body.createdAt).toEqual(expect.any(String))
    expect(await getRegistered(id)).toBe(1)
  })

  it('returns 400 for an empty body', async () => {
    const id = await createSession(5)
    const response = await post(id, {})
    expect(response.status).toBe(400)
    expect(await getRegistered(id)).toBe(0)
  })

  it('returns 400 when name is missing', async () => {
    const id = await createSession(5)
    const response = await post(id, { email: 'ada@example.com' })
    expect(response.status).toBe(400)
  })

  it('returns 400 when email is missing', async () => {
    const id = await createSession(5)
    const response = await post(id, { name: 'Ada' })
    expect(response.status).toBe(400)
  })

  it('returns 400 and does not register when name or email is too long', async () => {
    const id = await createSession(5)
    const longName = await post(id, { name: 'a'.repeat(101), email: 'ada@example.com' })
    const longEmail = await post(id, { name: 'Ada', email: `${'a'.repeat(250)}@b.com` })
    expect(longName.status).toBe(400)
    expect(longEmail.status).toBe(400)
    expect(await getRegistered(id)).toBe(0)
  })

  describe('maximum length validation', () => {
    const email254 = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`
    const email255 = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`

    it('accepts a name of exactly 100 characters', async () => {
      const id = await createSession(5)
      const response = await post(id, { name: 'a'.repeat(100), email: 'ada@example.com' })
      expect(response.status).toBe(201)
      expect(response.body.name).toBe('a'.repeat(100))
      expect(await getRegistered(id)).toBe(1)
    })

    it('accepts an email of exactly 254 characters', async () => {
      const id = await createSession(5)
      const response = await post(id, { name: 'Ada', email: email254 })
      expect(response.status).toBe(201)
      expect(response.body.email).toBe(email254)
      expect(await getRegistered(id)).toBe(1)
    })

    it('returns 400 with an error body for a name of 101 characters', async () => {
      const id = await createSession(5)
      const response = await post(id, { name: 'a'.repeat(101), email: 'ada@example.com' })
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: expect.stringMatching(/name.*100/) })
    })

    it('returns 400 with an error body for an email of 255 characters', async () => {
      const id = await createSession(5)
      const response = await post(id, { name: 'Ada', email: email255 })
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: expect.stringMatching(/email.*254/) })
    })

    it('creates no registration and consumes no seat when input is oversized', async () => {
      const id = await createSession(1)
      const longName = await post(id, { name: 'a'.repeat(101), email: 'ada@example.com' })
      const longEmail = await post(id, { name: 'Ada', email: email255 })
      expect(longName.status).toBe(400)
      expect(longEmail.status).toBe(400)
      expect(await getRegistered(id)).toBe(0)
      expect(await prisma.registration.count({ where: { sessionId: id } })).toBe(0)

      const valid = await post(id, validBody)
      expect(valid.status).toBe(201)
    })
  })

  it('returns 400 for a non-numeric session id', async () => {
    const response = await post('not-a-number', validBody)
    expect(response.status).toBe(400)
  })

  it('returns 404 when the session does not exist', async () => {
    const response = await post(999999, validBody)
    expect(response.status).toBe(404)
  })

  it('returns 201 with status confirmed and stores a confirmed row when a seat is free', async () => {
    const id = await createSession(5)

    const response = await post(id, validBody)

    expect(response.status).toBe(201)
    expect(response.body.status).toBe('confirmed')
    expect(response.body.position).toBeUndefined()
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: response.body.id } })
    expect(row.status).toBe('confirmed')
  })

  describe('waitlist when the session is full', () => {
    it('returns 202 with status waitlisted and position 1', async () => {
      const id = await createSession(2, 2)

      const response = await post(id, validBody)

      expect(response.status).toBe(202)
      expect(response.body).toMatchObject({
        sessionId: id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'waitlisted',
        position: 1,
        registered: 2,
        capacity: 2,
      })
      expect(response.body.id).toEqual(expect.any(Number))
      expect(response.body.createdAt).toEqual(expect.any(String))
    })

    it('never returns 409 for a full session', async () => {
      const id = await createSession(1, 1)
      const response = await post(id, validBody)
      expect(response.status).not.toBe(409)
    })

    it('gives the second waitlisted join position 2', async () => {
      const id = await createSession(2, 2)

      const first = await post(id, validBody)
      const second = await post(id, { name: 'Grace Hopper', email: 'grace@example.com' })

      expect(first.body.position).toBe(1)
      expect(second.status).toBe(202)
      expect(second.body.position).toBe(2)
    })

    it('leaves registered unchanged and stores a waitlisted row', async () => {
      const id = await createSession(2, 2)

      const response = await post(id, validBody)

      expect(await getRegistered(id)).toBe(2)
      const row = await prisma.registration.findUniqueOrThrow({ where: { id: response.body.id } })
      expect(row.status).toBe('waitlisted')
      expect(row.sessionId).toBe(id)
    })

    it('computes positions per session', async () => {
      const a = await createSession(1, 1)
      const b = await createSession(1, 1)

      await post(a, validBody)
      const firstOfB = await post(b, validBody)

      expect(firstOfB.body.position).toBe(1)
    })

    it('creates no waitlist row for invalid input on a full session', async () => {
      const id = await createSession(1, 1)

      const response = await post(id, { name: '', email: 'bad' })

      expect(response.status).toBe(400)
      expect(await prisma.registration.count({ where: { sessionId: id } })).toBe(0)
    })

    it('returns 404 and creates no row for a missing session', async () => {
      const before = await prisma.registration.count()
      const response = await post(999999, validBody)
      expect(response.status).toBe(404)
      expect(await prisma.registration.count()).toBe(before)
    })
  })

  it('confirms the last seat then waitlists the next registration', async () => {
    const id = await createSession(2, 1)

    const last = await post(id, validBody)
    expect(last.status).toBe(201)
    expect(last.body.status).toBe('confirmed')
    expect(last.body.registered).toBe(2)

    const over = await post(id, validBody)
    expect(over.status).toBe(202)
    expect(over.body.status).toBe('waitlisted')
    expect(over.body.position).toBe(1)
    expect(await getRegistered(id)).toBe(2)
  })

  it('never overbooks and assigns distinct waitlist positions under concurrent requests', async () => {
    const id = await createSession(3)

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(id, { name: `User ${i}`, email: `user${i}@example.com` })
      )
    )

    const confirmed = responses.filter((r) => r.status === 201)
    const waitlisted = responses.filter((r) => r.status === 202)
    expect(confirmed).toHaveLength(3)
    expect(waitlisted).toHaveLength(7)
    const positions = waitlisted.map((r) => r.body.position as number).sort((x, y) => x - y)
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(await getRegistered(id)).toBe(3)
    expect(await prisma.registration.count({ where: { sessionId: id, status: 'confirmed' } })).toBe(
      3
    )
    expect(
      await prisma.registration.count({ where: { sessionId: id, status: 'waitlisted' } })
    ).toBe(7)
  })
})

function del(id: number | string, registrationId: number | string) {
  return request(app).delete(`/api/training-sessions/${id}/registrations/${registrationId}`)
}

describe('DELETE /api/training-sessions/:id/registrations/:registrationId', () => {
  it('cancels a confirmed registration, returns the new figures and frees a seat', async () => {
    const id = await createSession(5)
    const created = await post(id, validBody)
    expect(await getRegistered(id)).toBe(1)

    const response = await del(id, created.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'cancelled',
      promotedRegistrationId: null,
      registered: 0,
      capacity: 5,
    })
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(row.status).toBe('cancelled')
    expect(await getRegistered(id)).toBe(0)
  })

  it('returns 404 Registration not found for an unknown registration id', async () => {
    const id = await createSession(5, 2)

    const response = await del(id, 999999)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Registration not found' })
    expect(await getRegistered(id)).toBe(2)
  })

  it('returns 404 and changes nothing for a registration of a different session', async () => {
    const a = await createSession(5)
    const b = await createSession(5)
    const created = await post(a, validBody)

    const response = await del(b, created.body.id)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Registration not found' })
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(row.status).toBe('confirmed')
    expect(await getRegistered(a)).toBe(1)
    expect(await getRegistered(b)).toBe(0)
  })

  it('returns 400 for a non-numeric session id', async () => {
    const response = await del('abc', 1)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid session ID' })
  })

  it('returns 400 for a non-numeric registration id', async () => {
    const id = await createSession(5)
    const response = await del(id, 'abc')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid registration ID' })
  })

  it('returns 409 on a second cancel and does not release a second seat', async () => {
    const id = await createSession(5)
    const first = await post(id, validBody)
    await post(id, { name: 'Grace Hopper', email: 'grace@example.com' })
    expect(await getRegistered(id)).toBe(2)

    const one = await del(id, first.body.id)
    const two = await del(id, first.body.id)

    expect(one.status).toBe(200)
    expect(two.status).toBe(409)
    expect(two.body).toEqual({ error: 'Registration is already cancelled' })
    expect(await getRegistered(id)).toBe(1)
  })

  it('cancels a waitlisted registration without changing registered', async () => {
    const id = await createSession(1, 1)
    const waitlisted = await post(id, validBody)
    expect(waitlisted.status).toBe(202)

    const response = await del(id, waitlisted.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'cancelled',
      promotedRegistrationId: null,
      registered: 1,
      capacity: 1,
    })
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: waitlisted.body.id } })
    expect(row.status).toBe('cancelled')
    expect(await getRegistered(id)).toBe(1)
  })

  it('moves later waitlist positions up after a waitlisted cancellation', async () => {
    const id = await createSession(1, 1)
    const first = await post(id, validBody)
    const second = await post(id, { name: 'Grace Hopper', email: 'grace@example.com' })
    expect(first.body.position).toBe(1)
    expect(second.body.position).toBe(2)

    await del(id, first.body.id)
    const third = await post(id, { name: 'Alan Turing', email: 'alan@example.com' })

    expect(third.status).toBe(202)
    expect(third.body.position).toBe(2)
  })

  it('confirms a new registration after a confirmed cancellation when nobody is waiting', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    expect(holder.status).toBe(201)

    const cancelled = await del(id, holder.body.id)
    expect(cancelled.status).toBe(200)
    const next = await post(id, { name: 'Alan Turing', email: 'alan@example.com' })

    expect(next.status).toBe(201)
    expect(next.body.status).toBe('confirmed')
  })

  it('releases exactly one seat when the same registration is cancelled concurrently', async () => {
    const id = await createSession(5)
    const first = await post(id, validBody)
    await post(id, { name: 'Grace Hopper', email: 'grace@example.com' })
    expect(await getRegistered(id)).toBe(2)

    const responses = await Promise.all(Array.from({ length: 8 }, () => del(id, first.body.id)))

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1)
    expect(responses.filter((r) => r.status === 409)).toHaveLength(7)
    expect(await getRegistered(id)).toBe(1)
  })

  it('never lets registered drop below zero', async () => {
    const id = await createSession(5)
    const only = await post(id, validBody)

    await Promise.all(Array.from({ length: 5 }, () => del(id, only.body.id)))

    expect(await getRegistered(id)).toBe(0)
  })
})

function get(id: number | string, registrationId: number | string) {
  return request(app).get(`/api/training-sessions/${id}/registrations/${registrationId}`)
}

const grace = { name: 'Grace Hopper', email: 'grace@example.com' }
const alan = { name: 'Alan Turing', email: 'alan@example.com' }
const edsger = { name: 'Edsger Dijkstra', email: 'edsger@example.com' }

describe('promotion of the first waitlisted registration on cancellation', () => {
  it('promotes the earliest waitlisted registration and leaves registered unchanged', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    const first = await post(id, grace)
    const second = await post(id, alan)
    expect(first.status).toBe(202)
    expect(second.status).toBe(202)

    const response = await del(id, holder.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'cancelled',
      promotedRegistrationId: first.body.id,
      registered: 1,
      capacity: 1,
    })
    const promoted = await prisma.registration.findUniqueOrThrow({ where: { id: first.body.id } })
    const stillWaiting = await prisma.registration.findUniqueOrThrow({
      where: { id: second.body.id },
    })
    expect(promoted.status).toBe('confirmed')
    expect(stillWaiting.status).toBe('waitlisted')
    expect(await getRegistered(id)).toBe(1)
  })

  it('returns null and drops registered by one when the waitlist is empty', async () => {
    const id = await createSession(3)
    const holder = await post(id, validBody)
    await post(id, grace)

    const response = await del(id, holder.body.id)

    expect(response.status).toBe(200)
    expect(response.body.promotedRegistrationId).toBeNull()
    expect(response.body.registered).toBe(1)
    expect(await getRegistered(id)).toBe(1)
  })

  it('promotes nobody and leaves registered unchanged when a waitlisted registration is cancelled', async () => {
    const id = await createSession(1)
    await post(id, validBody)
    const first = await post(id, grace)
    const second = await post(id, alan)

    const response = await del(id, first.body.id)

    expect(response.status).toBe(200)
    expect(response.body.promotedRegistrationId).toBeNull()
    const other = await prisma.registration.findUniqueOrThrow({ where: { id: second.body.id } })
    expect(other.status).toBe('waitlisted')
    expect(await getRegistered(id)).toBe(1)
  })

  it('moves later waitlist positions up after a promotion', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    await post(id, grace)
    await post(id, alan)

    await del(id, holder.body.id)
    const next = await post(id, edsger)

    expect(next.status).toBe(202)
    expect(next.body.position).toBe(2)
  })

  it('skips a cancelled waitlisted registration when promoting', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    const first = await post(id, grace)
    const second = await post(id, alan)
    await del(id, first.body.id)

    const response = await del(id, holder.body.id)

    expect(response.body.promotedRegistrationId).toBe(second.body.id)
    const row = await prisma.registration.findUniqueOrThrow({ where: { id: first.body.id } })
    expect(row.status).toBe('cancelled')
  })

  it('waitlists a brand-new registration on the full session after a promotion', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    await post(id, grace)
    await del(id, holder.body.id)

    const newcomer = await post(id, alan)

    expect(newcomer.status).toBe(202)
    expect(newcomer.body.status).toBe('waitlisted')
    expect(await getRegistered(id)).toBe(1)
  })

  it('promotes different people, none twice, and never exceeds capacity under concurrent cancellations', async () => {
    const id = await createSession(4)
    const holders = await Promise.all(
      Array.from({ length: 4 }, (_, i) => post(id, { name: `H ${i}`, email: `h${i}@example.com` }))
    )
    const waiting = []
    for (let i = 0; i < 6; i += 1) {
      waiting.push(await post(id, { name: `W ${i}`, email: `w${i}@example.com` }))
    }
    expect(waiting.every((w) => w.status === 202)).toBe(true)

    const responses = await Promise.all(holders.map((h) => del(id, h.body.id)))

    expect(responses.every((r) => r.status === 200)).toBe(true)
    const promotedIds = responses.map((r) => r.body.promotedRegistrationId as number)
    expect(promotedIds.every((p) => typeof p === 'number')).toBe(true)
    expect(new Set(promotedIds).size).toBe(4)
    expect([...promotedIds].sort((a, b) => a - b)).toEqual(
      waiting.slice(0, 4).map((w) => w.body.id as number)
    )
    for (const r of responses) {
      expect(r.body.registered).toBeLessThanOrEqual(r.body.capacity)
    }
    expect(await getRegistered(id)).toBe(4)
    expect(await prisma.registration.count({ where: { sessionId: id, status: 'confirmed' } })).toBe(
      4
    )
    expect(
      await prisma.registration.count({ where: { sessionId: id, status: 'waitlisted' } })
    ).toBe(2)
  })
})

describe('GET /api/training-sessions/:id/registrations/:registrationId', () => {
  it('returns 200 with id, sessionId and confirmed status, and no name or email', async () => {
    const id = await createSession(5)
    const created = await post(id, validBody)

    const response = await get(id, created.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: created.body.id, sessionId: id, status: 'confirmed' })
    expect(response.body).not.toHaveProperty('name')
    expect(response.body).not.toHaveProperty('email')
  })

  it('returns waitlisted with its position', async () => {
    const id = await createSession(1)
    await post(id, validBody)
    await post(id, grace)
    const third = await post(id, alan)

    const response = await get(id, third.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: third.body.id,
      sessionId: id,
      status: 'waitlisted',
      position: 2,
    })
  })

  it('returns cancelled status without a position', async () => {
    const id = await createSession(5)
    const created = await post(id, validBody)
    await del(id, created.body.id)

    const response = await get(id, created.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: created.body.id, sessionId: id, status: 'cancelled' })
  })

  it('shows confirmed after the registration was promoted', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    const waiting = await post(id, grace)
    await del(id, holder.body.id)

    const response = await get(id, waiting.body.id)

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('confirmed')
    expect(response.body).not.toHaveProperty('position')
  })

  it('returns 404 Registration not found for an unknown registration id', async () => {
    const id = await createSession(5)
    const response = await get(id, 999999)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Registration not found' })
  })

  it('returns 404 for a registration that belongs to another session', async () => {
    const a = await createSession(5)
    const b = await createSession(5)
    const created = await post(a, validBody)

    const response = await get(b, created.body.id)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Registration not found' })
  })

  it('returns 400 for a malformed session id', async () => {
    const response = await get('abc', 1)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid session ID' })
  })

  it('returns 400 for a malformed registration id', async () => {
    const id = await createSession(5)
    const response = await get(id, 'abc')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid registration ID' })
  })
})

describe('notifications (LATC-8)', () => {
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  // The notification is fire-and-forget, so the line may be logged just after the response.
  async function loggedLines(predicate: (line: string) => boolean): Promise<string[]> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const lines = (logSpy.mock.calls as unknown[][])
        .map((call) => String(call[0]))
        .filter(predicate)
      if (lines.length > 0) return lines
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    return []
  }

  it('still returns 201 with the usual body when the notifier fails', async () => {
    const id = await createSession(5)
    logSpy.mockImplementation(() => {
      throw new Error('console broke')
    })

    const response = await post(id, validBody)

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      sessionId: id,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      registered: 1,
      capacity: 5,
    })
    expect(await getRegistered(id)).toBe(1)
  })

  it('logs a promoted notification and returns the unchanged body when a cancel promotes', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    const waiting = await post(id, grace)
    expect(waiting.status).toBe(202)

    const response = await del(id, holder.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'cancelled',
      promotedRegistrationId: waiting.body.id,
      registered: 1,
      capacity: 1,
    })
    const lines = await loggedLines((line) => line.includes('promoted'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Grace Hopper')
    expect(lines[0]).toContain('grace@example.com')
    expect(lines[0]).toContain('LATC-2 test session')
    expect(lines[0]).toContain('2030-01-01T09:00:00.000Z')
  })

  it('still returns the unchanged 200 body when the notifier fails during promotion', async () => {
    const id = await createSession(1)
    const holder = await post(id, validBody)
    const waiting = await post(id, grace)
    logSpy.mockImplementation(() => {
      throw new Error('console broke')
    })

    const response = await del(id, holder.body.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'cancelled',
      promotedRegistrationId: waiting.body.id,
      registered: 1,
      capacity: 1,
    })
  })
})

describe('registration deadline', () => {
  const HOUR_MS = 60 * 60 * 1000

  it('returns 201 before the deadline', async () => {
    const id = await createSession(5, 0, new Date(Date.now() + HOUR_MS))
    const response = await post(id, validBody)
    expect(response.status).toBe(201)
  })

  it('returns 422 after the deadline and changes nothing', async () => {
    const id = await createSession(5, 0, new Date(Date.now() - HOUR_MS))

    const response = await post(id, validBody)

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'Registration deadline has passed' })
    expect(await getRegistered(id)).toBe(0)
    expect(await prisma.registration.count({ where: { sessionId: id } })).toBe(0)
  })

  it('returns 201 when the session has no deadline', async () => {
    const id = await createSession(5)
    const response = await post(id, validBody)
    expect(response.status).toBe(201)
  })

  it('returns 422, not 202, for a full session past its deadline', async () => {
    const id = await createSession(1, 1, new Date(Date.now() - HOUR_MS))

    const response = await post(id, validBody)

    expect(response.status).toBe(422)
    expect(await prisma.registration.count({ where: { sessionId: id } })).toBe(0)
  })

  it('returns 400 for an invalid body on a closed session', async () => {
    const id = await createSession(5, 0, new Date(Date.now() - HOUR_MS))
    const response = await post(id, {})
    expect(response.status).toBe(400)
  })

  it('exposes registrationDeadline as an ISO string or null in the listing', async () => {
    const deadline = new Date(Date.now() + HOUR_MS)
    const withDeadline = await createSession(5, 0, deadline)
    const withoutDeadline = await createSession(5)

    const response = await request(app).get('/api/training-sessions')

    const byId = new Map<number, { registrationDeadline: string | null }>(
      response.body.map((s: { id: number; registrationDeadline: string | null }) => [s.id, s])
    )
    expect(byId.get(withDeadline)?.registrationDeadline).toBe(deadline.toISOString())
    expect(byId.get(withoutDeadline)?.registrationDeadline).toBeNull()
  })
})
