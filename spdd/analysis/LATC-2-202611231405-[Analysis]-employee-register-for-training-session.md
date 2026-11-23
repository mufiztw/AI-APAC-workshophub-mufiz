# SPDD Analysis: Employee Registers for an Available Training Session

## Original Business Requirement

# LATC-2: Employee can register for an available training session

- **Original card:** LATC-2 (https://thoughtworks.atlassian.net/browse/LATC-2), status Backlog, left unchanged
- **Working copy:** LATC-18 (https://thoughtworks.atlassian.net/browse/LATC-18), status In Progress
- **Type / priority:** Story / Medium
- **Reporter:** Loveneesh Singh

## Context

Employees can currently browse training sessions (WH-1). The next step is allowing them to register. Registration is the core transactional action of WorkshopHub — it increments the `registered` count on a session and records the employee's details.

This is a trainee exercise story. It is not implemented in the baseline template.

## Description

As an employee, I want to register for an available training session so that I can secure my place before it fills up.

An employee submits their name and email to register. The system confirms the registration and shows the updated capacity. If the session is full, the employee cannot register (see WH-3 for the waitlist).

## Acceptance Criteria

- A register button or form is visible on each session card (or session detail page)
- The employee provides their name and email to register
- On success, the `registered` count increments by 1
- On success, a confirmation message is shown to the employee
- If `registered >= capacity`, the register button is disabled or hidden
- `POST /api/training-sessions/:id/registrations` accepts `{ name, email }` and returns HTTP 201 with registration details
- Returns HTTP 400 if required fields are missing
- Returns HTTP 409 if the session is full (see WH-3 for waitlist)
- Returns HTTP 404 if the session does not exist

## Out of Scope

- Duplicate registration prevention
- Waitlist behaviour when full (WH-3)
- Cancellation (WH-4)
- Email notification (WH-8)
- Authentication or SSO

## Suggested Tests

- `POST /api/training-sessions/1/registrations { name, email }` → 201
- `POST /api/training-sessions/1/registrations {}` → 400, missing fields
- `POST /api/training-sessions/999/registrations` → 404
- `POST` when session is full → 409
- `registered` count increments after successful registration

## Notes

The `Registration` model will need to be added to the Prisma schema. Race condition to consider when creating a registration and incrementing the count.

## Clarifications

- **`registered` count:** stored on the session row (not computed). Increment it in a transaction together with the registration insert, guarding against the race condition.
- **Status:** the Jira workflow has no "In Development" status, so the copy LATC-18 was moved to "In Progress".
- **Norms:** routes must go through services/repositories (no direct Prisma in routes); no `any`; `make test` and `make lint` must pass.

## Domain Concept Identification

Project fingerprint: pnpm monorepo, Express + Prisma (SQLite) API with Jest tests, and a React + TypeScript (Vite) web app. The API is layered as routes → services → repositories. Errors are typed classes mapped to HTTP statuses in the route.

Codebase finding: the story's note says the feature "is not implemented in the baseline template", but the working tree on `main` already contains a registration implementation (PR #1, commits tagged LATC-2). This analysis therefore treats the requirement as **already largely delivered** and assesses the existing implementation against each acceptance criterion, so the next phases can focus on gaps rather than rebuild it.

### Existing Concepts (from codebase)

- **Training Session**: a bookable workshop with a fixed capacity and a running count of taken seats. Owns the `registered` count. It is the aggregate that registrations attach to.
- **Registration**: a record of one employee (name, email) securing a seat in one session. Belongs to exactly one Training Session. It already exists in the schema, with a relation and an index on the session.
- **Seat Capacity / Registered Count**: the invariant pair that decides whether a session is open or full. It is stored on the session row, as clarified.
- **Registration outcome errors** (validation failure, session not found, session full): already modelled as distinct domain errors that the route maps to 400 / 404 / 409.
- **Session Card / Registration Form** (UI): the per-session card already hosts the form and the capacity display, and the page updates the displayed count after a success.

### New Concepts Required

- None are required to satisfy the stated ACs. Possible additions only if gaps below are accepted: a **duplicate-registration rule** (explicitly out of scope today) and a **session status gate** (see ambiguities).

### Key Business Rules

- **Capacity invariant**: `registered` must never exceed `capacity` — governs Training Session and Registration.
- **Registration increments seats atomically**: a registration exists if and only if the count was incremented for it — governs Registration and Training Session.
- **Required identity data**: a registration needs a name and an email (explicit).
- **Full means no registration**: a full session rejects new registrations (explicit); the UI must also prevent the attempt.
- **Implicit: input hygiene**: name and email are trimmed, the email must look like an email, and both have maximum lengths. None of these is in the ACs, but all are present in the code and tests.
- **Implicit: session status**: sessions carry a status (default `active`). Whether a non-active session (cancelled, closed) should accept registrations is not stated.
- **Implicit: no duplicate prevention** (explicit out of scope): the same email may take several seats in one session.

## Strategic Approach

### Solution Direction

- Keep the established layering: the HTTP route validates the id and translates domain errors into status codes; a service owns input validation and outcome translation; a repository owns persistence and the transaction. The registration endpoint follows this already.
- Data flow: web form → `POST /api/training-sessions/:id/registrations` → service validates → repository claims a seat and records the registration in one transaction → response carries the registration plus the updated `registered`/`capacity` → the page updates the card in place and shows a confirmation.
- Because the work is largely present, the recommended direction is **verify-and-close**: confirm each AC is met by tests, resolve the ambiguities below, and only then change code.

### Key Design Decisions

- **Where the count lives**: stored on the session row (decided in the clarifications) versus computed from registrations. Stored is cheap to read for browsing and is the data the UI already uses; the cost is that the count and the registration rows can drift if written outside the transaction → keep stored, and make the transaction the only write path.
- **How to guard the race**: pessimistic read-then-write versus a single conditional increment that only succeeds while seats remain. The conditional increment gives correctness without explicit locking, which suits a single-writer SQLite store → keep the conditional-increment approach inside one transaction.
- **Response shape**: returning the updated count with the registration saves the UI a refetch and keeps the card consistent → keep it.
- **Validation location**: validation in the service rather than the route keeps routes thin and matches the team norm → keep it.

### Alternatives Considered

- **Compute `registered` from a count of registrations**: removes drift risk but adds a query to every listing and contradicts the clarification → rejected.
- **Application-level lock or retry loop for the race**: more moving parts and weaker than a conditional write → rejected.
- **A separate session detail page for registration**: the ACs allow it, but the card already covers the need with less change → rejected.

## Risk & Gap Analysis

### Requirement Ambiguities

- **"Registration details" in the 201 response**: unclear which fields are required. The current response includes the registration identity and timestamps plus the updated capacity figures. Confirm this is acceptable.
- **Email validity**: the ACs only say "provides name and email" and "missing fields → 400". Rejecting malformed or over-long values also returns 400 today. Confirm that this stricter reading is wanted.
- **Non-active sessions**: the requirement does not say whether a session with a status other than `active` (or a past date) may be registered for.
- **Invalid session id** (non-numeric): the ACs list only 404 for a missing session. The route returns 400 for a malformed id. Confirm that is acceptable.
- **Status-code precedence**: when the body is invalid and the session does not exist, the validation error (400) currently wins over 404. The requirement does not define the order.
- **Meaning of "hidden or disabled"** for a full session: the card disables the fields and button and shows a Full badge. Confirm that this satisfies the "disabled or hidden" AC.

### Edge Cases

- **Concurrent last-seat registrations**: two employees submit for the final seat at once. Exactly one must succeed and the other must get 409. It matters because it is the core integrity promise.
- **Same email registering twice**: allowed because duplicate prevention is out of scope, but it will consume multiple seats and may surprise users.
- **Whitespace-only or padded names**: whitespace-only counts as missing; padded values are trimmed before storage.
- **Stale UI count**: a card that shows seats left may be out of date when the user submits. The server's 409 must be surfaced as an error message on the card.
- **Burst traffic on a single-writer store**: concurrent writers queue for the write lock, so long waits can time out under load.

### Technical Risks

- **Silent-drift risk**: the stored count and the registration rows are consistent only while all writes use the one transaction path. Any future cancellation (WH-4) or admin change must keep that invariant.
- **Norm violation outside this story's scope**: the sessions route file imports the database client directly for the keyword search endpoint, which conflicts with the "no direct Prisma in routes" norm, and that endpoint builds raw SQL from user input (an intentional security seed per its comment). It is not part of LATC-2 but sits in the same route file, so changes there should not widen it.
- **Transaction timeouts**: generous transaction limits reduce failures under bursts but can hide slow requests.
- **Seed vs. reality mismatch**: the story text says the feature is unimplemented, but it exists. Planning from the story alone could duplicate or overwrite working code, so later phases must start from the current code.

### Acceptance Criteria Coverage

| AC# | Description                                                                     | Addressable? | Gaps/Notes                                                                      |
| --- | ------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| 1   | Register button or form visible on each session card                            | Yes          | Already present on the card; verify with a UI test.                             |
| 2   | Employee provides name and email                                                | Yes          | Both fields are present and required.                                           |
| 3   | `registered` increments by 1 on success                                         | Yes          | Done in the same transaction; the page also updates the card.                   |
| 4   | Confirmation message shown on success                                           | Yes          | A status message is shown on the card.                                          |
| 5   | Register button disabled or hidden when `registered >= capacity`                | Yes          | Button and fields are disabled and a Full badge is shown; confirm this reading. |
| 6   | `POST .../registrations` accepts `{ name, email }` and returns 201 with details | Yes          | Present; response shape needs confirming (see ambiguities).                     |
| 7   | 400 if required fields missing                                                  | Yes          | Present; also covers invalid and over-long values.                              |
| 8   | 409 if session is full                                                          | Yes          | Present via the conditional increment.                                          |
| 9   | 404 if session does not exist                                                   | Yes          | Present; ordering against 400 is undefined.                                     |
