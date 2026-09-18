# V7 Public-Prep Runtime Evidence

> Supplemental current-state evidence for `docs/PUBLIC_READINESS.md`. This file intentionally does not replace `docs/V7_WORKBOARD.md` and does not change the Workboard state enum.

Recorded against PR #24 exact head `d6907c2100f61f70804412310cb28d877f31be79`.

## GitHub Actions quota blocker

The current blocker for `V7-SCORE-01`, `V7-ID-01B`, and `V7-VENUE-01A` is GitHub Actions quota/infrastructure, not product or Supabase regression.

Observed account usage: private-repository included Actions minutes are exhausted at **2,000 / 2,000**. The affected Integration jobs were rejected before workflow steps were emitted. Do not repeatedly rerun those jobs while quota/budget/public conditions are unchanged. When execution capacity becomes available, Verifier must rerun the affected DB/Edge behavior; this evidence does not upgrade those items to VERIFIED.

The corresponding rows in `docs/V7_WORKBOARD.md` still contain the older generic runner wording. Because that file is large and the available write primitive is whole-file replacement, its stale wording must not be “fixed” by a partial/truncated overwrite. This supplemental evidence records the corrected cause until a safe optimistic-concurrency edit path is available.

## Venue provider blocker correction

`V7-VENUE-01C` is no longer blocked by a missing Baidu credential. The browser AK, Referer whitelist, and Vercel `VITE_BAIDU_MAP_AK` configuration have been completed outside the repository without committing the credential value.

The remaining blocker is safe host-file editing/tooling: `src/pages/EventFormPage.tsx` is a large compressed/one-line file, while the current repository write interface replaces complete files and can truncate unsafe reconstructions. Builder must not half-write or reconstruct that host file from truncated content.

When a safe patch/worktree edit capability is available, Builder should wire the existing provider-neutral MapProvider POI adapter into Standard create/edit, persist the provider-neutral venue fields, run affected-scope regression, and leave Quick without map/geolocation steps.

Do not add a new `TOOLING_EDIT_BLOCKED` Workboard state merely to describe this evidence; use the existing governance state machine until it is formally changed.

## Public-readiness implication

These stale Workboard strings are governance-evidence synchronization debt, not evidence of a newly discovered product defect. Public authorization remains blocked until the canonical evidence is safely synchronized or the readiness record explicitly carries the authoritative correction, the required full-history secret scan is completed, final exact-head tracked-source preflight is clean, and the intended public history/governance/legacy scope is accepted by the Owner.

This document does **not** authorize repository visibility change, `release-candidate`, Release Gate, merge to main, or Production deployment.
