# SPDD Analysis: Registration Deadline Blocks Late Registration

## Original Business Requirement

# LATC-7: Registration deadline prevents late registration

- Original card: LATC-7
- Working copy: LATC-122 ("Mufiz - Registration deadline prevents late registration", In Progress)
- Status of original: Backlog
- Link: https://thoughtworks.atlassian.net/browse/LATC-7

## Description

_Migrated from WH-7_

### Context

Training sessions should have a registration deadline to prevent last-minute sign-ups that leave organisers unable to prepare adequately. Employees should not be able to register after the deadline has passed.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As a training organiser, I want to set a registration deadline so that employees cannot register after the cutoff date.

The registration deadline is a date/time field on the training session. When an employee attempts to register after the deadline, the system rejects the request with a clear error.

### Acceptance Criteria

**User interactions:**

* When a session has a deadline that is in the future, the session card shows "Registration closes: \[formatted date\]" near the Register button
* When the deadline has passed, the session card shows "Registration closed" in place of the Register button
* The Register button is removed or disabled when the deadline has passed
* If a user somehow submits the registration form after the deadline (e.g., the page was open before the cutoff), they see an inline error message: "Registration for this session has closed"
* Sessions without a deadline show no deadline label and allow registration at any time

**API behaviour:**

* `TrainingSession` has a `registrationDeadline` field (nullable `DateTime`)
* `POST /api/training-sessions/:id/registrations` returns HTTP 422 if the current time is after `registrationDeadline`
* The error body includes `{ error: "Registration deadline has passed" }`
* Sessions without a deadline allow registration at any time
* The deadline check uses server time (not client time)

### Out of Scope

* Organiser UI for setting the deadline (seed data is sufficient)
* Automatic session status change at deadline
* Timezone handling beyond UTC

### Suggested Tests

* Register before deadline → 201 success
* Register after deadline → 422 with error message
* Register on session with no deadline → 201 success
* Deadline shown in session listing when set
* Register button absent/disabled when deadline passed

## Domain Concept Identification

### Existing Concepts (from codebase)
- TrainingSession: the bookable session (date, capacity, registered count, status). Has no deadline concept today. Owns Registrations.
- Registration: an employee sign-up, either confirmed or waitlisted (or cancelled). Created atomically with seat claiming in one transaction in the registration repository.
- Registration attempt (POST /api/training-sessions/:id/registrations): flows route -> registrationService -> registrationRepository; domain errors (ValidationError, SessionNotFoundError) are mapped to HTTP codes in the route.
- Session card (UI): one card per session holding the registration form, the Register / Join Waitlist button, the inline error area, and the registration status display.
- Seed data: sessions are created in api/prisma/seed.ts; the story says seed data is sufficient to set deadlines.

### New Concepts Required
- Registration deadline: an optional cutoff instant on a TrainingSession; absence means unrestricted.
- Registration window state (open / closing at X / closed): derived from the deadline and the current time; never stored.
- Deadline-passed rejection: a new domain error outcome, distinct from validation (400) and not-found (404), mapped to 422.

### Key Business Rules
- Registration is allowed only while now <= deadline (or deadline is null): governs TrainingSession and Registration.
- The decision uses server time only; the client display is advisory: governs the API.
- A null deadline never blocks.
- Implicit: the deadline gates the waitlist too, since "Join Waitlist" is also a registration (POST returns 202 for waitlist). A closed session accepts neither.
- Implicit: the deadline check must precede seat claiming so a rejected request never consumes a seat or creates a row.
- Implicit: cancellation is not affected by the deadline.
- Implicit: waitlist promotion on cancel after the deadline still proceeds (it is not a new registration).

## Strategic Approach

### Solution Direction
- Add a nullable deadline attribute to TrainingSession (schema change, pushed via prisma db push as per make setup) and seed a few sessions with future, past and no deadline.
- Enforce in the backend business layer: the registration flow reads the session's deadline and rejects when the server clock is past it, before any seat is claimed. Route maps the new error to 422 with the specified body.
- Expose the deadline through existing session read endpoints (already return the full row) and add it to the frontend TrainingSession type.
- UI derives open/closed from the deadline: show "Registration closes: date" when open, replace the form/Register button with "Registration closed" when past, show nothing without a deadline. On a 422 the existing inline error area shows "Registration for this session has closed".
- Follow Red-Green-Refactor; no direct Prisma in routes.

### Key Design Decisions
- Where to check: inside the same transaction as seat claiming vs. a separate pre-read in the service. Transaction check removes the race between read and write at the cutoff but couples the repository to the rule; a service pre-check is simpler and matches layering. Recommendation: do the check in the repository transaction (it already reads the session) and surface a distinct result status, with the service translating it to the domain error, keeping the rule atomic with the seat claim.
- Error message mismatch: API body says "Registration deadline has passed" but UI must show "Registration for this session has closed". Recommendation: the UI maps the 422 to the required friendly text rather than echoing the API message.
- Boundary semantics: deadline exactly equal to now. Recommendation: closed only when now is strictly after the deadline, as the story says "after the deadline".
- Closed state in UI: remove vs disable the button. Recommendation: replace the form with the "Registration closed" text (story says in place of the Register button).
- Clock in UI: client clock decides initial display only; server remains authoritative.

### Alternatives Considered
- Computing closed state server-side and returning a flag: rejected, adds API surface not in the story and the client can derive it simply.
- Automatic session status change at deadline: explicitly out of scope.
- Storing deadline as a date string: rejected, a DateTime column matches the story and existing date handling.

## Risk & Gap Analysis

### Requirement Ambiguities
- Does the deadline also block waitlist joining? Assumed yes (a closed session rejects all registration requests); needs confirmation.
- Deadline vs session date: no rule requires deadline <= session date; assumed not validated since there is no organiser UI.
- Exact UI date format for "Registration closes": assumed the same locale formatting as the session date, with time because deadline is a date/time.
- Response order if a session is both unknown and past deadline: not applicable (unknown session returns 404 first).
- Validation errors vs deadline: if the body is invalid and the deadline passed, which wins? Assumed existing input validation (400) runs first, as it does before any DB access.

### Edge Cases
- Page opened before cutoff, submitted after: server returns 422, UI shows inline error and should then reflect the closed state.
- Client clock skew: the card may show open while the server rejects, or the reverse; server decides.
- Deadline exactly at now: treated as open.
- Deadline after session date, or in the past at seed time: allowed.
- Full session with passed deadline: closed message takes precedence over the Join Waitlist hint.
- Existing registered user viewing a closed session: should still see status and the Cancel button; the closed message must not hide their registration status.
- Timezone: UTC only per scope; formatting uses the browser locale.

### Technical Risks
- Schema change requires db push on existing databases (database/dev.db is untracked); existing rows get null, which is safe.
- The seat claim uses a raw UPDATE; placing the deadline check requires reading the session first in the transaction, adding one read; SQLite serialises writers so impact is small.
- Prisma returns DateTime as Date; JSON serialisation yields ISO strings; the frontend type must declare it as a nullable string.
- Existing unit tests mock the repository and Prisma; they need updating for the new field and result status.
- Existing UI tests construct TrainingSession fixtures; the new field must be optional-safe (null) to avoid breakage.
- Pre-existing security seed (SQL injection in /search) is out of scope but the search endpoint returns raw rows, so the deadline also appears there as a string/number depending on SQLite raw output.

### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Future deadline shows "Registration closes: [date]" near Register button | Yes | Date format unspecified |
| 2 | Past deadline shows "Registration closed" in place of Register button | Yes | Must keep existing registration status visible |
| 3 | Register button removed or disabled after deadline | Yes | Covered by AC 2 |
| 4 | Late submit shows inline "Registration for this session has closed" | Yes | Map 422 to this text in UI |
| 5 | No deadline: no label, registration always allowed | Yes | - |
| 6 | TrainingSession has nullable registrationDeadline | Yes | Schema push needed |
| 7 | POST returns 422 after deadline | Yes | Waitlist also blocked (assumed) |
| 8 | Error body { error: "Registration deadline has passed" } | Yes | Matches existing error body shape |
| 9 | No deadline allows registration any time | Yes | - |
| 10 | Server time used for check | Yes | Test with controllable clock |
