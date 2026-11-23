import { Router, IRouter, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { getAllSessions, getSessionById } from '../services/trainingSessionService'
import {
  cancelRegistration,
  getRegistration,
  registerForSession,
} from '../services/registrationService'
import {
  RegistrationAlreadyCancelledError,
  RegistrationNotFoundError,
  SessionNotFoundError,
  ValidationError,
} from '../errors'

const router: IRouter = Router()

// Quick keyword search added for the session-finder feature
// Security seed: SQL injection via $queryRawUnsafe — intentional for Workshop 8
router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string) || ''
  try {
    const sessions = await prisma.$queryRawUnsafe(
      `SELECT * FROM training_sessions WHERE title LIKE '%${q}%' OR description LIKE '%${q}%' ORDER BY date ASC`
    )
    res.json(sessions)
  } catch (error) {
    res.status(500).json({ error: 'Search failed' })
  }
})

router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = await getAllSessions()
    res.json(sessions)
  } catch (error) {
    console.error('Error fetching training sessions:', error)
    res.status(500).json({ error: 'Failed to fetch training sessions' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid session ID' })
      return
    }

    const session = await getSessionById(id)

    if (!session) {
      res.status(404).json({ error: 'Training session not found' })
      return
    }

    res.json(session)
  } catch (error) {
    console.error('Error fetching training session:', error)
    res.status(500).json({ error: 'Failed to fetch training session' })
  }
})

router.post('/:id/registrations', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid session ID' })
    return
  }

  try {
    const result = await registerForSession(id, req.body)
    res.status(result.status === 'waitlisted' ? 202 : 201).json(result)
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof SessionNotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error registering for training session:', error)
    res.status(500).json({ error: 'Failed to register for training session' })
  }
})

router.delete('/:id/registrations/:registrationId', async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id, 10)
  if (isNaN(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID' })
    return
  }
  const registrationId = parseInt(req.params.registrationId, 10)
  if (isNaN(registrationId)) {
    res.status(400).json({ error: 'Invalid registration ID' })
    return
  }

  try {
    const result = await cancelRegistration(sessionId, registrationId)
    res.status(200).json(result)
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof RegistrationNotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    if (error instanceof RegistrationAlreadyCancelledError) {
      res.status(409).json({ error: error.message })
      return
    }
    console.error('Error cancelling registration:', error)
    res.status(500).json({ error: 'Failed to cancel registration' })
  }
})

router.get('/:id/registrations/:registrationId', async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id, 10)
  if (isNaN(sessionId)) {
    res.status(400).json({ error: 'Invalid session ID' })
    return
  }
  const registrationId = parseInt(req.params.registrationId, 10)
  if (isNaN(registrationId)) {
    res.status(400).json({ error: 'Invalid registration ID' })
    return
  }

  try {
    const result = await getRegistration(sessionId, registrationId)
    res.status(200).json(result)
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof RegistrationNotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error fetching registration:', error)
    res.status(500).json({ error: 'Failed to fetch registration' })
  }
})

export default router
