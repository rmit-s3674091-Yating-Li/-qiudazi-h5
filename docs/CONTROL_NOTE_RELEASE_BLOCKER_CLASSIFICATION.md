# CONTROL NOTE — Release Blocker Classification

Date: 2026-09-02
Scope: PR #22 release stabilization / AUD-20260902-003

## Purpose

This note gives the remediation, whitebox, release-relay, blackbox and Release Gate automations a shared implementation boundary for the remaining release-governance canonical drift. It does not change product behavior and must not lower the Release Gate.

## Required canonical rule

Candidate Freeze and Release Gate must classify backlog items by **issue nature plus current exact-head evidence**, not mechanically by severity/status alone.

1. `OPEN` / `IN_PROGRESS` P0/P1 does **not automatically** mean Candidate Freeze is blocked.
2. A P0/P1 is release-blocking when it represents a current-exact-head product, security, authorization, data-consistency, migration/repo-live parity, or explicit canonical-rule defect, or when same-SHA browser evidence establishes a `PRODUCT_BLACKBOX_FAILURE`.
3. Pure QA/Browser harness defects, test identity/data naming governance, coverage breadth/completeness debt, and other non-product test-governance debt do not by themselves block Candidate Freeze when current exact-head Unit + Integration + H5/clean replay are green and there is no corresponding same-SHA product failure.
4. `FIXED_PENDING_VERIFY` is not `VERIFIED`. Independent verification remains required according to the issue type; however non-release-blocking test-governance debt must not create an endless `fix → new head → candidate invalidated → fix again` loop.
5. Temporary `PR head != release-candidate` is a pipeline state, not a product defect. When Candidate conditions are met, release relay should advance the candidate rather than report the mismatch as the blocker.
6. Dynamic phase statements such as “currently remediation”, “not yet Candidate Freeze”, or “release-candidate should remain at SHA X” must never be encoded as long-lived canonical truth. Every run derives phase from live PR exact head, same-SHA CI, live audit backlog, candidate/Preview/Browser/Gate evidence.

## AUD-20260902-003 remediation recommendation

Perform the smallest canonical synchronization necessary in `docs/RELEASE_GOVERNANCE.md` and `docs/ENVIRONMENT_BASELINE.md` so their Candidate Freeze wording follows the rule above. Review `docs/AUDIT_AUTOMATION_GOVERNANCE.md`, P0/Browser/README references only for actual contradictory wording; do not expand scope merely to refresh prose.

The intended change is governance-only. Do not modify H5 product behavior, Supabase business schema/RPC, Quick Start, Hall, scoring, photos, or other deferred UX work as part of this AUD.

Because canonical-document commits move the PR exact head, after the minimum fix the old candidate evidence is historical and the new head must run:

`Unit + Integration + H5/clean replay → Candidate Freeze → release-candidate exact SHA → READY Preview/build-meta → Candidate Browser + Exploratory → Release Gate`.

## Verification boundary

- Remediation author may move the AUD only to `FIXED_PENDING_VERIFY`.
- Independent whitebox/Gate must confirm the canonical conflict is actually removed.
- Browser evidence is still required for the resulting exact head even though this is a governance-only change.
- No automation may merge `main` or trigger Production. Final release remains an explicit user decision.
