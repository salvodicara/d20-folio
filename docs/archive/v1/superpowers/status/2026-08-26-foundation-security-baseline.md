# 2026-08-26 Foundation Security Baseline

This read-only snapshot records the open dependency findings observed immediately after public `main` reached `5e19d43612a9beae1bf1c27b895484b297f7373b`. GitHub and the current lockfiles own live state; Foundation must refresh this evidence before remediation and must not copy these counts into durable routers.

## Open findings

| Evidence                                                                                                                                                   | Dependency path                                                                                                                              | Severity and affected version               | Required disposition                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Dependabot 47](https://github.com/salvodicara/d20-folio/security/dependabot/47), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | `nanoid@3.3.16` through Vite → PostCSS; GitHub classifies the root lockfile path as runtime because `@tailwindcss/vite` is a root dependency | high; patched in `3.3.18`                   | patch the resolved chain and prove root build, bundle, PWA, tests, and Functions remain green; verify actual shipped reachability rather than trusting the manifest scope |
| [Dependabot 43](https://github.com/salvodicara/d20-folio/security/dependabot/43), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | `js-yaml@3.15.0` through Changesets → manypkg → read-yaml-file                                                                               | high development chain; patched in `3.15.1` | update or safely constrain the transitive release-tool chain and prove Changesets parsing/release-plan behavior                                                           |
| [Dependabot 44](https://github.com/salvodicara/d20-folio/security/dependabot/44), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | `js-yaml@4.3.0` through Changesets parse/read                                                                                                | high development chain; patched in `4.3.1`  | update or safely constrain the transitive release-tool chain and prove Changesets parsing/release-plan behavior                                                           |

`pnpm audit` reproduced three high findings and no critical findings. The standalone Functions tree reported the same transitive `nanoid` advisory in its full audit, while `npm --prefix functions audit --omit=dev` reported zero production vulnerabilities. These classifications are routing evidence, not permission to dismiss an alert.

## Foundation acceptance

- Refresh GitHub and both lockfile audits on fresh `origin/main`.
- Prefer maintained upstream upgrades; use an override only with dependency-tree, API-compatibility, license, and representative test evidence.
- Keep the root and standalone Functions lockfiles reproducible with the pinned Node toolchain.
- Run the complete composed gate, package/release-plan checks, SRD-only gate when the seam is affected, and a production bundle reachability check.
- Confirm the relevant GitHub alerts close or record a reviewed, time-bounded disposition with compensating controls and an owner only if product cost/privacy or an irreversible external decision changes.

This baseline requires no private content-pack source change.
