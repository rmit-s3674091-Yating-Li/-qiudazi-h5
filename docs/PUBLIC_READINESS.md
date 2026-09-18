# Public Repository Readiness

> Status: **PUBLIC-PREP READY / visibility change not yet authorized**.
>
> This document records the preparation boundary only. It does not authorize changing repository visibility, merging `main`, moving `release-candidate`, deploying Production, or starting Release Gate.

## Decision boundary

The repository may be prepared to operate as either private or public. Repository visibility is an owner-controlled runtime setting, not an application security boundary. Supabase browser endpoint/project ref and browser publishable/anon credentials are expected to be observable by a web client; authorization must remain enforced by Supabase Auth, RLS, RPC ACLs, Storage policies, and server-only secrets.

Current username/nickname test identity behavior remains intentionally supported during V7 functional development. Production authentication formalization, including a future WeChat-account login path and migration of existing ownership/identity relationships, is deferred until the product is functionally mature and is not a V7 Public-prep blocker.

## Required before changing visibility

- Full-Git-history secret scanning is recommended defense-in-depth, but Owner has explicitly accepted deferral for this V7 Public transition. The accepted residual risk is that an old reachable commit could contain a credential that is absent from the current tracked tree. This deferral is not a scan PASS and must never be represented as one.
- Re-read the current exact PR head and confirm no newly introduced server credential, private key, database password, service-role key, PAT, or other server secret is tracked.
- Synchronize canonical environment/release/audit documentation. `Private` may be recorded as the current runtime fact, but must not be treated as a permanent application-security invariant.
- Revalidate GitHub/Vercel/Supabase integration behavior after the visibility change before accepting any release evidence.

## Canonical migration status

The V7 branch has migrated `README.md`, `docs/ENVIRONMENT_BASELINE.md`, `docs/RELEASE_GOVERNANCE.md`, and `docs/AUDIT_AUTOMATION_GOVERNANCE.md` to visibility-neutral governance. Development uses affected-scope evidence; Candidate Freeze and Release Gate retain strict exact-SHA evidence. The former H5 Build assertion that `github.event.repository.private=true` is mandatory has been removed.

The Audit governance migration was completed safely from the complete Git blob rather than a truncated contents response. It now treats Private as the current runtime state, requires Owner authorization plus `docs/PUBLIC_READINESS.md` gates before Public conversion, treats an authorized conversion as a controlled environment change rather than automatic drift, and requires post-change revalidation before platform enforcement can be counted as Gate evidence. It also corrects the V7 dynamic development PR reference from historical PR #20 to PR #24.

`docs/PUBLIC_PREP_RUNTIME_EVIDENCE.md` preserves the corrected blocker facts captured while the large Workboard could not yet be edited safely. Those facts have now also been synchronized into the canonical `docs/V7_WORKBOARD.md`; the supplemental file remains historical/runtime evidence and does not replace the Workboard state machine.

`docs/V7_WORKBOARD.md` has now been safely synchronized by complete-content optimistic-concurrency write. `V7-SCORE-01`, `V7-ID-01B`, and `V7-VENUE-01A` attribute the no-step CI condition to the confirmed GitHub Actions included-minute exhaustion (2,000 / 2,000), while `V7-VENUE-01C` records that Baidu browser AK/Referer/Vercel environment configuration is complete and the remaining blocker is safe host wiring of the compressed `EventFormPage.tsx`. No new Workboard state enum was invented.

## CI preparation already applied in V7

Development CI is visibility-neutral and quota-efficient: documentation-only changes skip ordinary Unit/Build jobs; stale runs for the same PR/ref are cancelled; Integration Contract Tests on pull requests are scoped to backend/database/integration-relevant paths; `main` retains the full Integration path; and the schema-focused Supabase clean replay in H5 Build is not duplicated on ordinary pull-request updates and remains a main/manual invariant. Workflows retain least-privilege repository permissions unless a workflow has an explicit release/browser need.

The former build assertion that repository visibility must be private is no longer a valid Public-prep invariant.

## Current-head tracked-source security preflight

The current V7 tracked-source review has not identified a committed Supabase service-role key, GitHub PAT, database password/connection URL, private key, or equivalent server credential. References to secret variable names, scanner patterns, browser-visible Supabase project identity, and browser publishable/anon configuration are not by themselves server-secret findings.

This is deliberately classified as **tracked-source preflight evidence only**. It does not prove that arbitrary historical blobs never contained a secret. For this V7 Public transition, Owner has explicitly accepted that residual history risk and deferred the automated full-history scan; the exact-head preflight must still be refreshed immediately before a visibility change because subsequent commits can invalidate it.

The final application authorization boundary remains Auth/RLS/RPC ACL/Storage/Edge server-side checks rather than source secrecy. Event-photo originals remain private; sensitive Edge operations authenticate the caller and keep service-role material server-side. Existing CORS reflection and browser-side signed-URL patterns remain hardening candidates, not evidence that repository visibility itself grants data access.

## Workflow / fork trust review

Current-head workflow inventory has been re-read from the repository tree. Ordinary PR development workflows (`H5 Build Check`, `Domain Unit Tests`, `Integration Contract Tests`) use read-only repository permissions and do not use `pull_request_target`. Candidate/exploratory/AUD-015 browser workflows request `id-token: write` plus read permissions, but they are triggered only from `release-candidate`, manual dispatch, and (for Candidate Browser) Vercel `repository_dispatch`; they are not pull-request-triggered and explicitly checkout `release-candidate`. This keeps untrusted fork PR code out of the OIDC path under the current workflow definitions.

The legacy `Restore readable source` workflow has `contents: write`, but it is branch-scoped to `chore/restore-readable-source` and explicitly checks out/pushes that branch. It is part of the linked legacy restore/package path and is therefore an intentional publication-scope item to review, not a reason to delete bundle assets piecemeal.

No unsafe `pull_request_target` checkout path was found in the current workflow inventory. After Public conversion, re-check the effective fork/PR permission model, Actions behavior, ruleset/branch-protection availability, Vercel GitHub App authorization, and whether legacy branch write workflows remain intentionally enabled. A capability that was unavailable while the repository was private/free must not be assumed to remain unavailable after Public conversion.

## Public-source exposure accepted by design

Repository source/migrations, Supabase project ref/API host, browser publishable/anon key, and product/engineering documentation explicitly elected for publication are not server secrets. Private data must remain protected even when an attacker knows all of the above.

Public conversion will also expose repository history and currently retained engineering/governance artifacts. Therefore the owner authorization at the final visibility step is an acceptance of source/history/document visibility, not merely a CI billing optimization.

## Hardening / cleanup before formal public operation

- Pin third-party GitHub Actions, especially OIDC-capable browser workflows, to reviewed immutable commit SHAs. Do not guess SHAs; pin only after the exact upstream commit is verified.
- Review Edge Function CORS origin policy and prefer an explicit production/preview allowlist where practical.
- Keep event-photo originals private and preserve organizer/participant authorization for signed access.
- Internal audit/Workboard/governance history and the retained legacy restore/package/audit artifacts have been reviewed dependency-first and are intentionally accepted as part of the public project scope for this transition; they must not be deleted piecemeal merely to manufacture readiness.

These hardening items must be classified by actual security effect. The deferred full-history scan remains a recorded residual risk rather than a fabricated PASS; non-blocking defense-in-depth work must not be mechanically promoted into a product regression.

## Legacy restore/package assets

`bundle/chunk*.txt`, `source.bundle.b64`, `scripts/restore-source.mjs`, the packaging script, and the restore workflow are a linked legacy restore/package path. They must **not** be deleted piecemeal merely because they look old. First prove that the restore/package path and its release/audit trace value have been intentionally retired; only then remove the linked assets as one controlled cleanup slice.

The same conservative rule applies to specialist audit workflows/scripts and executed migrations: historical appearance is not deletion evidence when a live workflow, packaging path, migration replay, or audit trace still references the asset.

## Full-history scan execution note

The reachable-ref scope for the eventual scanner has now been inventoried from GitHub rather than assumed. Current heads are `main`, `release-candidate`, the active V7 branch, the retained V6/postdeploy branches, and five retained `fix/*` branches; the repository currently exposes no tag refs. The scanner must cover history reachable from **all current heads**, not only `main` or PR #24. If refs change before execution, this inventory must be refreshed first.

Current ChatGPT GitHub access can inspect repository files, commits, diffs, trees and workflow evidence, but it does not expose a writable Git worktree/clone primitive or an equivalent dedicated Gitleaks/TruffleHog full-history scanner. API/code searches and tracked-file preflights must **not** be recorded as a full-history PASS. Owner has explicitly accepted deferring this scan for the V7 Public transition rather than purchasing or provisioning an external runner; the residual history-secret risk remains documented and a future real scanner should still cover all reachable Git objects/refs.

A full-history result must record at least the scanner/tool and version, repository/ref scope, execution time, findings reviewed, any credential rotation/remediation required, and the exact V7 head used for the final tracked-source follow-up. Sampling recent commits or searching only the default branch is insufficient.

No additional paid runner or plan upgrade is required for this Public transition solely to satisfy history scanning. If a safe/free scanner capability becomes available later, run it and record the result; until then, the deferral remains explicit and must not be silently relabeled as PASS.

## Visibility-change checklist

1. Full-history secret scan status recorded: **DEFERRED BY OWNER / residual history-secret risk accepted for this V7 Public transition**. This is not a scan PASS; a future safe/free scanner should still cover all reachable history/refs.
2. Current exact-head tracked-source secret preflight refreshed and clean, with no unresolved server credential finding.
3. Canonical visibility wording synchronized across README, environment, release, audit governance, Public Readiness, and relevant Workboard evidence.
4. CI workflows reviewed for fork/PR permissions; no unsafe `pull_request_target` checkout pattern.
5. OIDC/write-capable workflows reviewed and restricted to trusted refs/events.
6. Legacy restore/package/audit assets either intentionally accepted for publication or retired dependency-first; never deleted piecemeal to manufacture readiness.
7. Public documentation/governance/history scope explicitly accepted by Owner.
8. Visibility changed only after explicit Owner authorization. Authorization to make the repository Public is independent from authorization to merge `main` or deploy Production.
9. Immediately after change, verify repository metadata/visibility, standard GitHub-hosted Actions execution, fork/PR permission behavior, Vercel Git link/GitHub App/deploy behavior, Supabase authorization boundaries, and available GitHub ruleset/branch-protection capabilities.
10. Record the post-change verification result before treating any new CI evidence as release evidence. Public conversion itself does not start Candidate Freeze or Release Gate.

## Current non-blocking infrastructure facts

The September 2026 CI interruption was caused by the private-repository GitHub Actions included-minute allowance being exhausted (2,000 / 2,000 minutes), causing jobs to be rejected before workflow steps started. This is infrastructure/quota evidence, not evidence of a product regression. Repeated reruns while the quota/budget condition is unchanged create churn and are not evidence. Public standard GitHub-hosted runner behavior and any billing/budget configuration must still be rechecked at the time visibility is actually changed.

Baidu browser AK/Referer/Vercel environment configuration for the V7 Standard Event venue-search slice has already been supplied by the owner. Any remaining inability to wire the large compressed `EventFormPage.tsx` through a replacement-only connector is a tooling/edit-capability blocker, not a missing-provider-credential blocker.

## Remaining gates before requesting Owner authorization

At the current preparation stage, Workboard synchronization, full-history-scan disposition, and publication-scope review are complete. The remaining Public-specific preparation gate is intentionally narrow:

- refresh the exact-head tracked-source preflight after the last Public-prep commit;
- if that refresh has no unresolved server-credential finding, request explicit Owner authorization for the actual visibility change.

No paid runner/plan upgrade is required solely for the deferred full-history scan. Publication-scope acceptance does not authorize merge main, move release-candidate, start Release Gate, or deploy Production.

Until those gates are satisfied, status remains **PUBLIC-PREP READY**, not `PUBLIC-READY`. No Public conversion, `main` merge, Production deployment, `release-candidate` movement, or Release Gate is authorized by this document.