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

export class SessionFullError extends Error {
  constructor() {
    super('Training session is full')
    this.name = 'SessionFullError'
  }
}
