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
- Update canonical environment/release documentation that still states `Private` is mandatory. Do not change only one canonical document.
- Revalidate GitHub/Vercel/Supabase integration behavior after the visibility change before accepting any release evidence.

## CI preparation already applied in V7

Development CI is visibility-neutral and quota-efficient: documentation-only changes skip ordinary Unit/Build jobs; stale runs for the same PR/ref are cancelled; Integration Contract Tests on pull requests are scoped to backend/database/integration-relevant paths; `main` retains the full Integration path; and the schema-focused Supabase clean replay in H5 Build is not duplicated on ordinary pull-request updates and remains a main/manual invariant. Workflows retain least-privilege repository permissions unless a workflow has an explicit release/browser need.

The former build assertion that repository visibility must be private is no longer a valid Public-prep invariant.

## Public-source exposure accepted by design

Repository source/migrations, Supabase project ref/API host, browser publishable/anon key, and product/engineering documentation explicitly elected for publication are not server secrets. Private data must remain protected even when an attacker knows all of the above.

## Hardening / cleanup before formal public operation

- Pin third-party GitHub Actions, especially OIDC-capable browser workflows, to reviewed immutable commit SHAs.
- Review Edge Function CORS origin policy and prefer an explicit production/preview allowlist where practical.
- Keep event-photo originals private and preserve organizer/participant authorization for signed access.
- Decide whether internal audit/Workboard/governance history is intentionally part of the public project documentation.

## Legacy restore/package assets

`bundle/chunk*.txt`, `source.bundle.b64`, `scripts/restore-source.mjs`, the packaging script, and the restore workflow are a linked legacy restore/package path. They must **not** be deleted piecemeal merely because they look old. First prove that the restore/package path and its release/audit trace value have been intentionally retired; only then remove the linked assets as one controlled cleanup slice.

## Full-history scan execution note

Current ChatGPT GitHub access can inspect repository files, commits, diffs, trees and workflow evidence, but it does not expose a writable Git worktree/clone primitive or an equivalent dedicated Gitleaks/TruffleHog full-history scanner. Therefore API/code searches and tracked-file preflights must **not** be recorded as a full-history PASS. This gate remains pending until a real history scanner can execute over all reachable Git objects/refs. No owner action is required merely to keep preparing the repository; this becomes actionable only before the actual visibility change.

## Visibility-change checklist

1. Dedicated full-history secret scan reviewed.
2. Current-head tracked-file secret preflight clean.
3. Canonical visibility wording synchronized across environment/release/audit documentation and README.
4. CI workflows reviewed for fork/PR permissions; no unsafe `pull_request_target` checkout pattern.
5. OIDC/write-capable workflows reviewed and restricted to trusted refs/events.
6. Public documentation scope explicitly accepted.
7. Visibility changed only after explicit owner authorization.
8. After change, verify repository metadata, GitHub Actions, Vercel Git link/deploy behavior, Supabase authorization boundaries, and available GitHub ruleset/branch-protection capabilities.

## Current non-blocking infrastructure facts

The September 2026 CI interruption was caused by the private-repository GitHub Actions included-minute allowance being exhausted (2,000 / 2,000 minutes), causing jobs to be rejected before workflow steps started. This is infrastructure/quota evidence, not evidence of a product regression. Public standard GitHub-hosted runner behavior and any billing/budget configuration must still be rechecked at the time visibility is actually changed.

Baidu browser AK/Referer/Vercel environment configuration for the V7 Standard Event venue-search slice has already been supplied by the owner. Any remaining inability to wire the large compressed `EventFormPage.tsx` through a replacement-only connector is a tooling/edit-capability blocker, not a missing-provider-credential blocker.
