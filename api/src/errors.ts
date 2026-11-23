export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Training session not found')
    this.name = 'SessionNotFoundError'
  }
}

export class RegistrationNotFoundError extends Error {
  constructor() {
    super('Registration not found')
    this.name = 'RegistrationNotFoundError'
  }
}

export class RegistrationAlreadyCancelledError extends Error {
  constructor() {
    super('Registration is already cancelled')
    this.name = 'RegistrationAlreadyCancelledError'
  }
}
