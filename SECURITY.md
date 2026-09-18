# Security

Report vulnerabilities by email to the maintainer listed in `package.json` (to be added at
M5) or by opening a private security advisory on GitHub. Do not open a public issue.

The public surface is read-only. The only privileged surface is `/admin`, gated by a single
maintainer token. Scrapers respect `robots.txt` and identify themselves.
