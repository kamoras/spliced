# Security Policy

Spliced is a static front-end plus a few stateless serverless proxy functions.
It stores no accounts and no personal data (your daily result is kept only in
your own browser's `localStorage`).

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report
them privately via GitHub's
[security advisories](https://github.com/kamoras/spliced/security/advisories/new)
for this repository. We'll acknowledge the report and work on a fix.

## Scope notes

- The `/api/audio` proxy is intentionally restricted to Apple's media hosts so
  it cannot be used as an open proxy.
- Dependencies are monitored by Dependabot, and security/patch/minor updates are
  merged automatically once CI passes.
