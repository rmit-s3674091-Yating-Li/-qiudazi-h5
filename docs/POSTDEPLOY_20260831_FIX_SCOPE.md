# 2026-08-31 Post-deploy remediation scope

This document records the current remediation scope after the first main/Production release. It is not a new product baseline.

- Event detail bottom action bar: keep CTA buttons horizontal on mobile; avoid a `full` flex child squeezing the registered/view-roster action into vertical text.
- Quick Start: allow the current user to directly select established real tennis partners, while preserving own temporary partners and preventing arbitrary-user selection.
- Hall level filter: restore a single selected playing-level filter. An event matches when its suggested range contains that selected level; suggested level remains discovery guidance, not a registration requirement.
- QA data isolation: automated QA events remain available by direct URL / owner scope but are excluded from the public Hall when both the event and organizer are QA-marked.

Canonical Supabase migration versions for this remediation:

- `20260831102924_postdeploy_quickstart_level_filter_qa_isolation.sql`
- `20260831103222_broaden_qa_event_hall_isolation.sql`
