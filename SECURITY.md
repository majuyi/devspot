# Security

## Reporting a vulnerability

Report privately on GitHub from the repository's
[Security tab](https://github.com/majuyi/devspot/security/advisories/new). Please do not open
a public issue. An email address arrives with the project's domain at launch.

Include what you found, how to reproduce it, and what an attacker could do with it.

## Scope

The public site and API are read-only. The only privileged surface is `/admin`, gated by a
single maintainer token. The engine runs in GitHub Actions with a database role limited to
the tables it writes (`docs/09-operations.md` §3). Scrapers respect `robots.txt` and identify
themselves with a contact URL.

The organisations' own sites listed in `registry/` are not ours; report issues with them to
those organisations.
