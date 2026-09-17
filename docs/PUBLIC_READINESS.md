# Public Repository Readiness

> Status: **PUBLIC-PREP READY / visibility change not yet authorized**.
>
> This document records the preparation boundary only. It does not authorize changing repository visibility, merging `main`, moving `release-candidate`, deploying Production, or starting Release Gate.

## Decision boundary

The repository may be prepared to operate as either private or public. Repository visibility is an owner-controlled runtime setting, not an application security boundary. Supabase browser endpoint/project ref and browser publishable/anon credentials are expected to be observable by a web client; authorization must remain enforced by Supabase Auth, RLS, RPC ACLs, Storage policies, and server-only secrets.

Current username/nickname test identity behavior remains intentionally supported during V7 functional development. Production authentication formalization, including a future WeChat-account login path and migration of existing ownership/identity relationships, is deferred until the product is functionally mature and is not a V7 Public-prep blocker.

## Required before changing visibility

- Run a dedicated full-Git-history secret scan (for example Gitleaks or TruffleHog in history mode) and review findings. Current tracked-file scanning is useful but is not proof that arbitrary historical blobs never contained a secret.
- Re-read the current exact PR head and confirm no newly introduced server credential, private key, database password, service-role key, PAT, or other server secret is tracked.
- Synchronize canonical environment/release/audit documentation. `Private` may be recorded as the current runtime fact, but must not be treated as a permanent application-security invariant.
- Revalidate GitHub/Vercel/Supabase integration behavior after the visibility change before accepting any release evidence.

## Canonical migration status

The V7 branch has migrated `README.md`, `docs/ENVIRONMENT_BASELINE.md`, `docs/RELEASE_GOVERNANCE.md`, and `docs/AUDIT_AUTOMATION_GOVERNANCE.md` to visibility-neutral governance. Development uses affected-scope evidence; Candidate Freeze and Release Gate retain strict exact-SHA evidence. The former H5 Build assertion that `github.event.repository.private=true` is mandatory has been removed.

The Audit governance migration was completed safely from the complete Git blob rather than a truncated contents response. It now treats Private as the current runtime state, requires Owner authorization plus `docs/PUBLIC_READINESS.md` gates before Public conversion, treats an authorized conversion as a controlled environment change rather than automatic drift, and requires post-change revalidation before platform enforcement can be counted as Gate evidence. It also corrects the V7 dynamic development PR reference from historical PR #20 to PR #24.

`docs/V7_WORKBOARD.md` remains the principal stale governance-evidence item. Its complete current blob has now been retrieved, so the stale rows are precisely known; however, because it is a very large machine-consumed table and the available write primitive is complete-file replacement, it must still be changed only by a full-content optimistic-concurrency write. The required semantic corrections are: `V7-SCORE-01`, `V7-ID-01B`, and `V7-VENUE-01A` must attribute the no-step CI condition to the confirmed GitHub Actions included-minute exhaustion (2,000 / 2,000), and `V7-VENUE-01C` must stop claiming missing provider credentials because Baidu browser AK/Referer/Vercel environment configuration is complete. The remaining venue blocker is safe host wiring of the compressed `EventFormPage.tsx` through the current replacement-only editing capability. This is governance synchronization, not a product regression and not a reason to invent a new Workboard state enum.

## CI preparation already applied in V7

Development CI is visibility-neutral and quota-efficient: documentation-only changes skip ordinary Unit/Build jobs; stale runs for the same PR/ref are cancelled; Integration Contract Tests on pull requests are scoped to backend/database/integration-relevant paths; `main` retains the full Integration path; and the schema-focused Supabase clean replay in H5 Build is not duplicated on ordinary pull-request updates and remains a main/manual invariant. Workflows retain least-privilege repository permissions unless a workflow has an explicit release/browser need.

The former build assertion that repository visibility must be private is no longer a valid Public-prep invariant.

## Current-head tracked-source security preflight

The current V7 tracked-source review has not identified a committed Supabase service-role key, GitHub PAT, database password/connection URL, private key, or equivalent server credential. References to secret variable names, scanner patterns, browser-visible Supabase project identity, and browser publishable/anon configuration are not by themselves server-secret findings.

This is deliberately classified as **tracked-source preflight evidence only**. It is not a substitute for the required full-Git-history scan, and it must be refreshed against the exact head immediately before a visibility change because subsequent commits can invalidate it.

The final application authorization boundary remains Auth/RLS/RPC ACL/Storage/Edge server-side checks rather than source secrecy. Event-photo originals remain private; sensitive Edge operations authenticate the caller and keep service-role material server-side. Existing CORS reflection and browser-side signed-URL patterns remain hardening candidates, not evidence that repository visibility itself grants data access.

## Workflow / fork trust review

Ordinary development workflows do not use an unsafe `pull_request_target` checkout pattern. Workflows that require elevated capabilities such as OIDC or release/browser operations must remain restricted to trusted events/refs and must not become a path for untrusted fork code to obtain privileged execution merely because the repository becomes public.

After Public conversion, re-check the effective fork/PR permission model, Actions behavior, ruleset/branch-protection availability, and Vercel GitHub App authorization. A capability that was unavailable while the repository was private/free must not be assumed to remain unavailable after Public conversion.

## Public-source exposure accepted by design

Repository source/migrations, Supabase project ref/API host, browser publishable/anon key, and product/engineering documentation explicitly elected for publication are not server secrets. Private data must remain protected even when an attacker knows all of the above.

Public conversion will also expose repository history and currently retained engineering/governance artifacts. Therefore the owner authorization at the final visibility step is an acceptance of source/history/document visibility, not merely a CI billing optimization.

## Hardening / cleanup before formal public operation

- Pin third-party GitHub Actions, especially OIDC-capable browser workflows, to reviewed immutable commit SHAs. Do not guess SHAs; pin only after the exact upstream commit is verified.
- Review Edge Function CORS origin policy and prefer an explicit production/preview allowlist where practical.
- Keep event-photo originals private and preserve organizer/participant authorization for signed access.
- Decide whether internal audit/Workboard/governance history is intentionally part of the public project documentation.

These hardening items must be classified by actual security effect. They must not be used to disguise a missing full-history scan, nor should non-blocking defense-in-depth work be mechanically promoted into a product regression.

## Legacy restore/package assets

`bundle/chunk*.txt`, `source.bundle.b64`, `scripts/restore-source.mjs`, the packaging script, and the restore workflow are a linked legacy restore/package path. They must **not** be deleted piecemeal merely because they look old. First prove that the restore/package path and its release/audit trace value have been intentionally retired; only then remove the linked assets as one controlled cleanup slice.

The same conservative rule applies to specialist audit workflows/scripts and executed migrations: historical appearance is not deletion evidence when a live workflow, packaging path, migration replay, or audit trace still references the asset.

## Full-history scan execution note

Current ChatGPT GitHub access can inspect repository files, commits, diffs, trees and workflow evidence, but it does not expose a writable Git worktree/clone primitive or an equivalent dedicated Gitleaks/TruffleHog full-history scanner. Therefore API/code searches and tracked-file preflights must **not** be recorded as a full-history PASS. This gate remains pending until a real history scanner can execute over all reachable Git objects/refs.

A full-history result must record at least the scanner/tool and version, repository/ref scope, execution time, findings reviewed, any credential rotation/remediation required, and the exact V7 head used for the final tracked-source follow-up. Sampling recent commits or searching only the default branch is insufficient.

No owner action is required merely to keep preparing the repository. If no safe history-scanner execution capability becomes available in this environment, that single capability becomes an explicit final prerequisite before asking for visibility authorization; it must not be silently waived.

## Visibility-change checklist

1. Dedicated full-history secret scan executed over all reachable history/refs and findings reviewed.
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

At the current preparation stage, the remaining Public-specific gates are intentionally narrow:

- safely synchronize the remaining Workboard blocker evidence by complete-content optimistic-concurrency write;
- execute and review the dedicated full-Git-history secret scan;
- refresh the exact-head tracked-source preflight after the last Public-prep commit;
- confirm the intended public scope of retained governance/history/legacy artifacts;
- then request explicit Owner authorization for the visibility change.

Until those gates are satisfied, status remains **PUBLIC-PREP READY**, not `PUBLIC-READY`. No Public conversion, `main` merge, Production deployment, `release-candidate` movement, or Release Gate is authorized by this document.