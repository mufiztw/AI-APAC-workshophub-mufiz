import {
  notifyRegistration,
  RegistrationNotification,
} from '../../src/services/notificationService'

const WEBHOOK_URL = 'https://hooks.slack.test/services/T000/B000/SECRET-TOKEN'

const base: RegistrationNotification = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  sessionTitle: 'Intro to TDD',
  sessionDate: new Date('2026-12-01T09:00:00.000Z'),
  status: 'confirmed',
}

const originalWebhook = process.env.SLACK_WEBHOOK_URL
const originalFetch = global.fetch

let logSpy: jest.SpyInstance
let errorSpy: jest.SpyInstance
let mockFetch: jest.Mock
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason)
}

// Lets fire-and-forget promise chains settle.
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function loggedText(): string {
  const calls = [...logSpy.mock.calls, ...errorSpy.mock.calls] as unknown[][]
  return calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.name} ${arg.message}` : String(arg)))
    .join('\n')
}

beforeEach(() => {
  delete process.env.SLACK_WEBHOOK_URL
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockFetch = jest.fn()
  global.fetch = mockFetch as unknown as typeof fetch
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
})

afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
  logSpy.mockRestore()
  errorSpy.mockRestore()
  global.fetch = originalFetch
  if (originalWebhook === undefined) delete process.env.SLACK_WEBHOOK_URL
  else process.env.SLACK_WEBHOOK_URL = originalWebhook
})

describe('notifyRegistration console log', () => {
  it.each(['confirmed', 'promoted'] as const)(
    'logs one line with name, email, title, ISO date and status %s',
    async (status) => {
      notifyRegistration({ ...base, status })
      await flush()

      expect(logSpy).toHaveBeenCalledTimes(1)
      const line = String(logSpy.mock.calls[0][0])
      expect(line).toContain(status)
      expect(line).toContain('Ada Lovelace')
      expect(line).toContain('ada@example.com')
      expect(line).toContain('Intro to TDD')
      expect(line).toContain('2026-12-01T09:00:00.000Z')
    }
  )
})

describe('notifyRegistration Slack webhook', () => {
  it('does not call fetch when SLACK_WEBHOOK_URL is unset', async () => {
    notifyRegistration(base)
    await flush()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call fetch when SLACK_WEBHOOK_URL is empty', async () => {
    process.env.SLACK_WEBHOOK_URL = ''

    notifyRegistration(base)
    await flush()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('POSTs JSON {text} with the same details to the configured URL once', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    notifyRegistration({ ...base, status: 'promoted' })
    await flush()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(WEBHOOK_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }))
    const body = JSON.parse(String(init.body)) as { text: string }
    expect(body.text).toContain('promoted')
    expect(body.text).toContain('Ada Lovelace')
    expect(body.text).toContain('ada@example.com')
    expect(body.text).toContain('Intro to TDD')
    expect(body.text).toContain('2026-12-01T09:00:00.000Z')
  })
})

describe('notifyRegistration failure isolation', () => {
  it('does not throw when console.log throws, and logs the failure via console.error', async () => {
    logSpy.mockImplementation(() => {
      throw new Error('log broke')
    })

    expect(() => notifyRegistration(base)).not.toThrow()
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  it('does not throw or leave an unhandled rejection when fetch rejects, and logs via console.error', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockRejectedValue(new Error('network down'))

    expect(() => notifyRegistration(base)).not.toThrow()
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  it('does not throw or leave an unhandled rejection on a non-ok response, and logs via console.error', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    expect(() => notifyRegistration(base)).not.toThrow()
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  it('does not throw when fetch throws synchronously, and logs via console.error', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockImplementation(() => {
      throw new Error('sync fetch failure')
    })

    expect(() => notifyRegistration(base)).not.toThrow()
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  it('returns undefined without throwing when fetch never resolves', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockReturnValue(new Promise<never>(() => undefined))

    let result: unknown = 'unset'
    expect(() => {
      result = notifyRegistration(base)
    }).not.toThrow()
    await flush()

    expect(result).toBeUndefined()
    expect(unhandled).toEqual([])
  })

  it('returns synchronously before a slow fetch resolves', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    let resolveFetch: (value: { ok: boolean; status: number }) => void = () => undefined
    let settled = false
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = (value) => {
          settled = true
          resolve(value)
        }
      })
    )

    const result = notifyRegistration(base)

    expect(result).toBeUndefined()
    expect(settled).toBe(false)
    resolveFetch({ ok: true, status: 200 })
    await flush()
  })
})

describe('notifyRegistration secrecy', () => {
  it('never logs the webhook URL on success', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    notifyRegistration(base)
    await flush()

    expect(loggedText()).not.toContain(WEBHOOK_URL)
    expect(loggedText()).not.toContain('SECRET-TOKEN')
  })

  it('never logs the webhook URL when the response is not ok', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockResolvedValue({ ok: false, status: 404 })

    notifyRegistration(base)
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(loggedText()).not.toContain(WEBHOOK_URL)
    expect(loggedText()).not.toContain('SECRET-TOKEN')
  })

  it('never logs the webhook URL when fetch rejects', async () => {
    process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
    mockFetch.mockRejectedValue(new Error('network down'))

    notifyRegistration(base)
    await flush()

    expect(errorSpy).toHaveBeenCalled()
    expect(loggedText()).not.toContain(WEBHOOK_URL)
    expect(loggedText()).not.toContain('SECRET-TOKEN')
  })
})
