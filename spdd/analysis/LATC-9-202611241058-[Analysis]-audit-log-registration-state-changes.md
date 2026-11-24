# SPDD Analysis: Audit Log for Registration State Changes

## Original Business Requirement

# LATC-9: Audit log for registration state changes

- Original key: LATC-9
- Working copy key: LATC-131 ("Mufiz - Audit log for registration state changes"), moved to In Progress
- Status (original): Backlog
- Link: https://thoughtworks.atlassian.net/browse/LATC-9

## Description

_Migrated from WH-9_

### Context

For compliance and debugging, every state change to a registration should be recorded. An audit log captures who did what and when, and provides a full history for each registration lifecycle.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As a training organiser, I want an audit log of every state change to a registration so that I can trace the full history of a registration for reporting or dispute resolution.

Each state change (registered, waitlisted, promoted, cancelled) creates an immutable audit log entry. The organiser queries the audit log via the API.

### Acceptance Criteria

**Organiser workflow:**

* The organiser opens the session registrations page (WH-6) and identifies the registration ID they want to investigate
* The organiser calls `GET /api/training-sessions/:id/registrations/:registrationId/audit` to see the full state history
* The response shows a time-ordered list of transitions, e.g.:

    * `null → confirmed` (registered)
    * `confirmed → cancelled` (cancelled)
    * _(for a different registration)_ `null → waitlisted` then `waitlisted → confirmed` (promoted)

* This gives the organiser a complete picture of every state a registration has been through

**Data and API behaviour:**

* An `AuditLog` table is created with: `id`, `registrationId`, `fromStatus`, `toStatus`, `changedAt`, `reason` (optional string)
* Every registration state change creates an audit log entry atomically within the same transaction
* `GET /api/training-sessions/:id/registrations/:registrationId/audit` returns the full audit history in chronological order
* Audit entries are immutable: they cannot be updated or deleted via the API
* Returns HTTP 404 if the registration does not exist
* The audit log captures all transitions: initial registration, promotion, cancellation

### Out of Scope

* User identity / actor tracking (no auth in this training)
* Audit log UI page (API only is sufficient for training)
* Log rotation or archival

### Suggested Tests

* Register → audit entry created with `fromStatus: null`, `toStatus: "confirmed"`
* Waitlist registration → audit entry with `fromStatus: null`, `toStatus: "waitlisted"`
* Promotion → audit entry with `fromStatus: "waitlisted"`, `toStatus: "confirmed"`
* Cancellation → audit entry with `fromStatus: "confirmed"`, `toStatus: "cancelled"`
* `GET .../audit` returns full history in chronological order
* Audit entries not modified after creation

### Implementation Hint

Add the `AuditLog` Prisma model and create entries inside each Prisma transaction that modifies registration status.

## Domain Concept Identification

### Domain Concept Identification

#### Existing Concepts (from codebase)
- Registration: an employee's claim on a training session, with a status lifecycle (confirmed, waitlisted, cancelled); belongs to a TrainingSession. Status is a plain string column (SQLite, no enums).
- TrainingSession: owns capacity and a `registered` seat counter; changed in the same transactions as registration status.
- Registration state transitions: today there are exactly three write points, all in the registration repository and all inside Prisma transactions: (1) create as confirmed (seat claimed), (2) create as waitlisted (session full), (3) cancel (soft cancel, status set to cancelled) together with promotion of the first waitlisted registration to confirmed in the same transaction.
- Waitlist promotion: a transition of the first waitlisted registration to confirmed, triggered only from the cancellation transaction.
- Organiser registrations view (LATC-6): the existing roster endpoint where an organiser finds registration ids; the audit endpoint extends the same `/api/training-sessions/:id/registrations/...` family.

#### New Concepts Required
- AuditLog entry: an immutable record of one registration transition (from-state, to-state, time, optional reason); belongs to exactly one Registration and is written in the same unit of work as the transition.
- Registration audit history: the chronologically ordered view of all AuditLog entries for one registration, exposed read-only to the organiser.
- Transition reason: optional free-text label describing why the change happened (for example registered, waitlisted, promoted, cancelled).

#### Key Business Rules
- Every status change creates exactly one audit entry, atomically with the change: no entry without a change, no change without an entry (Registration, AuditLog).
- Initial creation is a transition from "no status" (null) to confirmed or waitlisted (AuditLog).
- Promotion is recorded as waitlisted to confirmed on the promoted registration; cancellation is recorded on the cancelled registration, so one cancel can write two entries (two different registrations) (AuditLog).
- Entries are immutable: the API exposes no update or delete (AuditLog).
- History is returned in chronological order (AuditLog).
- Unknown registration returns 404 (Registration).
- Implicit: rejected attempts (deadline passed, already cancelled, session not found) are not state changes and must produce no entry.
- Implicit: audit entries must follow the registration's lifecycle without being lost when a registration is cancelled (cancel is a soft delete, so no cascade concern today).

## Strategic Approach

### Strategic Approach

#### Solution Direction
- Add an AuditLog model related to Registration in the Prisma schema, following the existing schema conventions (autoincrement id, snake_case `@@map` table, index on the foreign key).
- Record entries inside the existing repository transactions at the three write points, so atomicity comes for free from the existing `$transaction` usage. Data flow for writes: route, service, repository transaction (status change plus audit entry).
- Add a read path following the established layering: route (id parsing, error mapping) calls a service function (id validation, maps not_found to RegistrationNotFoundError) which calls a repository query; routes never touch Prisma for this.
- Reuse the existing error classes and the `{ error }` response format; 404 reuses RegistrationNotFoundError. Registration is looked up scoped to both session id and registration id, as `getRegistration` does.
- Delivery follows Red-Green-Refactor with unit tests (mocked repository/transaction, like existing unit tests) and integration tests against the database.

#### Key Design Decisions
- Where to write entries: in the repository transactions (explicit calls at each write point) versus a Prisma client extension or middleware. Explicit calls are visible and testable and match current code; middleware would be implicit and awkward with raw SQL and `updateMany`. Recommend explicit calls from a small shared helper used by all write points.
- Reason values: the story says optional string. Recommend populating a short consistent label (registered, waitlisted, promoted, cancelled) for every entry so the output is self-describing; null remains allowed by the schema.
- Chronological ordering key: by changedAt then id as tiebreaker, because several entries can share a timestamp inside one transaction or one millisecond. This mirrors the createdAt-then-id convention already used for waitlist order.
- Immutability: enforced by exposing no write endpoints and no repository update/delete functions for AuditLog. Database-level enforcement (triggers) is not recommended for this training scope.
- Response shape for the history: a plain ordered list of transitions, consistent with other endpoints returning direct JSON; exact shape is deferred to the canvas.
- Seeded data: seed registrations (if any are added) would have no history; accepted and noted rather than backfilled.

#### Alternatives Considered
- Database triggers to write audit rows: guarantees coverage but is invisible to the app, not portable, and untestable with the current unit-test approach. Rejected.
- Event-based, after-commit audit writing: violates the requirement that the entry is atomic with the change, and could lose entries on failure. Rejected.
- Reconstruct history from registration timestamps instead of a table: cannot capture transitions or promotion time. Rejected.

## Risk & Gap Analysis

### Risk & Gap Analysis

#### Requirement Ambiguities
- Response shape: the story shows examples such as `null → confirmed (registered)` but does not specify field names or whether the reason is included. Default chosen: return entries with the table fields (id, registrationId, fromStatus, toStatus, changedAt, reason) as a list.
- Empty history: a registration that exists but predates the feature (for example seeded or existing rows) has no entries. Default chosen: return 200 with an empty list, not 404.
- Session mismatch: if the registration exists but belongs to a different session than in the URL. Default chosen: 404, consistent with the existing registration lookup.
- Invalid ids (non-numeric, zero, negative): not specified. Default chosen: 400 following the existing routes and service validation.
- Whether a cancelled registration's history is still readable: story implies yes (cancel appears in the example history). Default chosen: yes.
- Reason text: no fixed vocabulary is specified. Default chosen: registered, waitlisted, promoted, cancelled.

#### Edge Cases
- Cancelling a confirmed registration with a waiting person writes two entries in one transaction (confirmed to cancelled; waitlisted to confirmed on the other registration): both must commit or roll back together.
- Cancelling a waitlisted registration: transition waitlisted to cancelled, no promotion and no seat release; must still be audited (the story lists only confirmed to cancelled, so this is a coverage gap).
- Concurrent cancels or competing promotion attempts: the existing conditional updates skip losers; audit entries must be written only when the update actually changed a row, otherwise duplicates or false entries appear.
- Promotion loop retries: only the candidate that was actually promoted gets an entry.
- Rejected operations (deadline passed, already cancelled, not found) must leave no audit row.
- Same-timestamp entries within one transaction: ordering needs the id tiebreaker.

#### Technical Risks
- Missed write point: any future or overlooked status write would silently skip auditing. Mitigation: route all status writes through the shared audit-aware helper and cover each transition with a test.
- Raw SQL and `updateMany` paths do not return row ids, so the repository must already hold the registration id before writing the entry; the promotion path currently knows the candidate id, which is sufficient.
- SQLite single-writer transactions: extra inserts lengthen write transactions slightly; existing generous timeout limits are adequate for training load.
- Existing unit tests mock the transaction client with specific methods; adding an audit insert will require updating those mocks, so expect broad test churn in the registration repository unit tests.
- Schema change requires `prisma db push` and client regeneration; `database/dev.db` is untracked and local, so developers need to re-run setup.
- Seed script deletes registrations with `deleteMany`; the new table has a foreign key to registrations, so the seed cleanup must delete audit entries first or the seed will fail on a populated database.
- Pre-existing issues out of scope: the `/search` route uses unsafe raw SQL (marked as an intentional security seed) and is not touched by this story.

#### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Organiser identifies registration id from the session registrations page (WH-6) | Yes | Existing roster endpoint already exposes ids; no change needed |
| 2 | Organiser calls GET .../registrations/:registrationId/audit for full state history | Yes | New read endpoint; shape unspecified (default chosen) |
| 3 | Response is a time-ordered list of transitions, including promotion examples | Yes | Ordering by changedAt then id |
| 4 | Organiser sees every state a registration has been through | Yes | Depends on all write points being audited, including waitlisted-to-cancelled |
| 5 | AuditLog table with id, registrationId, fromStatus, toStatus, changedAt, optional reason | Yes | New Prisma model; fromStatus nullable |
| 6 | Every state change creates an entry atomically in the same transaction | Yes | Three write points inside existing transactions |
| 7 | GET returns full history chronologically | Yes | Same as AC 3 |
| 8 | Entries immutable, no update or delete via API | Yes | No write endpoints or repository mutators exposed |
| 9 | HTTP 404 if registration does not exist | Yes | Reuse RegistrationNotFoundError; session-mismatch also 404 |
| 10 | Captures initial registration, promotion, cancellation | Yes | Plus waitlisted initial and waitlisted-to-cancelled (gap noted) |
