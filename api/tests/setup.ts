import path from 'path'

// Runs via jest.config.js setupFiles before each test suite, before any app modules load.
// Point tests at the database created by `make setup` (database/dev.db) unless overridden.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || `file:${path.resolve(__dirname, '../../database/dev.db')}`
process.env.NODE_ENV = 'test'
