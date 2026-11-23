// Hand-off point called after a confirmed seat is released.
// WH-5 will promote the first waitlisted registration here.
export async function onSeatFreed(_sessionId: number): Promise<void> {}
