import { findRegistrationWithSession } from '../repositories/registrationRepository'
import { notifyRegistration } from './notificationService'

// Called after a waitlisted registration has been promoted and committed.
// Never rejects: a notification problem must not affect the cancellation.
export async function onRegistrationPromoted(
  sessionId: number,
  registrationId: number
): Promise<void> {
  try {
    const registration = await findRegistrationWithSession(registrationId)
    if (
      !registration ||
      registration.sessionId !== sessionId ||
      registration.status !== 'confirmed'
    ) {
      return
    }
    notifyRegistration({
      name: registration.name,
      email: registration.email,
      sessionTitle: registration.session.title,
      sessionDate: registration.session.date,
      status: 'promoted',
    })
  } catch (error: unknown) {
    console.error('[notification] failed to notify promoted registration', error)
  }
}
