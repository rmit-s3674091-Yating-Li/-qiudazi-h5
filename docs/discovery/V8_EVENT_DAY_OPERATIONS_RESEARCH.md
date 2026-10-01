# V8 Discovery: Event-day operating model

Date: 2026-10-02
Status: DECISION_CANDIDATE
Boundary: research only; not implementation authorization.

## Product problem
Research has covered planning, invitation, trust, repeat play and Club. A missing question is what happens after players arrive: which event-day tasks interrupt the organizer, and should the product emphasize a focused operating surface, participant self-service, or narrowly scoped delegation?

## Evidence
Luma provides mobile check-in with Standard and Express modes, immediate scan feedback, manual lookup fallback, and a check-in-only staff role separate from full event management. Its guest list is organized by actionable states such as Going, Pending, Waitlist, Checked In and Not Checked In. Eventbrite similarly treats check-in as a distinct mobile workflow, supports manual fallback, real-time attendance state across devices, and immediate invalid/duplicate feedback. Luma also separated automated reminders from host-authored Event Blasts after finding overlapping controls confusing.

## Function pattern
1. Event-day mode rather than exposing the full admin surface.
2. State-oriented queues: show what needs attention now.
3. Fast normal path plus explicit fallback/correction.
4. Prefer participant self-service where safe; use narrowly scoped delegation only when self-service does not solve the interruption.
5. Immediate shared feedback matters when several people act on the same event state.

## UI/UX pattern
On mobile, prioritize the current operation and thumb-reachable action; keep secondary administration behind Manage/More. Show success/error/duplicate feedback immediately and make reversible actions visibly correctable. Ordinary participants should not see organizer complexity. Do not copy ticketing metaphors such as QR admission unless attendance itself is validated as a real problem.

## Why it may work
Physical events are time-sensitive. The organizer's cost includes context switching while playing, answering questions and maintaining shared state. Mature event tools reduce this by narrowing the interface to the current operation and separating operational authority from full administration.

## Applicability to Qiudazi
Potentially high for tournaments where the organizer also plays; likely low for four friends playing one match. The key research question is not whether to add staff roles, but which action most often forces the organizer to stop playing: readiness, pairing, match start, score/result, location, communication, or exceptions.

This adds a missing middle to the emerging loop:
intent / plan -> commitment -> formal event -> event-day operation -> result -> Play Again.

## Counterexamples / risks
Luma and Eventbrite often serve larger or ticketed events; casual racket-sport sessions may not need check-in. More roles can create permission and privacy complexity. Real-time synchronization can become a technical project by itself. Too many state tabs recreate admin software on mobile. Delegation can also be worse than safe player self-service.

## Smallest validation
No development. Replay 5-8 recent real event-day episodes with organizers and mark each moment they had to stop playing to operate the product or coordinate people. Classify interruptions as readiness, pairing/bracket, match start, score/result, location, communication, or exception.

Compare three static concepts for the same event:
A. current organizer-centric event page;
B. focused event-day mode showing only what needs attention now;
C. focused mode plus one narrowly scoped delegated action.

Observe which interruptions disappear, which new confusion appears, and whether users prefer self-service over delegation.

## Suggested priority
Medium-high research priority if real organizers report event-day interruption; low implementation priority until then. Cross-industry evidence strong; Qiudazi-specific evidence weak.

## Open questions
- What is the highest-frequency event-day interruption?
- Is arrival/readiness useful, or is registration enough?
- Should score entry be organizer-only, participant self-service, opponent-confirmed, or delegated per match?
- Which actions need audit/undo?
- Can one event-day surface serve both Quick and formal tournament flows?
