export type NotificationStatus = 'confirmed' | 'promoted'

export interface RegistrationNotification {
  name: string
  email: string
  sessionTitle: string
  sessionDate: Date
  status: NotificationStatus
}

/**
 * Fire-and-forget: a notification problem must never fail or undo a registration.
 */
export function notifyRegistration(notification: RegistrationNotification): void {
  try {
    const { status, name, email, sessionTitle, sessionDate } = notification
    console.log(
      `[notification] ${status} name=${name} email=${email} session="${sessionTitle}" date=${sessionDate.toISOString()}`
    )
  } catch (error: unknown) {
    console.error('[notification] failed to send notification', error)
  }
}
