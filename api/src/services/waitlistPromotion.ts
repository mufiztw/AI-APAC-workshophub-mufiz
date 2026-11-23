// Hand-off point called after a waitlisted registration has been promoted and committed.
// WH-8 will notify the promoted employee here.
export async function onRegistrationPromoted(
  _sessionId: number,
  _registrationId: number
): Promise<void> {}
