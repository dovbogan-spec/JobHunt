# Production-readiness checklist: file uploads and PDF parsing

Use this checklist for every release that changes upload handling, document parsing, the PDF runtime, or its dependencies. A checked box must have durable evidence (CI run, dashboard, ticket, deployment record, or test report); a verbal confirmation is not evidence. The release manager owns the completed record and links it from the release ticket.

## Release record

Complete this section before the go/no-go meeting. Do not use team names in place of accountable people.

| Field | Required value |
| --- | --- |
| Release/version | `TBD` |
| Candidate commit SHA | `TBD` |
| Preview deployment ID and URL | `TBD` |
| Canary/production deployment ID | `TBD` |
| Agreed upload error-rate threshold and measurement window | `TBD` (percentage, population, and window) |
| Engineering approver (name, decision, timestamp) | `TBD` |
| QA approver (name, decision, timestamp) | `TBD` |
| DevOps/SRE approver (name, decision, timestamp) | `TBD` |
| Security/privacy approver (name, decision, timestamp) | `TBD` |
| Product/support approver (name, decision, timestamp) | `TBD` |
| Evidence index (CI, test report, dashboards, logs, security review) | `TBD` |
| Go/no-go decision, decision maker, and timestamp | `TBD` |
| Rollback owner and backup | `TBD` |
| Rollback verification/exercise evidence | `TBD` |

## 1. Software engineering

- [ ] **Package dependencies deterministically.** Use the committed lockfile with `npm ci`, pin native/runtime-sensitive packages to exact versions, build in the same OS/architecture and Node.js major version as production, and prohibit unreviewed post-build dependency installation. Attach the lockfile diff and clean-build CI run.
- [ ] Inspect the deploy bundle and confirm every required JavaScript file, native binary, transitive package, and PDF worker/resource is included for the production target. Confirm development-only packages are not required at runtime.
- [ ] Represent expected upload/parser failures with typed error codes (for example unsupported type, file too large, malformed document, no extractable text, quarantined file, and temporary service failure). Preserve the typed code through the API boundary while keeping internal paths, package details, and stack traces out of user responses.
- [ ] Add or update regression tests for successful PDF, DOCX, and TXT parsing and for each typed failure. Include a regression that exercises the packaged PDF parser in a production-like runtime and detects native canvas/polyfill resolution failures.
- [ ] Run type-checking, unit/integration tests, and a clean production build from the locked dependency graph; link all results.

## 2. QA in the preview environment

Record fixture name/hash, expected outcome, actual HTTP status/error code, browser or client, tester, timestamp, and evidence for each case. Use synthetic documents with no personal or confidential data.

- [ ] A text-based **PDF** uploads and returns meaningful expected text.
- [ ] A valid **DOCX** uploads and returns meaningful expected text and structure.
- [ ] A valid **TXT** file uploads with its encoding and line breaks handled correctly.
- [ ] Truncated, corrupt, mislabeled, password-protected, and otherwise **malformed files** fail safely with the intended typed error and recovery message.
- [ ] A file just below the size limit succeeds; files at and above the defined **oversized-file** boundary behave according to the documented limit without excessive memory, CPU, or request duration.
- [ ] A **scanned/image-only PDF** is identified as having no extractable text (or follows the approved OCR path) and gives the intended recovery guidance; it must not be reported as a successful empty import.
- [ ] **Concurrent uploads** at the agreed canary load complete without cross-user data leakage, swapped results, unbounded resource growth, or an error/latency breach. Record concurrency, duration, payload mix, latency percentiles, and error rate.
- [ ] QA confirms uploaded test data is deleted or expires under the configured retention policy.

## 3. DevOps/SRE

- [ ] Download or inspect the immutable deployment artifact. Record its digest and attach a manifest proving that required PDF/native dependencies are present and unexpected build/test files or secrets are absent.
- [ ] Confirm the artifact's Node.js runtime is the supported production version declared by the application (`24.x`) and that native modules match the production OS and architecture.
- [ ] Confirm the running deployment reports or can be unambiguously mapped to the candidate commit SHA; record that SHA and the provider deployment ID in the release record.
- [ ] Verify health monitoring from outside the deployment. The health endpoint must be reachable, alerting must cover availability and dependencies, and the release-specific readiness signal must report **PDF ready** after a real parser probe—not merely process liveness.
- [ ] Verify searchable structured logs and alerts for upload error rate, PDF parse failure rate, latency/resource saturation, native-module resolution failures, and canvas/polyfill loader warnings. Trigger a test alert and record its routing and acknowledgement.
- [ ] Review the rollback procedure, permissions, immutable target deployment, database/config compatibility, communication channel, and owner. Exercise rollback in a safe environment or verify it with a recent representative exercise and attach evidence.
- [ ] Deploy a canary to the agreed traffic share or test cohort. Record deployment ID, start/end times, request count, dashboards, comparison baseline, and the person authorized to expand traffic.

## 4. Security and privacy

- [ ] Review the provenance of native dependencies and binaries: source registry, publisher/maintainer, exact version and integrity hash, build origin, supported platform, license, and review of install scripts. Document and approve any prebuilt binary.
- [ ] Run dependency/SBOM, vulnerability, license, and secret scans against the final artifact—not only the source tree. Triage findings and link accepted-risk approvals with owners and expiry dates.
- [ ] Verify uploads are treated as untrusted: server-side type/signature and size validation, randomized storage names, malware scanning, quarantine before processing, fail-closed handling when scanning is unavailable, restricted execution, and auditable release/deletion from quarantine.
- [ ] Confirm application, platform, scanner, and alert logs redact document contents, filenames when sensitive, user tokens, credentials, and personal data. Test redaction using marker values and restrict access to unredacted diagnostic data.
- [ ] Verify raw uploads, extracted text, quarantine objects, logs, and backups have documented retention/deletion schedules. Test deletion and legal-hold behavior and identify the responsible data owner.
- [ ] Verify least-privilege access for upload storage, quarantine, logs, deployment controls, and support tools. Test tenant/user authorization and record the latest access review, including break-glass access.

## 5. Product and support

- [ ] Validate user-facing recovery messages for unsupported, oversized, malformed, image-only, quarantined, and temporarily unavailable uploads. Each message must state what happened in plain language, preserve user work, offer a safe next action, and include a support correlation ID without exposing internals.
- [ ] Validate recovery with keyboard and screen-reader flows and confirm retry cannot create duplicate or cross-user results.
- [ ] Brief support on the incident runbook below, give the on-call team dashboard and escalation access, and link the published version from the support knowledge base.

### Support runbook: PDF upload incidents

**Scope:** elevated PDF upload failures, timeouts, empty extraction, native dependency errors, or reports that PDF upload is unavailable.

1. **Intake and protect data.** Record incident ID, start time, deployment ID, correlation IDs, file category/approximate size, and user-visible error code. Do not request the user's résumé by email or paste document contents, filenames, tokens, or personal data into tickets or chat. If a sample is essential, use the approved secure-upload and retention process or a synthetic reproducer.
2. **Triage.** Check PDF-ready health, upload/PDF error-rate and latency dashboards, quarantine/scanner health, deploy events, and alerts/logs using correlation IDs. Compare PDF failures with DOCX/TXT to distinguish parser-specific from service-wide impact. Never download a quarantined file to a workstation.
3. **Classify.** Determine whether the issue is unsupported/oversized/malformed/image-only input, malware quarantine, capacity/dependency degradation, or a release regression. For image-only files, recommend an approved OCR/text-export route; do not promise extraction where OCR is not supported.
4. **Escalate.** Page DevOps/SRE for threshold or health breaches, Engineering for parser/native-module errors, Security for malware/quarantine bypass or suspected exposure, and Privacy for possible personal-data leakage or retention failure. Product/support owns the status-page and customer message cadence.
5. **Mitigate.** Pause canary expansion. Use only approved mitigations (traffic reduction, feature disablement, or rollback); do not bypass scanning/quarantine, raise limits ad hoc, or log document contents. Give users the validated recovery message and correlation ID.
6. **Rollback.** The named rollback owner follows the release's verified provider rollback procedure, records the target and resulting deployment IDs/SHAs, and repeats health and deployed PDF smoke checks. Maintain incident command until metrics recover for the agreed observation window.
7. **Close and follow up.** Confirm recovery, update affected users/status page, preserve redacted evidence under the incident retention policy, remove temporary mitigations, and assign root-cause, regression-test, and prevention actions with owners and due dates.

## 6. Release management and canary evidence

- [ ] Every release-record field is complete, evidence links are accessible to reviewers, and each required discipline has a **named** approver with decision and timestamp.
- [ ] The release manager confirms the preview artifact tested by QA is the artifact promoted to canary; any rebuild or configuration drift requires revalidation.
- [ ] Record the canary deployment ID, deployed commit SHA, traffic cohort/share, observation window, request count, current/baseline error rates, health evidence, log query, and final decision.
- [ ] Hold a documented go/no-go review. “Go” is permitted only when all promotion criteria below pass and no open critical/high finding lacks a time-bounded approval.
- [ ] Name the primary and backup rollback owners, verify they have access and are available through the observation window, and record the exact rollback target.

## Promotion criteria (all mandatory)

Promote canary traffic only when every item below is checked. A missing signal is a failure, not an assumed pass.

- [ ] The deployed PDF smoke test passes against the exact canary deployment and demonstrates meaningful extraction from the known fixture.
- [ ] External health monitoring reports **PDF ready** based on a successful end-to-end parser probe.
- [ ] Canary request logs contain **no native canvas/polyfill loader warnings** (including missing `@napi-rs/canvas`, `DOMMatrix`, `ImageData`, or `Path2D`) during the observation window.
- [ ] Overall upload and PDF-specific error rates remain within the agreed threshold recorded above for the full agreed window, with adequate canary request volume; latency and resource signals show no material regression against baseline.
- [ ] Rollback has been exercised for this release in a safe environment or verified against a recent, representative, still-valid exercise; the owner, target, access, commands/procedure, and post-rollback checks are confirmed.

## Immediate rollback trigger

**Stop promotion and roll back immediately** if either (a) a native-module resolution error recurs—including a missing/incompatible canvas binary or missing canvas/polyfill global—or (b) the PDF upload failure rate materially breaches the agreed release threshold/window or is otherwise declared material by the incident commander because of user impact. Do not wait for the canary window to end. The rollback owner must preserve redacted evidence, record the trigger time and deployment IDs, execute the verified rollback, and rerun external health plus the deployed PDF smoke test before resolving the incident.
