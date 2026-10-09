# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog.

## Unreleased

- Specification set, ADRs, CLAUDE.md, skills and the M0 workspace scaffold.
- ADR 0015 accepted: Apache-2.0. Generated JSON Schema in docs/schema is excluded from Biome so builds leave the tree clean.
- First Prisma migration (`20261009000000_init`), generated offline from the schema.
- M0.1: dependency rule now enforced in full by Biome (fetchers could import `@devspot/db`, web could import the engine); `ci` script added (`pnpm run ci`).
