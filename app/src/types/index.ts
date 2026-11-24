export interface TrainingSession {
  id: number
  title: string
  description: string
  date: string
  capacity: number
  registered: number
  location: string
  deliveryMode: string
  status: string
  registrationDeadline: string | null
  createdAt: string
  updatedAt: string
}

export interface RegistrationRequest {
  name: string
  email: string
}

export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled'

export interface RegistrationResponse {
  id: number
  sessionId: number
  name: string
  email: string
  status: RegistrationStatus
  position?: number
  createdAt: string
  registered: number
  capacity: number
}

export interface CancelResponse {
  status: 'cancelled'
  promotedRegistrationId: number | null
  registered: number
  capacity: number
}

export interface RegistrationLookup {
  id: number
  sessionId: number
  status: RegistrationStatus
  position?: number
}

export interface RegistrationEntry {
  id: number
  name: string
  email: string
  status: RegistrationStatus
  createdAt: string
}

export interface SessionRegistrations {
  confirmed: RegistrationEntry[]
  waitlisted: RegistrationEntry[]
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
