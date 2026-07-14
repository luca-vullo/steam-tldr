# Security Policy

## Reporting a vulnerability

If you find a vulnerability, please **do not open a public issue**. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) on this repository
(Security tab → "Report a vulnerability").

Please include: affected file/function, reproduction steps, and impact. You can
expect an acknowledgement within a few days. Fixes are released as a new version
and credited to the reporter unless you prefer otherwise.

## Scope

In scope:

- Any way for a page, a review text, or a model response to execute code or
  exfiltrate data from the extension
- Any way for an API key to reach a destination other than its own profile's
  endpoint
- Permission escalation beyond what is described in
  [docs/SECURITY.md](docs/SECURITY.md)

Out of scope:

- Vulnerabilities in the AI providers' services themselves
- The user deliberately configuring a malicious endpoint in a profile (the
  endpoint is user-chosen by design; see the threat model)

## Supported versions

Only the latest release is supported. There is no backporting.

## Audit guide

The codebase is small (~1,500 lines of TypeScript) and designed to be auditable
in one sitting. Start from [docs/SECURITY.md](docs/SECURITY.md): it contains the
threat model, the complete data-flow map, the permissions rationale, and a
checklist of invariants you can verify mechanically (e.g. with `grep`).
