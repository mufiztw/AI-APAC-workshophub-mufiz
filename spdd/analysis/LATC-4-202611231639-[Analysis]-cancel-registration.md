# SPDD Analysis: Cancel Registration

## Original Business Requirement

## LATC-4: Cancel registration

- **Original card:** LATC-4 (https://thoughtworks.atlassian.net/browse/LATC-4), status Backlog, left unchanged
- **Working copy:** LATC-65 (https://thoughtworks.atlassian.net/browse/LATC-65), status In Progress
- **Status:** Backlog (original)

_Migrated from WH-4_

### Context

An employee may need to cancel their confirmed registration. This frees up a seat that can be offered to the first person on the waitlist (WH-5). Cancellation should update the `registered` count and trigger waitlist promotion.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As a registered employee, I want to cancel my registration so that I can release my place for someone else.

The employee cancels using their registration ID. The system marks the registration as cancelled, decrements the registered count, and shows the updated state in the UI.

### Acceptance Criteria

**User interactions:**

* A "Cancel Registration" button is visible on the session card or registration confirmation page for an employee who has a confirmed registration
* Clicking "Cancel" shows a confirmation prompt: "Are you sure you want to cancel your registration for \[Session Title\]?"
* After confirming, the page shows a success message: "Your registration has been cancelled"
* The session card updates to reflect the new registered/capacity count (e.g., "11 / 20 registered (9 spots left)")
* If the employee has already cancelled, the Cancel button is not shown (or is disabled with label "Cancelled")

**API behaviour:**

* `DELETE /api/training-sessions/:id/registrations/:registrationId` returns HTTP 200 with `{ status: "cancelled" }`
* On cancellation, the registration status changes to `cancelled` in the database
* On cancellation, the session's `registered` count decrements by 1
* Returns HTTP 404 if the registration does not exist
* Returns HTTP 409 if the registration is already cancelled
* After cancellation, waitlist promotion (WH-5) is triggered

### Out of Scope

* Email confirmation of cancellation (WH-8)
* Cancellation by organiser
* Authentication — the registration ID serves as the identity token for training simplicity

### Suggested Tests

* `DELETE /api/.../registrations/1` → 200, status "cancelled"
* `DELETE /api/.../registrations/999` → 404
* `DELETE` already-cancelled registration → 409
* `registered` count decrements after cancellation
* Waitlist promotion triggered after cancellation

## Domain Concept Identification

Project fingerprint: pnpm monorepo with an Express + Prisma (SQLite) API layered as routes → services → repositories, and a React + TypeScript (Vite) web app. Typed domain errors are mapped to HTTP statuses in the route. Tests are Jest (API unit and integration) and Vitest (web).

Codebase finding: the state this story builds on is LATC-2 (register) plus LATC-3 (waitlist), both merged. A registration already carries a status whose allowed values already include `cancelled`, but nothing writes it yet. Confirmed registrations hold a seat that is counted on the session row. Waitlisted registrations hold no seat and get their position derived from join order. There is no cancellation, no promotion (WH-5), and no way to look up or list a registration after it is created. The registration id is returned only in the response to the registration request.

### Existing Concepts (from codebase)

- **Training Session**: a bookable workshop whose stored `registered` count tracks confirmed seats only. It is the parent of registrations.
- **Registration**: one employee's claim on a session. It already has a status of confirmed, waitlisted or cancelled, where cancelled is defined but unused.
- **Seat Claim (capacity guard)**: the atomic, conditional increment that keeps `registered` from exceeding capacity. Cancellation needs its inverse.
- **Waitlist and Waitlist Position**: the waitlisted registrations of a session, ordered by join time. Position is computed, not stored, so removing someone ahead of you moves you up automatically.
- **Registration outcome errors**: validation and not-found errors, mapped at the route to 400 and 404. There is no "already cancelled" outcome yet.
- **Session Card / Registration Form** (UI): shows capacity and seats left, the registration form, and the confirmation or waitlist message. The card forgets the registration it just created once the form is cleared, and the page keeps no record of registrations.

### New Concepts Required

- **Cancellation**: the act of an employee releasing a confirmed place. It moves a registration to cancelled and returns the seat to the session.
- **Registration Identity Token**: the registration id acting as the only proof of ownership, since there is no authentication. It relates to Registration, and the UI must hold on to it for the employee.
- **Waitlist Promotion Trigger**: the hand-off from a freed seat to the first waitlisted person (WH-5). Only the trigger belongs to this story; the promotion rules belong to WH-5.
- **Cancellation Confirmation (UI)**: the confirm prompt and the success message shown around the action.

### Key Business Rules

- **Only an active registration can be cancelled**: confirmed is the case the story describes. A second cancel of the same registration is a conflict — governs Registration.
- **A confirmed cancellation returns exactly one seat**: `registered` decreases by one, never below zero, and never twice for the same registration — governs Training Session and Registration.
- **The seat count and the registration status change together**: a registration is cancelled if and only if the count was adjusted for it — governs Registration and Training Session.
- **The registration id is the identity**: knowing the id, scoped to its session, is enough to cancel (explicit) — governs Registration Identity Token.
- **Cancelling frees a place for the waitlist, not for anyone**: the freed seat should be offered to the first person waiting (explicit intent) — governs Waitlist and Seat Claim.
- **Implicit: a registration must belong to the session in the URL**: an id that exists for a different session should not be cancellable through this session.
- **Implicit: waitlisted registrations hold no seat**: cancelling one must not change `registered`, and everyone behind it moves up by one.
- **Implicit: cancelled registrations leave the waitlist and stop counting**.

## Strategic Approach

### Solution Direction

- Add the inverse of registration to the existing flow: a cancel operation reachable at `DELETE /api/training-sessions/:id/registrations/:registrationId`, following the same layering (route maps errors, service validates and translates, repository owns the transaction).
- Data flow: employee confirms in the UI → cancel request → service validates ids → repository, in one transaction, changes the registration from its active status to cancelled and, if it was holding a seat, gives the seat back → response reports the cancelled status and the updated seat figures → the card refreshes its count and shows the success message → the waitlist promotion trigger runs.
- Keep it a soft cancel: the registration row stays with status cancelled. This keeps history, supports the 409 for a repeat cancel, and uses the status value that already exists.
- Make the status change itself the guard: only an active registration moves to cancelled, so two simultaneous cancels cannot both give a seat back.

### Key Design Decisions

- **Soft cancel vs. hard delete**: the HTTP verb is DELETE, but the story wants the row to read as `cancelled` and a repeat to return 409, which a deleted row cannot do → keep the row and change its status.
- **Where the seat is returned**: decrement in the same transaction as the status change, with a guard so the status change decides whether the decrement happens. This extends the existing atomic-claim pattern and prevents double release.
- **Waitlisted cancellations**: allow cancelling a waitlisted registration (it is the natural way to leave the queue) but release no seat. This is not required by the ACs but closes an obvious gap → recommend allowing it, pending confirmation.
- **How the UI knows the registration**: with no login and no lookup, the only moment the id is known is right after registering. The card should keep it for the lifetime of the page so a Cancel button can appear → recommend this minimal approach, and treat persistence across reloads as a separate decision.
- **Promotion trigger now vs. later**: promotion is defined by WH-5, which does not exist. The recommended direction is a single, clearly named hand-off point that does nothing yet (or is a plain extension point), rather than implementing promotion rules early → needs confirmation (see ambiguities).
- **Response contents**: return the cancelled status as specified and also the updated seat figures, so the card does not need a refetch. This is additive to the specified body.

### Alternatives Considered

- **Hard-delete the registration row**: loses history and makes "already cancelled" indistinguishable from "not found" → rejected.
- **Compute `registered` from confirmed registrations instead of decrementing**: removes drift but contradicts the established stored-count decision from LATC-2 → rejected.
- **Build promotion into this story**: couples two stories, and the rules (ordering, notification, race with new sign-ups) are WH-5's → rejected.
- **Add a "my registrations" lookup so the UI works after reload**: useful but beyond the ACs and raises the identity question → deferred.

## Risk & Gap Analysis

### Requirement Ambiguities

- **"Waitlist promotion is triggered"**: WH-5 is not implemented, so it is unclear what "triggered" must do now. A no-op hook, a call to a stub, or nothing testable would all satisfy the wording differently. The suggested test "promotion triggered after cancellation" cannot be verified without defining the trigger.
- **How the UI knows who the employee is**: the Cancel button is shown "for an employee who has a confirmed registration", but there is no authentication, no lookup and no stored registration list. The story does not say where the registration id comes from after the registration response, or whether it must survive a reload.
- **Cancelling a waitlisted registration**: the story talks only about confirmed registrations. Whether a waitlisted employee may cancel, and whether the API should return 200 for it, is not stated.
- **Response body**: the AC says `{ status: "cancelled" }`. Whether extra fields (the updated seat count) are allowed is not stated.
- **Wrong session in the URL**: a registration id that exists under another session. 404 is the sensible reading, but it is not specified.
- **Invalid ids**: non-numeric session or registration ids. The registration endpoint returns 400, but the ACs list only 404 and 409.
- **Session missing vs. registration missing**: both could be reported as 404, but the story only names the registration.
- **"Cancelled" label**: the story offers two options for an already-cancelled registration, hide the button or show it disabled as "Cancelled". One must be chosen.
- **Exact wording**: the confirmation prompt names the session title in brackets, and the example count "11 / 20 registered (9 spots left)" is illustrative, not a required literal.

### Edge Cases

- **Double cancel**: two cancels of the same registration at once (or a double click). Exactly one must succeed and the other must get 409, and `registered` must drop by one only.
- **Freed seat is open to everyone**: once a seat is freed and before promotion exists, a brand-new registration can claim it while people are still waiting. This lets a new employee jump the waitlist, which contradicts the intent of the waitlist. It matters most until WH-5 lands.
- **Cancelling when the count is already zero or inconsistent**: the count must never go negative.
- **Cancelling a waitlisted registration**: must not change `registered`, and later positions move up by one.
- **Stale UI**: the card shows an old count when the cancel completes. The response figures must replace it.
- **Registration id guessing**: ids are sequential integers, so anyone can cancel anyone's registration by iterating. The story accepts this for training, but it should be stated as a known limitation.
- **Re-registering after cancelling**: the same person can register again as a new registration, since duplicate prevention is out of scope.
- **Cancelled registration on a session that already happened**: whether late cancellation should be blocked is not addressed.

### Technical Risks

- **Seat-count drift**: the stored count and the registration statuses stay consistent only if every change goes through the one transactional path. Cancellation is the second writer of `registered`, so it must follow the same discipline as registration.
- **Race with new registrations**: a cancel and a new registration contending for the same freed seat. The existing atomic claim handles the capacity cap, but ordering relative to the waitlist is undefined.
- **Contract change for the page**: the page and card currently discard the registration id and have no cancel path. Exposing the id to the card changes how state is held, and the existing tests encode the current behaviour.
- **Hook-less promotion**: if the trigger is a stub, the "waitlist promotion triggered" AC and test exist in name only until WH-5, and the risk of a freed seat sitting idle (or being taken by a newcomer) remains.
- **Identity model**: using an unauthenticated id as the token means any future feature that exposes ids (for example a listing) would also expose the ability to cancel.
- **Norm violation outside this story**: the sessions route file still imports the database client directly for the keyword search endpoint (a deliberate security seed). New routes must not follow that pattern.

### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
| --- | --- | --- | --- |
| 1 | "Cancel Registration" button visible for an employee with a confirmed registration | Partial | There is no way to know the employee's registration after the response; needs a decision on how the UI holds the id. |
| 2 | Clicking Cancel shows the confirmation prompt with the session title | Yes | Wording is given. Needs a confirm step in the UI. |
| 3 | After confirming, the page shows "Your registration has been cancelled" | Yes | Message wording is given. |
| 4 | Session card updates to the new registered/capacity count | Yes | Needs the updated figures from the response or a refetch. |
| 5 | Already cancelled: button hidden or disabled with label "Cancelled" | Yes | One of the two options must be chosen. |
| 6 | `DELETE .../registrations/:registrationId` returns 200 with `{ status: "cancelled" }` | Yes | Extra fields in the body are an open question. |
| 7 | Registration status changes to `cancelled` in the database | Yes | The status value already exists. |
| 8 | Session `registered` count decrements by 1 | Yes | Must be tied to the status change to avoid a double release. |
| 9 | 404 if the registration does not exist | Yes | Wrong-session and invalid-id handling are undefined. |
| 10 | 409 if the registration is already cancelled | Yes | Needs the soft-cancel approach so the row still exists. |
| 11 | After cancellation, waitlist promotion (WH-5) is triggered | Partial | WH-5 does not exist; the meaning of "triggered" must be defined. |
