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
  registered: number
  capacity: number
}
