export type NotificationStatus = 'confirmed' | 'promoted'

export interface RegistrationNotification {
  name: string
  email: string
  sessionTitle: string
  sessionDate: Date
  status: NotificationStatus
}

const WEBHOOK_TIMEOUT_MS = 5000

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })
  if (!response.ok) {
    // Status only: the error must never carry the webhook URL.
    throw new Error(`Slack webhook responded with status ${response.status}`)
  }
}

/**
 * Fire-and-forget: a notification problem must never fail or undo a registration.
 * Logs a line and, when SLACK_WEBHOOK_URL is set, also posts it to Slack.
 */
export function notifyRegistration(notification: RegistrationNotification): void {
  try {
    const { status, name, email, sessionTitle, sessionDate } = notification
    const line = `[notification] ${status} name=${name} email=${email} session="${sessionTitle}" date=${sessionDate.toISOString()}`
    console.log(line)

    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (webhookUrl) {
      postToSlack(webhookUrl, line).catch((error: unknown) => {
        console.error('[notification] failed to post to Slack', error)
      })
    }
  } catch (error: unknown) {
    console.error('[notification] failed to send notification', error)
  }
}
