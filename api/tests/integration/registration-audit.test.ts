import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/lib/prisma'

const createdSessionIds: number[] = []

async function createSession(
  capacity: number,
  registrationDeadline: Date | null = null
): Promise<number> {
  const session = await prisma.trainingSession.create({
    data: {
      title: 'LATC-9 test session',
      description: 'Created by audit integration tests',
      date: new Date('2030-01-01T09:00:00Z'),
      capacity,
      registered: 0,
      registrationDeadline,
      location: 'Test room',
      deliveryMode: 'online',
    },
  })
  createdSessionIds.push(session.id)
  return session.id
}

async function register(sessionId: number, name: string): Promise<number> {
  const res = await request(app)
    .post(`/api/training-sessions/${sessionId}/registrations`)
    .send({ name, email: `${name.toLowerCase()}@example.com` })
  return res.body.id
}

function audit(sessionId: number | string, registrationId: number | string) {
  return request(app).get(
    `/api/training-sessions/${sessionId}/registrations/${registrationId}/audit`
  )
}

function transitions(body: Array<{ fromStatus: string | null; toStatus: string }>) {
  return body.map((e) => `${e.fromStatus}->${e.toStatus}`)
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { registration: { sessionId: { in: createdSessionIds } } },
  })
  await prisma.registration.deleteMany({ where: { sessionId: { in: createdSessionIds } } })
  await prisma.trainingSession.deleteMany({ where: { id: { in: createdSessionIds } } })
  await prisma.$disconnect()
})

describe('GET /api/training-sessions/:id/registrations/:registrationId/audit', () => {
  it('records null -> confirmed on registration', async () => {
    const sid = await createSession(2)
    const rid = await register(sid, 'Ada')

    const res = await audit(sid, rid)

    expect(res.status).toBe(200)
    expect(transitions(res.body)).toEqual(['null->confirmed'])
    expect(res.body[0]).toEqual({
      id: expect.any(Number),
      registrationId: rid,
      fromStatus: null,
      toStatus: 'confirmed',
      changedAt: expect.any(String),
      reason: 'registered',
    })
  })

  it('records null -> waitlisted when full', async () => {
    const sid = await createSession(1)
    await register(sid, 'Ada')
    const rid = await register(sid, 'Bob')

    const res = await audit(sid, rid)

    expect(transitions(res.body)).toEqual(['null->waitlisted'])
    expect(res.body[0].reason).toBe('waitlisted')
  })

  it('records cancel and promotion entries when a confirmed registration is cancelled', async () => {
    const sid = await createSession(1)
    const first = await register(sid, 'Ada')
    const second = await register(sid, 'Bob')

    await request(app).delete(`/api/training-sessions/${sid}/registrations/${first}`)

    const a = await audit(sid, first)
    const b = await audit(sid, second)
    expect(transitions(a.body)).toEqual(['null->confirmed', 'confirmed->cancelled'])
    expect(transitions(b.body)).toEqual(['null->waitlisted', 'waitlisted->confirmed'])
    expect(b.body[1].reason).toBe('promoted')
    expect(a.body[1].reason).toBe('cancelled')
  })

  it('records waitlisted -> cancelled for a waitlisted registration', async () => {
    const sid = await createSession(1)
    await register(sid, 'Ada')
    const rid = await register(sid, 'Bob')

    await request(app).delete(`/api/training-sessions/${sid}/registrations/${rid}`)

    const res = await audit(sid, rid)
    expect(transitions(res.body)).toEqual(['null->waitlisted', 'waitlisted->cancelled'])
  })

  it('returns entries in chronological order and unchanged between reads', async () => {
    const sid = await createSession(2)
    const rid = await register(sid, 'Ada')
    await request(app).delete(`/api/training-sessions/${sid}/registrations/${rid}`)

    const one = await audit(sid, rid)
    const two = await audit(sid, rid)

    const times = one.body.map((e: { changedAt: string }) => Date.parse(e.changedAt))
    expect(times).toEqual([...times].sort((x, y) => x - y))
    expect(two.body).toEqual(one.body)
  })

  it('returns 200 with [] for a registration without history', async () => {
    const sid = await createSession(2)
    const created = await prisma.registration.create({
      data: { sessionId: sid, name: 'Old', email: 'old@example.com', status: 'confirmed' },
    })

    const res = await audit(sid, created.id)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 404 for an unknown registration', async () => {
    const sid = await createSession(2)
    const res = await audit(sid, 99999999)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the registration belongs to another session', async () => {
    const sid = await createSession(2)
    const other = await createSession(2)
    const rid = await register(sid, 'Ada')

    const res = await audit(other, rid)

    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid ids', async () => {
    expect((await audit('abc', 1)).status).toBe(400)
    expect((await audit(1, 'abc')).status).toBe(400)
    expect((await audit(0, 1)).status).toBe(400)
    expect((await audit(1, 0)).status).toBe(400)
  })

  it('writes no audit rows for a rejected late registration', async () => {
    const sid = await createSession(2, new Date(Date.now() - 60_000))

    const res = await request(app)
      .post(`/api/training-sessions/${sid}/registrations`)
      .send({ name: 'Late', email: 'late@example.com' })

    expect(res.status).toBe(422)
    const count = await prisma.auditLog.count({ where: { registration: { sessionId: sid } } })
    expect(count).toBe(0)
  })

  it('exposes no write methods for audit', async () => {
    const sid = await createSession(2)
    const rid = await register(sid, 'Ada')
    const url = `/api/training-sessions/${sid}/registrations/${rid}/audit`
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await request(app)[method](url)
      expect([404, 405]).toContain(res.status)
    }
  })
})
