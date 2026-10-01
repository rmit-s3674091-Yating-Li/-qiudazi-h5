# V8 Discovery｜Club / Group / Organization entity research

> Stage: POST-V7 DISCOVERY / NEXT-VERSION PLANNING
> Research-only. This document is not an implementation task or product authorization.

## C-001｜Club should first be tested as a reusable coordination container, not a mini social network

- Date: 2026-10-02
- Status: CLUB_DECISION_CANDIDATE / DECISION_CANDIDATE
- Original product problem: R-001/R-002 suggest that repeat play may need a reusable group of people. The unresolved question is whether that requires a full Club entity, and if so what the entity should own.
- Sources/evidence: Public product documentation for Strava Clubs, Slack workspaces/channels and Discord roles/community onboarding. Strava separates owner/admin/member responsibilities and invite-only membership; Slack separates workspace-level identity from scoped channel management and guest access; Discord uses role hierarchy and onboarding to avoid exposing every capability to every member.
- Reference products/industries: Strava (sports club/community), Slack (workspace + scoped collaboration), Discord (community/guild + roles/onboarding).
- Function pattern: mature organization models separate (1) durable container identity, (2) membership, (3) scoped roles/permissions, and (4) child activities/spaces. Administrative power is delegated rather than duplicated across every member. Membership visibility and join policy can differ from content/event visibility.
- UI/UX pattern: ordinary members enter through activity/content first; administrative complexity lives behind role-aware settings. Join/invite is a distinct action from participating in one activity. New members should see a small useful default surface rather than the entire admin/navigation tree. Role labels should appear only where they explain available actions.
- Why it works: it preserves continuity across repeated activities without forcing every event to rebuild identity, membership and permissions; at the same time it prevents organizer controls from polluting the participant experience.
- Applicability to 球搭子: if user research validates stable recurring groups, the smallest useful Club may be a durable container that owns a name/identity, reusable member set, organizer(s), upcoming/past sessions and lightweight aggregate history. It does not yet need Feed, chat, membership billing, venue ownership, public discovery, global rankings or a complex permission matrix.
- Counterexamples/risks: a Club entity creates empty-shell risk when users only want to copy last game's participants. Strava's moderation obligations show that once a club becomes a content/community surface, owners inherit moderation/privacy responsibilities. Slack/Discord-style granular roles are powerful but excessive for small casual groups. A venue, commercial club and friend group are not necessarily the same entity and should not be conflated prematurely.
- Smallest validation: compare three no-code concepts using the same recent real-world group: A) “Play again with recent players” with no persistent entity; B) “Save this group” with name + members + organizers + sessions; C) full “Club” with profile, roles, feed/ranking. Ask organizers which one they would actually maintain after 4 weeks, and ask participants whether joining the container feels useful or like extra setup. Also test whether users naturally call the persistent thing a 球搭子小组/群/Club/俱乐部.
- Suggested priority: High research priority; implementation priority unknown until R-001/R-002 are user-validated. Evidence strength: cross-industry strong, 球搭子-specific weak.
- Open questions: Is a persistent entity necessary at all? Should event participation imply membership? Should Club own results/history or only reference member/event data? Are commercial venues and social groups separate future entity types? What is the minimum role set—Owner/Organizer/Member, or simply Organizer/Member?

## Decision implication

Do not make “Club” the V8 umbrella by default. First validate whether persistence itself removes repeated coordination work. If yes, prefer a thin reusable coordination container and progressively disclose organization features. Treat Feed/chat, complex RBAC, public club discovery, paid membership, venue ownership and moderation-heavy community features as later independent decisions.
