import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/lib/prisma'

const createdSessionIds: number[] = []

async function createSession(capacity: number, registered = 0): Promise<number> {
  const session = await prisma.trainingSession.create({
    data: {
      title: 'LATC-2 test session',
      description: 'Created by registrations integration tests',
      date: new Date('2030-01-01T09:00:00Z'),
      capacity,
      registered,
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

  it('returns 400 for a non-numeric session id', async () => {
    const response = await post('not-a-number', validBody)
    expect(response.status).toBe(400)
  })

  it('returns 404 when the session does not exist', async () => {
    const response = await post(999999, validBody)
    expect(response.status).toBe(404)
  })

  it('returns 409 when the session is full', async () => {
    const id = await createSession(2, 2)
    const response = await post(id, validBody)
    expect(response.status).toBe(409)
    expect(await getRegistered(id)).toBe(2)
  })

  it('allows the last seat then rejects the next registration', async () => {
    const id = await createSession(2, 1)

    const last = await post(id, validBody)
    expect(last.status).toBe(201)
    expect(last.body.registered).toBe(2)

    const over = await post(id, validBody)
    expect(over.status).toBe(409)
    expect(await getRegistered(id)).toBe(2)
  })

  it('never overbooks under concurrent requests', async () => {
    const id = await createSession(3)

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(id, { name: `User ${i}`, email: `user${i}@example.com` })
      )
    )

    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s === 201)).toHaveLength(3)
    expect(statuses.filter((s) => s === 409)).toHaveLength(7)
    expect(await getRegistered(id)).toBe(3)
    expect(await prisma.registration.count({ where: { sessionId: id } })).toBe(3)
  })
})
