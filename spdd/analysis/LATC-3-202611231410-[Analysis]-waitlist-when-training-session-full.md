# SPDD Analysis: Waitlist When a Training Session Is Full

## Original Business Requirement

Source: Jira card LATC-3 (https://thoughtworks.atlassian.net/browse/LATC-3), status Backlog, priority Medium, label `migrated-from-WH`. The card was read directly from Jira because the command was given only the key `LATC-3`.

**Summary:** Waitlist when a training session is full

_Migrated from WH-3_

### Context

After WH-2 is implemented, a session can fill up. When a session reaches capacity, subsequent employees who want to attend should be placed on a waitlist rather than being turned away. This ensures demand is captured and can be fulfilled if a registered employee cancels (WH-4 → WH-5).

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As an employee, I want to join a waitlist for a full training session so that I can attend if a place becomes available.

When a session is full, an employee can join the waitlist. The system records their position and informs them they are waitlisted, not confirmed.

### Acceptance Criteria

- When `registered >= capacity`, new registrations are added to the waitlist
- The waitlisted employee sees a message confirming they are waitlisted (not confirmed)
- The session card shows a "Join Waitlist" option when the session is full
- `POST /api/training-sessions/:id/registrations` returns HTTP 202 with `{ status: "waitlisted", position: N }` when full
- Waitlisted registrations have status `waitlisted` in the database
- Confirmed registrations have status `confirmed`

### Out of Scope

- Promotion from waitlist (WH-5)
- Cancellation (WH-4)
- Email notification (WH-8)
- Maximum waitlist size

### Suggested Tests

- `POST` when session is full → 202 with `status: "waitlisted"`
- `POST` when session has space → 201 with `status: "confirmed"`
- Waitlisted count is tracked separately from registered count
- Position in waitlist is correct (1st, 2nd, etc.)

### Data Model Hint

The `Registration` model should include a `status` field: `confirmed | waitlisted | cancelled`.

## Domain Concept Identification

Project fingerprint: pnpm monorepo with an Express + Prisma (SQLite) API layered as routes → services → repositories, and a React + TypeScript (Vite) web app. Typed domain errors are mapped to HTTP statuses in the route. Jest covers the API at unit and integration level. The web app uses component and page tests.

Codebase finding: LATC-2 (registration) is already implemented. The registration path currently treats "full" as a hard failure: a single conditional seat claim, then an error that becomes HTTP 409. LATC-3 changes the meaning of "full" from rejection to waitlisting, so it **replaces** existing 409 behaviour rather than adding to a blank area. Existing tests, the card UI, and the page's success handling all encode the 409 assumption.

### Existing Concepts (from codebase)

- **Training Session**: a bookable workshop with fixed capacity and a stored count of confirmed seats. It owns the seat count and is the parent of registrations.
- **Registration**: a record of one employee (name, email) tied to one session. Today every registration is implicitly a confirmed seat, and it carries no status.
- **Seat Claim (capacity guard)**: the atomic rule that increments the seat count only while capacity remains. It is the point where "full" is currently detected.
- **Session Full outcome**: today a rejection (409). It becomes the trigger for waitlisting.
- **Session Card / Registration Form**: the per-session UI. It currently disables the form and shows a "Full" badge when full. The page updates the displayed count after success.

### New Concepts Required

- **Registration Status**: whether a registration is confirmed, waitlisted, or cancelled. Only confirmed and waitlisted are produced in this story. The hint says the model should also allow cancelled so WH-4 can use it later. It attaches to Registration.
- **Waitlist**: the ordered set of waitlisted registrations for a session. It is derived from Registration Status rather than being a separate entity, and it is tracked separately from the registered count.
- **Waitlist Position**: the employee's place in line (1st, 2nd, …). It is created at join time and reported back to the employee.
- **Registration Outcome (confirmed vs. waitlisted)**: the two results of a registration attempt, each with its own success message and HTTP status.

### Key Business Rules

- **Full means waitlist, not rejection**: when `registered >= capacity`, a new registration is waitlisted — governs Training Session and Registration.
- **Confirmed seats are capped; waitlist is not**: only confirmed registrations count toward `registered`, and there is no maximum waitlist size (out of scope) — governs Training Session and Waitlist.
- **Separate counting**: the waitlisted count is tracked separately from the registered count — governs Registration Status.
- **Position order**: position follows join order (first to join is first in line) and must stay correct under concurrent joins — governs Waitlist Position.
- **Employees must be told which state they are in**: confirmed and waitlisted show different messages, and waitlisted must read as "not confirmed" — governs the UI.
- **Implicit: existing registrations are confirmed**: records created under LATC-2 must be read as confirmed once status exists.
- **Implicit: only confirmed registrations hold seats**: waitlisted and cancelled registrations must never increase `registered`.
- **Implicit: same input rules apply**: name and email validation from LATC-2 applies equally to waitlist joins.

## Strategic Approach

### Solution Direction

- Extend the existing registration flow instead of adding a second endpoint. The same `POST .../registrations` now returns one of two successful outcomes: a confirmed registration (201) or a waitlisted one with its position (202).
- Data flow: web form → registration endpoint → service validates input → repository attempts the atomic seat claim → on success record a confirmed registration, otherwise record a waitlisted registration with the next position, all in the same transaction → response states the outcome → the card shows the matching message.
- Keep the layering norm: the route maps outcomes to statuses, the service validates and translates, and the repository owns the transaction. No direct database access from routes.
- Introduce Registration Status on the existing Registration, with existing rows defaulting to confirmed so current data and behaviour stay valid.
- On the UI, the full-session card moves from "disabled form" to "Join Waitlist": the form stays usable, the button is relabelled, and the waitlisted outcome shows a distinct "you are on the waitlist, not confirmed" message with the position.

### Key Design Decisions

- **Store position or derive it**: storing a position number is simple to read but can drift when WH-4/WH-5 remove or promote people. Deriving it from join order is always consistent but costs a query → recommend deriving from join order within the session, which matches how WH-5 will promote, and report it at join time. Needs confirmation (see ambiguities).
- **Waitlisted count storage**: a stored counter on the session mirrors `registered` but adds another value to keep consistent. Computing it from registrations is accurate and cheap at this scale → recommend computing it, so there is one source of truth. Only `registered` stays a stored counter.
- **One endpoint with two outcomes vs. a separate waitlist endpoint**: the story specifies the same endpoint returning 202 → keep one endpoint, which also keeps the form simple.
- **Atomicity for the waitlist path**: two concurrent joins must not receive the same position, and a seat freed or claimed mid-request must not misclassify someone. Decide the outcome inside the same transaction as the seat claim → recommend that, extending the LATC-2 race protection to the waitlist.
- **Status values**: use the three values from the hint (confirmed, waitlisted, cancelled), even though cancelled is unused here, so WH-4 does not need another model change. Cancelled is not produced in this story.
- **Existing 409 behaviour**: the full-session 409 stops being returned. Its tests and the UI error path must be intentionally replaced, not left contradicting the new behaviour.

### Alternatives Considered

- **A separate `Waitlist` table**: cleaner separation but duplicates identity data and complicates promotion in WH-5 → rejected in favour of a status on Registration, as the hint suggests.
- **Keep 409 for full sessions and add a distinct waitlist endpoint**: contradicts the AC that the same endpoint returns 202 → rejected.
- **Stored waitlist counter and stored position**: faster reads but a second and third value to keep consistent across WH-4/WH-5 → rejected for now.
- **Cap the waitlist size**: explicitly out of scope → rejected.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Meaning of "position N"**: whether position counts only active waitlisted people, and whether it is fixed at join time or recomputed later. Since cancellation and promotion are out of scope, both readings give the same number today, but the choice affects WH-4/WH-5.
- **201 vs. 202 response bodies**: the 202 shape is given (`status`, `position`), but the 201 shape is only implied to include `status: "confirmed"`. Whether the 201 body keeps the LATC-2 fields (registration details, updated count and capacity) and whether the 202 body also carries registration details is not stated.
- **Do waitlisted people see updated counts?** The card's displayed `registered` should not change after a waitlist join. The response and UI must make sure it does not.
- **Duplicate people**: the same email joining the waitlist, or joining both confirmed and waitlisted for one session. Duplicate prevention was out of scope in LATC-2, and it is not addressed here either.
- **Non-active sessions**: whether a session whose status is not `active` can have a waitlist. This was open in LATC-2 too.
- **"Join Waitlist" interaction**: whether the full card keeps the same name and email form with a relabelled button, or opens something different. The AC only says the card "shows a 'Join Waitlist' option".
- **Existing "Full" badge and the removed 409**: the card currently signals "Full" and disables the form. The story implies the form is now active when full. Whether the badge stays is not stated.

### Edge Cases

- **Last-seat race**: a seat is claimed and the session becomes full at the same moment another request arrives. Exactly one request is confirmed, and the others must be waitlisted with distinct, consecutive positions.
- **Concurrent waitlist joins**: two joins at once must not receive the same position or skip numbers.
- **Stale UI**: a card that shows seats left may submit after the session fills. The employee should see a waitlisted outcome, not an error. The reverse (card shows full, seat now free) means the request is confirmed, and the message must say so.
- **Count display after waitlisting**: the card must not show an inflated `registered` value.
- **Existing data**: registrations created before this story have no status and must be treated as confirmed.
- **Oversized or invalid input on a waitlist join**: must be rejected with 400 and must not create a waitlist entry.
- **Non-existent session**: still 404, with no waitlist entry created.

### Technical Risks

- **Schema change on live data**: adding a status to Registration needs a safe default for existing rows. A missing default would leave current registrations without a status and break the "confirmed" meaning. Mitigation direction: default to confirmed.
- **Contract change for clients**: the endpoint now has two success statuses. The web page treats any non-OK response as an error. A 202 is OK at the HTTP level, so it would be handled as a success and the page would try to update the card using the same fields. This risks showing wrong counts or a wrong message unless the page branches on outcome.
- **Concurrency on a single-writer store**: SQLite serialises writers, which helps correctness but means waitlist joins queue behind seat claims. The generous transaction limits already in place may hide slow requests.
- **Replacing, not adding, tests**: the current unit and integration tests assert 409 for a full session, including the concurrency test that expects exactly the overflow requests to receive 409. These must be rewritten to the new contract, and the overbooking guarantee (`registered` never exceeds `capacity`) must be preserved.
- **Position under future change**: if position is derived from join order, cancellation (WH-4) and promotion (WH-5) will change it. The design should not block those stories.
- **Unrelated norm violation in the same route file**: the sessions route imports the database client directly for the keyword search endpoint (a deliberate security seed). It is outside this story, but edits to that file should not widen the issue.

### Acceptance Criteria Coverage

| AC# | Description                                                                                 | Addressable? | Gaps/Notes                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | When `registered >= capacity`, new registrations are added to the waitlist                  | Yes          | Replaces the current 409 path with waitlisting; position handling must be atomic.                                        |
| 2   | Waitlisted employee sees a message confirming they are waitlisted (not confirmed)           | Yes          | The page's success handling must branch on outcome; message wording not specified.                                       |
| 3   | Session card shows a "Join Waitlist" option when full                                       | Partial      | The current card disables the form when full. The intended interaction and the fate of the "Full" badge are unspecified. |
| 4   | `POST .../registrations` returns 202 with `{ status: "waitlisted", position: N }` when full | Yes          | Whether extra fields accompany `status` and `position` is unspecified.                                                   |
| 5   | Waitlisted registrations have status `waitlisted` in the database                           | Yes          | Needs the new status on Registration.                                                                                    |
| 6   | Confirmed registrations have status `confirmed`                                             | Yes          | Needs a default so existing rows read as confirmed.                                                                      |

The Suggested Tests are also addressable. "Waitlisted count is tracked separately from registered count" is satisfied by deriving the waitlist count from registration status.
