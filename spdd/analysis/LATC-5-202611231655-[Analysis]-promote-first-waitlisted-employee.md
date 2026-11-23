# SPDD Analysis: Promote First Waitlisted Employee After Cancellation

## Original Business Requirement

## LATC-5: Promote first waitlisted employee after cancellation

- **Original card:** LATC-5 (https://thoughtworks.atlassian.net/browse/LATC-5), status Backlog, left unchanged
- **Working copy:** LATC-69 (https://thoughtworks.atlassian.net/browse/LATC-69), status In Progress
- **Status:** Backlog (original)

_Migrated from WH-5_

### Context

When a confirmed registration is cancelled (WH-4), a seat becomes available. The first person on the waitlist should be automatically promoted to confirmed status. This closes the loop between cancellation and waitlist management.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As a waitlisted employee, I want to be automatically promoted to confirmed when a registered employee cancels so that I can secure the now-available place.

Promotion is automatic — it fires as a side effect of cancellation (WH-4). No user directly triggers it. The first waitlisted employee (by `createdAt`) is promoted to `confirmed`.

### Acceptance Criteria

**What the user sees:**

* Promotion is invisible to the cancelling employee — they see only the standard cancellation success message
* A waitlisted employee who refreshes the sessions page after being promoted sees their status shown as "Confirmed" instead of "Waitlisted"
* The session card's registered/capacity count stays the same after promotion (the vacated seat is immediately filled)
* A notification is sent to the promoted employee (WH-8)

**API and backend behaviour:**

* When a confirmed registration is cancelled, the first waitlisted employee is automatically promoted to `confirmed`
* If there are no waitlisted employees, no promotion occurs and the `registered` count decrements by 1
* The session's `registered` count remains unchanged when promotion occurs (cancelled −1 and promoted +1 = net zero)
* Promotion is atomic: cancellation and promotion happen in the same database transaction
* The API response for cancellation includes `{ status: "cancelled", promotedRegistrationId: N }` if a promotion occurred, or `{ status: "cancelled", promotedRegistrationId: null }` if none

### Out of Scope

* Manual promotion by an organiser
* Promotion notification UI (covered in WH-8)

### Suggested Tests

* Cancel confirmed registration → first waitlisted employee is promoted
* Promoted employee status changes to "confirmed"
* No promotion when waitlist is empty — `registered` count decrements
* `registered` count unchanged when promotion occurs
* Cancellation and promotion are atomic (no partial state)

### Implementation Hint

Use a Prisma transaction to cancel and promote atomically.

## Domain Concept Identification

Project fingerprint: pnpm monorepo with an Express + Prisma (SQLite) API layered as routes → services → repositories, and a React + TypeScript (Vite) web app. Typed domain errors are mapped to HTTP statuses in the route. Tests are Jest (API unit and integration) and Vitest (web).

Codebase finding: LATC-2 (register), LATC-3 (waitlist) and LATC-4 (cancel) are merged on `main`. Cancellation already runs in one transaction that marks the registration cancelled and, for a confirmed one, returns the seat. After the commit, the service calls a hand-off function that is currently empty and was left for this story. The registration list is not exposed anywhere: the sessions endpoint returns sessions only, and the card remembers a registration only in memory after the employee registers.

Design tension with LATC-4: that hand-off runs **after** the cancellation commits, but this story requires cancellation and promotion to happen in the **same** transaction. The existing hook placement cannot satisfy the atomicity criterion as it stands.

### Existing Concepts (from codebase)

- **Training Session**: a workshop whose stored `registered` count tracks confirmed seats only. It is the parent of registrations.
- **Registration and its status**: confirmed, waitlisted or cancelled. Waitlisted registrations hold no seat.
- **Waitlist and Waitlist Position**: waitlisted registrations of a session. Position is derived from join order, so removing or promoting the first entry moves everyone else up automatically.
- **Cancellation**: the soft-cancel operation from LATC-4. It releases a seat only for a confirmed registration, and a repeat cancel is a conflict.
- **Seat Claim and Seat Release**: the atomic, conditional adjustments of `registered` that keep it between zero and capacity.
- **Waitlist Promotion Hand-off**: the empty post-commit function called after a seat is released, reserved for this story.
- **Session Card**: shows the count and the registration state it remembers in memory (confirmed, waitlisted, cancelled), with no link to later changes made by someone else.

### New Concepts Required

- **Promotion**: moving the first waitlisted registration of a session to confirmed when a seat is released, as part of the same unit of work as the cancellation. It relates to Cancellation (its trigger), Waitlist (its source) and Seat (the one it fills).
- **Promoted Registration Reference**: the cancellation result now reports which registration, if any, was promoted. It relates to Registration and the cancel response.
- **Registration Status Lookup (candidate)**: some way for a waitlisted employee to see, after a refresh, that they are now confirmed. It does not exist today and is required by one acceptance criterion.
- **Promotion Notification Hand-off (candidate)**: a point where WH-8 can send the promoted employee a message. The notification itself is a different story.

### Key Business Rules

- **First in line wins**: the waitlisted registration that joined earliest (by creation time) is promoted — governs Waitlist and Promotion.
- **Promotion only follows a confirmed cancellation**: cancelling a waitlisted or already-cancelled registration promotes nobody — governs Cancellation and Promotion.
- **A freed seat is filled at once when someone is waiting**: with a non-empty waitlist, `registered` is unchanged (cancelled −1, promoted +1). With an empty waitlist, it drops by one — governs Training Session and Seat.
- **Atomicity**: the cancellation and the promotion succeed or fail together, with no partial state — governs Cancellation and Promotion.
- **The cancelling employee sees nothing of the promotion** in the UI — governs the Session Card.
- **Implicit: capacity is never exceeded by promotion**: the promoted seat comes from the one just released.
- **Implicit: only one promotion per released seat, and no one is promoted twice**, including when several cancellations happen at the same time.
- **Implicit: cancelled and already-confirmed registrations are skipped** when choosing who is first.
- **Implicit: no newcomer can take the freed seat ahead of the waitlist**, because the seat is never free between cancellation and promotion. This closes the queue-jumping gap noted in LATC-4.

## Strategic Approach

### Solution Direction

- Extend the existing cancellation flow so that promotion is a second step inside the same transaction, and report the result in the cancellation response.
- Data flow: cancel request → one transaction: mark the registration cancelled → release its seat if it was confirmed → pick the first waitlisted registration of the session → if one exists, promote it and take the seat back (net zero), otherwise leave the seat released → return the cancelled status and the promoted registration reference (or none) → optional post-commit hand-off for notifications (WH-8).
- Keep the existing layering: the repository owns the transaction and ordering, the service translates outcomes, and the route maps them.
- Re-purpose the existing post-commit hand-off: it can no longer be where promotion happens, but it remains a sensible place for the later notification, since a message failure must not undo a valid promotion.

### Key Design Decisions

- **Where promotion runs**: inside the cancellation transaction (as required) versus in the post-commit hook (as LATC-4 left it). The hook is simpler but violates the atomicity criterion and leaves a window in which a newcomer could take the seat → run promotion inside the transaction and change the hook's role.
- **How "first" is decided**: by creation time (as the story says) with the identifier as a tie-break, versus join order by identifier alone. Position display from LATC-3 uses identifier order. Using creation time then identifier keeps the two consistent in practice and still matches the story → use creation time, then identifier, and keep both orderings aligned.
- **Guarding against double promotion**: make the promotion itself conditional on the candidate still being waitlisted, so simultaneous cancellations cannot promote the same person twice → keep the conditional-update pattern already used for cancel and claim.
- **Net-zero accounting**: avoid decrementing and then incrementing the stored count, and simply leave it unchanged when a promotion happens. This is cheaper and avoids a transient dip → recommend, with the same transaction guarantees.
- **Response shape**: add the promoted registration reference as the story specifies, to the existing cancel response. See the security risk below before accepting it as-is.
- **Seeing the promotion after a refresh**: the story wants the status to read "Confirmed" after a refresh, but no data path exists. The smallest option is a way to look up a registration by its id (the identifier the employee already holds) plus the browser remembering that id. This is a real scope question → needs a decision.

### Alternatives Considered

- **Promote asynchronously in the post-commit hook**: rejected, because it breaks atomicity and opens the queue-jumping window.
- **Promote lazily when the next employee views or joins**: rejected, because the seat could be claimed by someone else first and the story says promotion is automatic and immediate.
- **Re-count confirmed registrations instead of adjusting the stored count**: rejected, because it contradicts the stored-count decision from LATC-2.
- **Build notifications into this story**: rejected, because WH-8 owns them.

## Risk & Gap Analysis

### Requirement Ambiguities

- **"A notification is sent to the promoted employee (WH-8)"** appears in the acceptance criteria, but the Out of Scope list excludes the notification UI and WH-8 is a separate story. It is unclear whether this story must send anything now or only leave a hand-off point.
- **"Sees status shown as Confirmed after refreshing"**: nothing in the system lets the page know a registration's status after a refresh. The story does not say how an employee identifies themselves to the page, or whether a lookup endpoint is expected.
- **Promoted registration reference in the cancel response**: the story requires it, while also saying promotion is invisible to the canceller. It is unclear whether the response may carry it at all, given the security point below.
- **"First by createdAt"** when two registrations have identical creation times, and how this relates to the position numbers shown to waitlisted employees.
- **The count after promotion**: the cancelling employee's card keeps the same count, so the card may look as if nothing changed. The story accepts this, but the success message and count behaviour of LATC-4 should be re-read in that light.
- **Response when promotion occurs after a waitlisted cancellation**: not applicable by the rules, but the response field must still be present and empty in that case.

### Edge Cases

- **Empty waitlist**: no promotion, the count drops by one, and the response reports no promotion.
- **Cancelling a waitlisted or already-cancelled registration**: no seat released, no promotion.
- **Several confirmed cancellations at the same moment** on a session with several waitlisted people: each should promote a different person, with none promoted twice and no one skipped.
- **A waitlisted person cancels at the same moment as the cancellation that would promote them**: the next person in line must be promoted instead, and no cancelled registration may become confirmed.
- **A cancel and a new registration at the same moment**: the new registration must not take the seat if someone is waiting.
- **Capacity changes or inconsistent counts**: promotion must never push the count above capacity.
- **Promoted person already cancelled before the promotion commits**: skipped, using the next in line.
- **Promoted person is the same person as the canceller** (same email on both rows): allowed, since duplicate prevention is out of scope.

### Technical Risks

- **Credential exposure through the response**: the registration id is the only proof of ownership for cancelling. Returning the promoted person's id to the canceller hands over the means to cancel that person's registration, on top of the already guessable sequential ids. The story requires the field, so the risk should be accepted knowingly, or the exposed value should be limited.
- **Rework of the LATC-4 hook and tests**: the post-commit hand-off is currently called and asserted in the existing tests, and the cancel response shape is asserted exactly. Both change, so those tests and the LATC-4 canvas must be updated together with the code.
- **Concurrency and transaction length**: cancel plus promotion makes the transaction slightly longer on a single-writer store. The existing wait and timeout limits should still hold.
- **Stored count drift**: promotion adds another place that touches seat accounting. Net-zero must be enforced inside the transaction so the count and the confirmed rows cannot diverge.
- **UI cannot reflect promotion without a lookup**: without a data path, the "Confirmed after refresh" criterion cannot be met, and adding one expands scope (a new endpoint and browser-side memory of the id).
- **Norm violation outside this story**: the sessions route file still imports the database client directly for the keyword search endpoint, which is a deliberate security seed. New work must not follow that pattern.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
| --- | --- | --- | --- |
| 1 | Promotion is invisible to the cancelling employee (standard success message only) | Yes | The page already ignores unknown response fields, but the response exposes the promoted id (security risk). |
| 2 | A waitlisted employee who refreshes sees "Confirmed" instead of "Waitlisted" | Partial | No lookup or stored registration exists; needs a decision on scope. |
| 3 | The card's registered/capacity count stays the same after promotion | Yes | Follows from net-zero accounting and the figures already returned by cancel. |
| 4 | A notification is sent to the promoted employee (WH-8) | Partial | Out of scope here by the story's own list; only a hand-off point is proposed. |
| 5 | On a confirmed cancellation, the first waitlisted employee is promoted to confirmed | Yes | Ordering by creation time with an identifier tie-break. |
| 6 | No waitlist means no promotion and `registered` decrements by 1 | Yes | Already how cancellation works. |
| 7 | `registered` is unchanged when promotion occurs (−1 and +1 net zero) | Yes | Enforce inside the transaction. |
| 8 | Promotion is atomic with the cancellation in one transaction | Yes | Requires moving promotion out of the LATC-4 post-commit hook. |
| 9 | The cancel response includes `promotedRegistrationId` (a number or null) | Yes | Additive to the existing body; see the credential exposure risk. |
