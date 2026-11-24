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
