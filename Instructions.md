# Staffing Agency Management Platform — Build Specification

## 1. Project overview

Build a B2B staffing agency management platform. The agency (tenant) contracts
with **Payers**. Each Payer has multiple **Clients** (physical work sites).
Each Client posts time-based staffing **Requirements**. The agency employs
**Workers** who get rostered against those requirements based on availability,
skill match, and proximity. The system tracks actual worked hours via
clock-in/out, and bills Payers via invoices generated from approved
timesheets, at a shift-by-shift granularity.

Build this as a **modular monolith** (not microservices) for v1 — clean
internal module boundaries so it can be split later, but one deployable
service and one database for now. Multi-tenant from day one: every table
scoped by `agency_id`, even though there is a single agency at launch.

Region/locale defaults: Australia. All monetary amounts default to AUD but
`currency` is a first-class field everywhere money appears (never hardcode
AUD in logic). All datetimes stored as UTC `timestamptz`; every Client and
every date/time-bearing record also carries an IANA timezone string for
correct local display (Australia spans multiple zones and DST rules —
never assume a single national timezone).

## 2. Tech stack (use unless you have a strong reason to deviate — confirm before deviating)

- Backend: Node.js + TypeScript (NestJS or Express+TypeScript), or if you
  prefer, Python + FastAPI — pick one and be consistent throughout.
- Database: PostgreSQL. Use native `EXCLUDE` constraints and `tstzrange`
  where noted below.
- ORM: Prisma (Node) or SQLAlchemy (Python) — must support migrations as
  first-class, versioned, reviewable files.
- Auth: JWT-based, role-based access control (RBAC).
- Frontend: React + TypeScript, a component library (e.g. shadcn/ui or MUI),
  a calendar/scheduling UI library capable of drag-and-drop shift assignment.
- Background jobs: a real job queue (BullMQ+Redis, or equivalent) — required
  for shift generation, invoice batch runs, notification dispatch.
- File generation: a PDF library for invoice generation.

## 3. Domain model — build exactly this schema

Implement every table below. Do not collapse or simplify entities unless
explicitly told to — each shape below encodes a deliberate decision, not a
placeholder. Where a decision is marked `[ASSUMPTION]`, it's my best-practice
default; flag it to me before building if you'd choose differently, otherwise
proceed with it.

### Core org structure
- **Agency**: `id, name, default_currency, created_at`
- **Payer**: `id, agency_id FK, name, contract_terms (json), payment_terms_days, created_at`
- **Client**: `id, payer_id FK, name, address_line, lat, lng, timezone (IANA string), created_at, updated_at`
  - Address/location edits apply live to the record (no historical snapshotting) — confirmed decision. Downstream records reference Client by FK.

### Workers
- **Worker**: `id, agency_id FK, name, email, phone, home_lat, home_lng, status (active/inactive), created_at`
- **Skill**: `id, name, category (nullable)` `[ASSUMPTION: separate join-table model below, not a flat text column on Worker — needed for indexed matching queries. Flag me if you specifically want a single denormalized skills column instead.]`
- **WorkerSkill**: `id, worker_id FK, skill_id FK, certified_at, expires_at (nullable)`
- **WorkerAvailability**: `id, worker_id FK, day_of_week (nullable), specific_date (nullable), start_time, end_time, is_available (bool)`
  - `day_of_week` set = recurring rule. `specific_date` set = one-off override/exception (can mark a normally-available day unavailable without touching the recurring rule).
- **WageRate**: `id, worker_id FK, currency (ISO 4217, default from worker's set currency), rate_type (hourly/flat), amount, overtime_multiplier, effective_from, effective_to (nullable = current)`

### Requirements & shifts
- **RequirementTemplate**: `id, client_id FK, recurrence_rule (RRULE string), start_time, end_time, headcount, skill_ids (via RequirementSkill), active_from, active_until (nullable), is_active`
- **ClientRequirement**: `id, client_id FK, template_id FK (nullable), shift_date, start_time, end_time, headcount, status (pending_admin_approval / approved / rejected / shifts_generated), created_at, approved_by FK User (nullable), approved_at (nullable)`
  - A nightly job materializes future `ClientRequirement` rows from active `RequirementTemplate`s in `pending_admin_approval` status. **No shifts are ever generated until an admin approves the requirement** — this is a hard rule, not a default. Admin can edit fields pre-approval; edits after `shifts_generated` must go through Shift-level changes, never silently regenerate/duplicate shifts.
- **RequirementSkill**: `id, client_requirement_id FK, skill_id FK, is_mandatory (bool)`
- **Shift** (slot model — one row per required worker, not one row per requirement): `id, client_requirement_id FK, slot_number (1..headcount), scheduled_start (timestamptz), scheduled_end (timestamptz), status (open/offered/confirmed/in_progress/completed/no_show/cancelled)`

### Assignment & attendance
- **Assignment**: `id, shift_id FK, worker_id FK, status (proposed/confirmed/checked_in/completed/no_show/cancelled), assigned_at, assigned_by FK User (nullable — null if auto-suggested and accepted without edit)`
  - **No hard DB exclusion constraint against overlapping confirmed assignments** — confirmed decision, since every assignment is manually approved by an admin. Instead: build a background/scheduled detection query that flags workers with overlapping confirmed assignments, surfaced as a visible warning on the scheduling calendar UI (see section 5). This is advisory, not blocking.
- **TimeLog**: `id, assignment_id FK, clock_in_at (timestamptz), clock_out_at (timestamptz, nullable until clocked out), clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, geofence_passed (bool), status (pending_approval/approved/billed/disputed), approved_by FK User (nullable), approved_at (nullable), billed_at (nullable)`
  - Geofence check: compare clock-in/out coordinates against the Client's `lat/lng` within a configurable radius (default 150m).
  - **Once `billed_at` is set, this row is immutable — enforce at the application layer (and ideally a DB trigger/check) that no further UPDATE to hours/times is permitted.** Corrections after billing go through TimeLogAdjustment instead.
- **TimeLogAdjustment**: `id, time_log_id FK, reason, original_hours, corrected_hours, created_by FK User, created_at` — becomes a credit/debit line on the *next* invoice, never mutates a past invoice.

### Billing
- **BillRate**: `id, payer_id FK, client_id FK (nullable = payer-level default), skill_id FK (nullable = general rate), currency, rate_type (hourly/flat), amount, effective_from, effective_to (nullable)`
- **Invoice**: `id, payer_id FK, currency, billing_period_start, billing_period_end, status (draft/sent/partially_paid/paid/overdue/void), issued_at, due_at, subtotal, tax_amount, total`
- **InvoiceLineItem**: `id, invoice_id FK, time_log_id FK, worker_id FK, client_id FK, shift_date, hours, bill_rate_applied, line_total`
  - **One row per TimeLog, always — never pre-aggregated.** Any weekly/worker-level summary is a presentation-layer grouping over these rows, computed at render/PDF time, not stored as aggregated data.
- **Payment**: `id, invoice_id FK, amount, currency, paid_at, method, reference_number`

### Cross-cutting
- **User**: `id, agency_id FK, email, password_hash, role (admin/coordinator/worker/payer_readonly), linked_worker_id FK (nullable, for worker-role users)`
- **AuditLog**: `id, agency_id FK, actor_user_id FK, entity_type, entity_id, action, before_json, after_json, created_at` — write to this on every mutation to Assignment, WageRate, BillRate, Invoice, and ClientRequirement approval/rejection at minimum.

## 4. Matching / rostering algorithm — build as a distinct service module

This is the core differentiator. Implement as a two-phase process, callable
on-demand ("suggest candidates for shift X") and in batch ("suggest for all
open shifts in date range").

**Phase 1 — hard filters** (candidate must pass all):
1. Availability window (from `WorkerAvailability`, respecting `specific_date`
   overrides) fully covers the shift's `[scheduled_start, scheduled_end]`.
2. No other `confirmed` Assignment for that worker overlapping this shift's
   time range (checked here for the *suggestion* ranking even though it's not
   DB-enforced — don't suggest an already-double-booked worker).
3. Required skills (from `RequirementSkill` where `is_mandatory=true`) are a
   subset of the worker's non-expired `WorkerSkill`s.
4. Adding this shift would not breach configurable labor-compliance rules
   (max daily hours, max weekly hours, minimum rest between shifts) — build
   these thresholds as an editable config table, not hardcoded constants.

**Phase 2 — scoring/ranking** (weighted, configurable weights):
- Proximity: distance from `worker.home_lat/lng` (or last shift's client
  location, if chaining same-day shifts) to `client.lat/lng`. Straight-line
  (haversine) distance is fine for v1 — do not integrate a mapping API or
  PostGIS yet, current worker pool is small (~1000) and this can be revisited
  later.
- Current period utilization (spread hours fairly, or bias toward reliable
  workers — implement as a configurable strategy, default to "fill gaps in
  under-utilized workers first").
- Historical reliability score (derived from `no_show` / `late` rate in past
  TimeLogs — compute this as a periodic batch job, don't calculate live).

Output: a ranked list of candidate workers per shift with scores, surfaced
in the UI for a coordinator to confirm or override with one click. **Do not
auto-confirm assignments in v1** — suggestions only, human confirms.

## 5. Key UI surfaces to build

- **Scheduling calendar**: week/day view, shifts as draggable cards, color
  by status (open/confirmed/no_show etc.), visibly flags any worker who
  appears in two overlapping confirmed assignments (advisory warning, not a
  block — see Assignment note above).
- **Requirement authoring**: form for ad-hoc requirements + recurring
  template builder (day-of-week + time + headcount + skills), with an
  admin approval queue view (`pending_admin_approval` list, approve/reject/edit
  actions).
- **Worker profile**: availability editor (recurring + date overrides),
  skills/certifications (with expiry dates, visually flag expiring/expired),
  wage rate history, currency setting.
- **Mobile/worker view** (can be a responsive web view for v1, native app
  later): today's/upcoming shifts, clock in/out button (captures geolocation),
  availability self-service editing.
- **Hours dashboard**: worked hours by worker/date range/client/payer,
  scheduled vs actual variance, overtime flags, utilization %.
- **Billing**: bill rate configuration per payer/client/skill, invoice
  generation (date-range picker, preview before finalizing), invoice list
  with status, PDF export showing shift-by-shift line items, payment
  recording.

## 6. Business rules to enforce in code (not just document)

- No `Shift` rows exist until parent `ClientRequirement` is `approved`.
- No `InvoiceLineItem` can reference a `TimeLog` that is not `status=approved`.
- Once `TimeLog.billed_at` is set, block any update to `clock_in_at`,
  `clock_out_at`, or `status` — route corrections through `TimeLogAdjustment`.
- `WageRate` and `BillRate` are never edited in place for a past-dated
  period — always insert a new row with a new `effective_from` and close the
  previous row's `effective_to`. Historical invoices always resolve rates by
  querying "what rate was effective on this shift's date," never the current
  row.
- Every mutation to Assignment status, WageRate, BillRate, Invoice, and
  ClientRequirement approval writes an AuditLog entry.

## 7. Build order — implement in these phases, each independently testable

1. **Foundation**: Agency/Payer/Client/Worker/User CRUD + auth/RBAC + skills
   join tables.
2. **Requirements & manual roster**: requirement authoring + approval queue,
   manual shift creation, manual assignment (coordinator picks worker by
   hand, system validates availability/skill and flags conflicts — no smart
   matching yet).
3. **Attendance**: clock in/out with geofencing, timesheet approval workflow,
   hours dashboard.
4. **Billing**: bill rate config, manual/semi-automated invoice generation
   from approved timesheets, PDF export, payment recording.
5. **Smart matching engine**: the two-phase suggestion algorithm from
   section 4, wired into the scheduling calendar UI.
6. **Automation & polish**: notifications (shift offered/confirmed/reminder,
   timesheet pending, invoice sent), recurring requirement template engine +
   nightly materialization job, payer read-only portal.

Do not start phase N+1 until phase N is functionally complete and the core
flows in it can be demoed end-to-end.

## 8. Non-functional requirements

- Every table scoped by `agency_id`; every query filtered by the
  authenticated user's agency — write this as a shared query-layer
  guard/middleware, not something repeated ad hoc per endpoint.
- All timestamps UTC in storage; convert to the relevant Client's IANA
  timezone only at display/PDF-generation time.
- Migrations must be incremental, reviewable files (no destructive
  auto-sync in production).
- Write integration tests for: requirement approval → shift generation
  idempotency (editing/re-approving must not duplicate already-generated
  shifts), TimeLog immutability after billing, invoice line-item generation
  correctness against a known set of approved TimeLogs.

## 9. What to ask me before proceeding

Before writing code, confirm: (a) backend language choice if you disagree
with the default above, (b) the skills-as-join-table assumption in section 3,
(c) whether the worker-facing app should be a responsive web view or native
mobile for v1. Everything else in this document is a settled decision — build
it as specified rather than re-deriving it.
