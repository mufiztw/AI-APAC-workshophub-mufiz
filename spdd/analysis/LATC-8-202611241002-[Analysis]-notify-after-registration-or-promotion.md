# SPDD Analysis: Send Notification After Registration or Waitlist Promotion

## Original Business Requirement

# LATC-8: Send notification after registration or waitlist promotion

- **Original card:** LATC-8
- **Working copy:** LATC-115 ("Mufiz - Send notification after registration or waitlist promotion")
- **Status (original):** Backlog
- **Link:** https://thoughtworks.atlassian.net/browse/LATC-8

## Description

_Migrated from WH-8_

### Context

Employees should receive feedback when they successfully register or are promoted from the waitlist. This confirmation helps them know their seat is secured without needing to check back.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As an employee, I want to receive a notification when I register or am promoted from the waitlist so that I know my seat is confirmed.

For training simplicity, the in-app UI shows a success banner immediately after the action. A backend notification (console log or Slack webhook) fires as a side effect and does not block the response.

### Acceptance Criteria

**User interactions (in-app feedback):**

- After successfully registering (confirmed), the page shows a success banner: "You're registered! \[Session title\] on \[formatted date\]"
- After joining the waitlist, the page shows: "You're on the waitlist for \[Session title\]. We'll let you know if a spot opens up."
- Both banners appear immediately after the form is submitted without a page reload
- The banners can be dismissed by the user or auto-dismiss after a few seconds
- If the backend notification fails, the banner still appears (notification failure is silent)

**Backend notification:**

- After a successful registration (`confirmed`), a notification event is emitted on the server
- After a waitlist promotion (`confirmed` via WH-5), a notification event is emitted on the server
- The notification includes: employee name, email, session title, session date, status (`confirmed` or `promoted`)
- For baseline: notification is logged to the server console
- Optional extension: if `SLACK_WEBHOOK_URL` is set in the environment, a Slack message is sent to the configured channel
- Notification failures must not fail the registration or promotion (fire-and-forget)

### Out of Scope

- Real email delivery
- SMS notifications
- Notification for cancellation
- Notification history or inbox

### Suggested Tests

- Registration success → success banner shown in UI
- Waitlist registration → waitlist banner shown in UI
- Registration success → notification logged with correct employee and session details
- Waitlist promotion → notification logged
- Notification failure does not affect API response
- Slack notification sent when `SLACK_WEBHOOK_URL` is set (optional, integration test)

### Implementation Hint

Use an event emitter or a simple async side-effect function. The core registration path should not `await` the notification.

## Domain Concept Identification

### Domain Concept Identification

#### Existing Concepts (from codebase)
- **Registration**: an employee's claim on a session, with a status of confirmed, waitlisted or cancelled. It carries name and email, so it already holds everything a notification needs about the employee.
- **Training Session**: the workshop being registered for (title, date, capacity, registered count). It supplies the title and date for the message.
- **Waitlist Promotion hand-off**: a deliberate, currently empty extension point that runs after a promotion is committed (`onRegistrationPromoted` in `api/src/services/waitlistPromotion.ts`). LATC-5 left it for this story. It receives only the session id and registration id, not the employee or session details.
- **Registration flow in the UI**: the session card form already shows a per-card inline confirmation message after register or join-waitlist, in the same fixed wording as before. It is not the banner specified here, and it does not show the date.
- **Environment-driven config**: the API reads env vars (`APP_PORT`, `DATABASE_URL`). Nothing uses `SLACK_WEBHOOK_URL` yet.

#### New Concepts Required
- **Notification event**: a business fact ("employee X is confirmed for session Y"), carrying employee name, email, session title, session date and an outcome kind (`confirmed` or `promoted`). It is distinct from the registration record and is not persisted.
- **Notification channel**: where the event is delivered. The baseline channel is the server console. A Slack channel is optional and only active when configured.
- **In-app banner**: a transient, dismissible and auto-dismissing success message shown after the form submission, with distinct wording for confirmed and waitlisted outcomes.

#### Key Business Rules
- A notification is emitted only for outcomes that give a seat: direct confirmation and waitlist promotion. Joining the waitlist produces an in-app banner but no backend notification (the ACs list only `confirmed` and `promoted`). Cancellation produces none (out of scope).
- Notification delivery is strictly best-effort. A failure must never change the registration or promotion result and must never reach the HTTP response (registration, promotion) or the banner.
- Events fire only after the registration or promotion is durably committed, never inside the transaction, so a rolled-back or failed action never announces a seat.
- Notification status vocabulary (`confirmed` / `promoted`) differs from the registration status vocabulary (`confirmed` / `waitlisted` / `cancelled`). `promoted` is a notification kind only, not a stored status.

## Strategic Approach

### Strategic Approach

#### Solution Direction
- Backend: introduce a small notification service behind the existing service layer. The registration service emits a "confirmed" event after a successful confirmed registration, and the existing promotion hand-off emits a "promoted" event. The service layer owns this, in line with the "no Prisma in routes" norm. The notifier logs to the console and, only when `SLACK_WEBHOOK_URL` is set, also posts to Slack.
- Dispatch is fire-and-forget. The caller does not await delivery, and any error (sync or async) is caught and logged inside the notifier, so it can never surface to the request.
- The promotion hand-off needs the promoted employee's and session's details. These are loaded after the commit, from the promoted registration id it already receives.
- Frontend: add a banner on the sessions page, driven by the result of the existing register call. It shows confirmed or waitlisted wording, supports manual dismissal and auto-dismissal, and does not depend on any notification outcome.
- Data flow: `POST registration → commit → response returned → notification dispatched in the background`. Promotion follows the same shape via the cancel path.

#### Key Design Decisions
- **Event emitter vs plain async function**: an emitter decouples producers from channels, but adds indirection for two producers and two channels. A plain, non-awaited function with an internal try/catch is simpler and testable → recommend the plain function (the story's hint allows both), keeping a single notifier entry point so a bus can be added later.
- **Where the notification is triggered**: in the service layer after the repository transaction returns (consistent with how LATC-5 calls `onRegistrationPromoted` after commit), not inside the transaction → keeps the guarantee "no announcement of an uncommitted seat".
- **Banner placement**: the existing inline per-card message is the current feedback. A page-level banner is what the AC describes ("the page shows"). Recommend a page-level banner on the sessions page, replacing the card's inline success message so the user does not see two success messages for one action. Error messages stay inline.
- **Auto-dismiss duration**: AC says "a few seconds" → recommend a single named constant, around 5s, with manual dismiss as well.
- **Slack**: treat as optional and isolated behind the env var, with a short timeout, so a slow webhook cannot hold resources. No new dependency is needed since the runtime fetch is sufficient on the current Node.

#### Alternatives Considered
- **Await notification then respond**: rejected, it directly violates the fire-and-forget rule and would let Slack latency or failure affect registration.
- **Persist notifications (outbox table)**: gives reliability, but notification history is explicitly out of scope and it would require a schema change.
- **Server returns the banner text**: rejected, the client already has session title and date and can format locally. Keeping wording in the UI avoids coupling the API contract to copy.
- **Notify from the route layer**: rejected, it splits business flow across layers and the promotion path does not pass through a route handler's registration call.

## Risk & Gap Analysis

### Risk & Gap Analysis

#### Requirement Ambiguities
- **Waitlist notification on the backend**: the Description says the user is told when they join the waitlist, but the backend ACs only cover `confirmed` and `promoted`. Assumed: no backend notification when joining the waitlist (UI banner only). Needs confirmation.
- **Status value `promoted`**: the notification carries `promoted`, while the stored status is `confirmed`. Needs agreement that this is a notification-only label.
- **"Formatted date" in the registered banner**: no format is given. The existing UI formats dates with the `en-SG` locale in long form. Assumed: reuse that, date only (no time).
- **Banner vs existing inline message**: the existing inline success text differs from the new wording. Existing tests assert the old text, so they must be updated, and the old inline success message should be removed or replaced. Needs confirmation of replace vs coexist.
- **Banner scope**: "the page shows" is taken to mean the sessions list page, where the form lives. The detail page has no registration form.
- **Slack message format and channel**: unspecified. Assumed a single plain-text line carrying the same fields. The AC lists email as a notification field, and posting it to Slack is a privacy decision to confirm.
- **Where the console log goes and its format**: unspecified. Assumed one structured log line per event via `console.log`.

#### Edge Cases
- **Promotion race / no promotion**: the hand-off is only called when a promotion actually happened. If the promoted registration is gone or no longer confirmed by the time details are loaded, the notifier must skip silently.
- **Unconfigured or failing Slack**: unset var means console only. A set but unreachable or slow webhook must not delay or fail anything, including process-level unhandled rejections.
- **Duplicate notifications**: a retried client request creates a second registration (no idempotency exists), so it would also notify. This is consistent with current behaviour, but worth noting.
- **Banner stacking**: several quick actions on different cards. Needs a rule: a new banner replaces the previous one.
- **Auto-dismiss vs unmount**: the timer must be cleaned up on unmount or replacement to avoid stale updates and flaky tests.
- **Failed registration**: no banner and no notification, only the existing inline error.
- **Cancellation of a promoted seat**: out of scope, no notification.
- **Session date in the past or time zones**: the server logs the stored UTC instant, the banner shows the user's locale date. They may differ by day near midnight.

#### Technical Risks
- **Unhandled rejections from fire-and-forget**: a non-awaited promise that rejects can crash a Node process on modern runtimes. Mitigation direction: all failures are caught inside the notifier, and synchronous throws are guarded at the call site.
- **Test leakage**: console logging in unit tests adds noise, and background work can outlive a test. Mitigation: the notifier is injectable or mockable, and tests await its completion deterministically.
- **Promotion hand-off signature**: it receives only ids, so the notifier needs an extra read after commit. The extra query must not be able to fail the cancel response (guard and swallow).
- **Existing await in cancel path**: the cancel service currently awaits `onRegistrationPromoted`. It must be changed to not block on delivery, otherwise a slow Slack call would delay the cancel response.
- **Secrets**: the Slack webhook URL is a secret. It must come only from the environment, never be logged or committed, and `.env` files stay off-limits to agents. There is currently no `.env.example` entry for it.
- **PII in logs**: the notification includes name and email in server logs. Acceptable per the story, but worth flagging for the security review.

#### Acceptance Criteria Coverage
| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Confirmed banner "You're registered! [title] on [date]" | Yes | Date format assumed (see ambiguities); replaces the existing inline message |
| 2 | Waitlist banner wording | Yes | Replaces the existing waitlist text, which also showed position |
| 3 | Banners appear immediately, no reload | Yes | Driven by the existing register response |
| 4 | Dismissible or auto-dismiss | Yes | Both recommended; duration to confirm |
| 5 | Banner shown even if notification fails | Yes | Banner depends only on the register response, never on notification delivery |
| 6 | Event emitted on confirmed registration | Yes | Emitted after commit in the service layer |
| 7 | Event emitted on waitlist promotion | Yes | Via the existing hand-off; needs a post-commit read of employee and session details |
| 8 | Notification includes name, email, title, date, status | Yes | `promoted` is a notification-only label |
| 9 | Baseline: logged to console | Yes | Format assumed |
| 10 | Optional Slack via `SLACK_WEBHOOK_URL` | Partial | Message format, channel and email-in-Slack privacy unspecified |
| 11 | Failures must not fail registration or promotion | Yes | Needs an explicit guard against unhandled rejections |
