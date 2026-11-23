import request from 'supertest'
import app from '../../src/app'
import prisma from '../../src/lib/prisma'

const createdSessionIds: number[] = []

async function createSession(): Promise<number> {
  const session = await prisma.trainingSession.create({
    data: {
      title: 'LATC-6 test session',
      description: 'Created by session registrations integration tests',
      date: new Date('2030-01-01T09:00:00Z'),
      capacity: 5,
      registered: 0,
      location: 'Test room',
      deliveryMode: 'online',
    },
  })
  createdSessionIds.push(session.id)
  return session.id
}

async function addRegistration(
  sessionId: number,
  name: string,
  status: 'confirmed' | 'waitlisted' | 'cancelled',
  createdAt: Date
): Promise<number> {
  const created = await prisma.registration.create({
    data: { sessionId, name, email: `${name.toLowerCase()}@example.com`, status, createdAt },
  })
  return created.id
}

function get(id: number | string) {
  return request(app).get(`/api/training-sessions/${id}/registrations`)
}

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { sessionId: { in: createdSessionIds } } })
  await prisma.trainingSession.deleteMany({ where: { id: { in: createdSessionIds } } })
  await prisma.$disconnect()
})

describe('GET /api/training-sessions/:id/registrations', () => {
  it('returns 200 with confirmed and waitlisted arrays', async () => {
    const id = await createSession()
    await addRegistration(id, 'Ada', 'confirmed', new Date('2030-01-01T01:00:00Z'))
    await addRegistration(id, 'Bob', 'waitlisted', new Date('2030-01-01T02:00:00Z'))

    const response = await get(id)

    expect(response.status).toBe(200)
    expect(Object.keys(response.body).sort()).toEqual(['confirmed', 'waitlisted'])
    expect(response.body.confirmed).toHaveLength(1)
    expect(response.body.waitlisted).toHaveLength(1)
    expect(response.body.confirmed[0].name).toBe('Ada')
    expect(response.body.waitlisted[0].name).toBe('Bob')
  })

  it('returns exactly id, name, email, status and createdAt per registration', async () => {
    const id = await createSession()
    const regId = await addRegistration(id, 'Ada', 'confirmed', new Date('2030-01-01T01:00:00Z'))

    const response = await get(id)

    expect(response.body.confirmed[0]).toEqual({
      id: regId,
      name: 'Ada',
      email: 'ada@example.com',
      status: 'confirmed',
      createdAt: '2030-01-01T01:00:00.000Z',
    })
    expect(response.body.confirmed[0]).not.toHaveProperty('sessionId')
  })

  it('excludes cancelled registrations', async () => {
    const id = await createSession()
    await addRegistration(id, 'Ada', 'confirmed', new Date('2030-01-01T01:00:00Z'))
    await addRegistration(id, 'Gone', 'cancelled', new Date('2030-01-01T02:00:00Z'))

    const response = await get(id)

    expect(response.status).toBe(200)
    const names = [...response.body.confirmed, ...response.body.waitlisted].map(
      (r: { name: string }) => r.name
    )
    expect(names).toEqual(['Ada'])
  })

  it('orders each group by join order (createdAt ascending)', async () => {
    const id = await createSession()
    await addRegistration(id, 'Third', 'waitlisted', new Date('2030-01-01T03:00:00Z'))
    await addRegistration(id, 'First', 'waitlisted', new Date('2030-01-01T01:00:00Z'))
    await addRegistration(id, 'Second', 'waitlisted', new Date('2030-01-01T02:00:00Z'))

    const response = await get(id)

    expect(response.body.waitlisted.map((r: { name: string }) => r.name)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('returns 200 with empty arrays for a session with no registrations', async () => {
    const id = await createSession()

    const response = await get(id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ confirmed: [], waitlisted: [] })
  })

  it('does not include registrations of other sessions', async () => {
    const id = await createSession()
    const other = await createSession()
    await addRegistration(other, 'Other', 'confirmed', new Date('2030-01-01T01:00:00Z'))

    const response = await get(id)

    expect(response.body).toEqual({ confirmed: [], waitlisted: [] })
  })

  it('returns 404 with an error body for an unknown session', async () => {
    const response = await get(999999999)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Training session not found' })
  })

  it('returns 400 for a non-numeric id', async () => {
    const response = await get('abc')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid session ID' })
  })
})
