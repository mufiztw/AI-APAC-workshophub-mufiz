# SPDD Analysis: Organiser Views Registrations For A Session

## Original Business Requirement

## LATC-6: Organiser can view registrations for a session

- **Original card:** LATC-6 (https://thoughtworks.atlassian.net/browse/LATC-6), status Backlog, left unchanged
- **Working copy:** LATC-76 (https://thoughtworks.atlassian.net/browse/LATC-76), status In Progress

_Migrated from WH-6_

### Context

Training organisers need visibility into who has registered for each session. They need to see confirmed registrations and the waitlist to prepare for delivery and communicate with participants.

This is a **trainee exercise story**. It is not implemented in the baseline template.

### Description

As a training organiser, I want to view the list of registrations for a session so that I can see who is attending and who is waitlisted.

### Acceptance Criteria

**User interactions:**

- Clicking on a session card navigates the user to a session detail page (e.g., `/sessions/:id`)
- The session detail page shows full session info (title, date, location, description) plus a "Registrations" section below
- The Registrations section has two subsections: **Confirmed (N)** and **Waitlist (N)**
- Each entry in both subsections shows: registrant name, email, and registration date
- When both sections are empty, the page shows "No registrations yet"
- Cancelled registrations are not shown
- The page is accessible to anyone without login (consistent with the no-auth training model)

**API behaviour:**

- `GET /api/training-sessions/:id/registrations` returns HTTP 200 with the full registration list
- The response includes separate arrays for `confirmed` and `waitlisted` registrations
- Each registration includes: `id`, `name`, `email`, `status`, `createdAt`
- Cancelled registrations are excluded from the response
- Returns HTTP 404 if the session does not exist

### Out of Scope

- Authentication or role-based access control
- Export to CSV or other formats
- Editing or cancelling registrations via this view
- Pagination

### Suggested Tests

- `GET /api/training-sessions/1/registrations` → 200 with confirmed and waitlisted arrays
- Cancelled registrations not included in response
- Returns 404 for unknown session
- Response includes name, email, status per registration

## Domain Concept Identification

### Existing Concepts (from codebase)

- **Training Session**: a bookable workshop with capacity and a running seat count — owns its registrations. Already exposed as a list and as a single-session read (`GET /api/training-sessions/:id`), which the detail page can reuse for its header information.
- **Registration**: one person's claim on a session, with a status of confirmed, waitlisted or cancelled. Cancellation is a soft status change, so cancelled rows remain in storage and must be filtered out by this feature. Indexed by session and status, so the read is cheap.
- **Waitlist order**: position is derived from join order (creation time, then id), as used by registration, cancellation and promotion. This feature should present the waitlist in that same order so what the organiser sees agrees with the positions and promotions employees experience.
- **Session card (UI)**: today a self-contained registration surface with form, cancel and status lookup. It has no navigation behaviour.
- **Layering convention**: routes → services → repositories, with typed domain errors mapped to HTTP codes in the route. A single session already has a "not found" path.

### New Concepts Required

- **Session roster**: a read-only view of a session's active registrations, split into confirmed and waitlisted groups. A projection of existing Registration data, not new storage.
- **Session detail page (UI)**: a new screen for one session combining session info and its roster.
- **Page navigation (UI)**: the web app currently renders a single page with no routing at all, so a notion of "which page am I on, for which session" is new.

### Key Business Rules

- Cancelled registrations never appear in the roster (Registration).
- Confirmed and waitlisted are separate groups, each with a count shown in its heading (Roster).
- The roster of a non-existent session is "not found", not an empty roster (Training Session).
- An empty roster (both groups empty) shows a single "No registrations yet" message (Roster).
- Waitlist order should match promotion order (implicit, Waitlist order).
- Access is open: no authentication, consistent with the rest of the app (explicit).
- Roster is read-only; no cancelling or editing from it (explicit, Out of Scope).

## Strategic Approach

### Solution Direction

- Add a read-only endpoint beside the existing registration endpoints on the training-sessions resource, following the established route → service → repository layering. The service owns the session-existence check and the grouping; only the repository touches the data store.
- Follow the existing flow shape for errors: invalid id → 400, unknown session → 404, otherwise 500 with the existing logging style.
- On the web app, introduce a second page for a single session that loads session info and roster from the API, and make the session card a way into it while the list page stays as it is.
- Data flow: browser opens a session page → fetches session info and roster → renders header, then Confirmed and Waitlist groups.

### Key Design Decisions

- **Client-side navigation mechanism**: a routing library vs. a minimal in-house approach on the browser URL. A library gives `/sessions/:id` deep links, back-button behaviour and test utilities with little code but adds a dependency. A hand-rolled approach avoids the dependency but re-implements routing. → Recommend a standard routing library: the AC explicitly names a URL-addressable page, and the cost is small. Needs team acceptance as it is a new dependency.
- **Where session info comes from**: reuse the existing single-session endpoint plus the new roster endpoint (two calls) vs. embedding session info in the roster response. → Recommend two calls: keeps the roster response exactly as specified in the AC and reuses existing behaviour; the cost is two requests and two loading states.
- **Roster ordering**: order each group by join order (creation time, then id). Matches promotion order and the derived waitlist position; confirmed in the same order is a reasonable default.
- **Reading the roster**: a plain read, no transaction. Slightly stale data under concurrent registration or cancellation is acceptable for a view-only page, and a promotion mid-read can at worst show a person in one group in that response.
- **Session card behaviour**: how to make the card navigate without breaking its form and cancel button. → Recommend a dedicated, clearly labelled link in the card (e.g. on the title) rather than making the whole card clickable; see risk below.

### Alternatives Considered

- **Single combined endpoint returning session plus roster**: rejected, since the AC fixes the roster endpoint's shape and an existing session endpoint already exists.
- **Return all registrations in one list with a status field and let the UI split them**: rejected, as the AC requires separate `confirmed` and `waitlisted` arrays.
- **Show the roster inside the existing list page (expand in place)**: rejected, as the AC requires a separate detail page and URL.
- **Hand-rolled routing**: viable but not recommended, as above.

## Risk & Gap Analysis

### Requirement Ambiguities

- **"Clicking on a session card navigates"**: the card contains a form (name, email, Register, Cancel). If the whole card is clickable, typing or pressing buttons would also navigate unless guarded. Needs a decision: whole card with interactive-element exceptions, or a link area (title). Recommended: link on the title/an explicit "View details" link.
- **Ordering within groups** is unspecified. Assumed join order (oldest first).
- **Response shape beyond the arrays** is unspecified: whether to include counts or the session id. The AC lists only `confirmed` and `waitlisted`; assume no extra fields, with the UI deriving N from array length.
- **Registration date format and timezone** in the UI are unspecified; follow the display style already used for session dates (`en-SG` locale).
- **"Organiser"** has no identity in the system; the page is public to everyone, which also exposes registrants' names and emails to any visitor. This is explicitly accepted by the AC but is a notable privacy trade-off to flag.
- **Invalid id handling** (non-numeric) is not stated; existing routes return 400, so follow that.
- **Hosting deep links**: the production server serves the built frontend with a catch-all to `index.html`, so `/sessions/:id` should work on refresh; the dev server also falls back to `index.html`. Needs verification rather than assumption.

### Edge Cases

- Session with only confirmed, only waitlisted, or neither: each section must still read correctly; "No registrations yet" only when both are empty. Open question: when only one group is empty, show an empty-state line for that group or a bare heading with (0).
- Session id for a deleted/unknown session shown in the browser: page needs a not-found state, distinct from a loading failure.
- A cancelled registrant who re-registers appears as a new entry, so the same email can legitimately appear in both groups' history; only active rows are shown.
- Duplicate registrations by the same email are not prevented by the system today, so the roster can show the same person twice.
- Roster changes while the page is open (cancellation, promotion) are not reflected until reload; no live update is required.
- Very large rosters: pagination is out of scope, so the response is unbounded, which is acceptable at training scale.
- Registration created at the same instant: tie-broken by id for stable order.

### Technical Risks

- **No routing in the web app**: adding navigation touches the app shell and its entry point, and may impact existing page tests that render the page directly. Mitigation: keep the list page component unchanged in behaviour and add routing only around it.
- **Route ordering on the API**: the new path has the same prefix as the existing registration-by-id route; it must not be shadowed by or conflict with `/:id` handlers. Low risk, but must be covered by an integration test.
- **Personal data exposure**: unauthenticated endpoint returns names and emails for any session id. Accepted by scope; mitigation is documenting it and not widening the fields beyond those listed.
- **Existing security seeds** (e.g. the raw SQL search route in the same router) are unrelated and must not be touched or copied.
- **Card refactor risk**: the card has many behaviours and tests (register, waitlist, cancel, lookup); adding navigation must not regress them.
- **Roster consistency with seat count**: counts shown on the detail page come from the roster itself, while the session header's registered number comes from the seat counter; they should agree but are read separately and may briefly differ.

### Acceptance Criteria Coverage

| AC# | Description                                                                     | Addressable? | Gaps/Notes                                                      |
| --- | ------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| 1   | Clicking a session card navigates to `/sessions/:id`                            | Partial      | Needs routing decision and card-click design (form inside card) |
| 2   | Detail page shows title, date, location, description plus Registrations section | Yes          | Reuses existing single-session endpoint                         |
| 3   | Two subsections, Confirmed (N) and Waitlist (N)                                 | Yes          | N derived from list length                                      |
| 4   | Each entry shows name, email, registration date                                 | Yes          | Date format to be aligned with existing display                 |
| 5   | Both empty → "No registrations yet"                                             | Yes          | Per-group empty state unspecified                               |
| 6   | Cancelled registrations not shown                                               | Yes          | Filtered at read time                                           |
| 7   | Page accessible without login                                                   | Yes          | Consistent with current app; privacy caveat noted               |
| 8   | `GET /api/training-sessions/:id/registrations` returns 200 with list            | Yes          | Follows existing layering                                       |
| 9   | Separate `confirmed` and `waitlisted` arrays                                    | Yes          | Ordering unspecified                                            |
| 10  | Each registration includes id, name, email, status, createdAt                   | Yes          | Exclude other fields                                            |
| 11  | Cancelled excluded from response                                                | Yes          | Covered by suggested tests                                      |
| 12  | 404 if session does not exist                                                   | Yes          | Invalid id → 400 follows existing convention                    |
