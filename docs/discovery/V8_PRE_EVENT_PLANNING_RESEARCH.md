# V8 Pre-event Planning Research

Date: 2026-10-02
Status: DECISION_CANDIDATE

## Product problem
Not every casual plan may deserve immediate creation of a full tournament/event. “Play again”, finding a time, inviting people, and choosing a venue can happen before the group is committed enough to need brackets, scoring, deadlines, and organizer controls.

## Cross-industry evidence
Partiful distinguishes lightweight Group Reminders from full Events. Group Reminders are intended for casual plans that do not need a full RSVP flow; participants can edit details and the reminder still appears in Calendar. Partiful separately supports cloning a prior event and re-inviting a previous guest list rather than requiring a recurring-event model. Discord Scheduled Events sit inside an existing community and allow members to mark Interested for notifications before the event goes live.

## Function pattern
Use progressive commitment: lightweight plan -> coordinate people/time/place -> commitment -> formal event when needed. Interest and formal participation should not be assumed to be the same state.

## UI/UX pattern
A lightweight path should ask only for information known now and progressively reveal formal event controls later. Compare an intent-first entry such as “约一场 / 创建正式赛事” with immediately showing the full event form. Ordinary participants should not see scoring, bracket, and admin complexity before it is relevant.

## Why it may work
It moves input cost to the moment information becomes known and provides a natural container for time coordination, invitation commitment, venue reuse, and Play Again without requiring a full Club or social graph.

## Applicability
Potentially high for familiar or semi-familiar groups, recurring partners, and plans where time/place are initially uncertain. Formal tournaments with known details should still go directly to Event.

## Counterexample / risks
A separate Plan object can duplicate Event, confuse users, and complicate lifecycle/upgrade rules. If V7 event creation is already sufficiently lightweight or most sessions are fully specified at initiation, this is over-design. Partiful's hostless collaborative editing should not be copied into scoring or formal event authority.

## Smallest validation
No development. Replay recent real planning episodes with two static flows: A = full event creation immediately; B = minimal plan (rough time / people / optional venue) -> share -> confirm -> convert to event. Observe when organizers are actually willing to enter format, deadline, exact venue, and other formal details. Ask whether failed plans should appear in event history.

## Suggested priority
High research priority; cross-industry evidence medium-strong, Qiudazi-specific evidence weak until tested.

## Open questions
Could an Event draft carry this role instead of a new Plan entity? Who may edit a lightweight plan? What is the minimum Interested/Maybe/Going state set? When should an abandoned plan expire? Which invitation/time-poll state should survive conversion?

## Scope implication
If validated, the V8 candidate loop becomes: Play Again / lightweight plan -> coordinate -> commitment -> confirm game -> formal Event -> play -> Play Again. This is a research candidate only, not implementation authorization.
