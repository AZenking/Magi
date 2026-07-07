<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0
- Initial adoption (MAJOR: new governance, no prior version to preserve compatibility with).

Modified principles:
- N/A (initial constitution; all principles are new).

Added sections:
- Core Principles (I–VI)
- Technology Stack Standards
- Development Workflow & Quality Gates
- Governance

Removed sections:
- N/A

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — Constitution Check section is generic (`[Gates determined based on constitution file]`); resolves correctly against these principles. No edit required.
- ✅ .specify/templates/spec-template.md — generic; no constitution-specific references.
- ✅ .specify/templates/tasks-template.md — generic; task phases map naturally to constitution principles (Clean Architecture layers, Async-First, etc.).
- ✅ .specify/templates/checklist-template.md — generic; no constitution-specific references.

Follow-up TODOs:
- None. All placeholders resolved.
-->

# MAGI Constitution

## Core Principles

### I. Clean Architecture (Layered)

The backend (API and Worker) MUST follow a strict layered design:

```txt
HTTP/Controller → Application/UseCase → Domain → Infrastructure/Repository → Database
```

- Dependencies ONLY flow downward. Lower layers MUST NOT import from higher layers.
- **Controller** (`http/`): param validation, DTO conversion, response shaping. MUST NOT contain business logic or DB calls.
- **Application / UseCase** (`application/`): business orchestration, transaction control, permission checks. One UseCase per business action. MUST NOT contain SQL or ORM-specific code.
- **Domain** (`domain/`): business rules, state transitions, invariants (e.g., "channel cannot be deleted while …", "programmes must not overlap").
- **Infrastructure** (`infrastructure/`): technical implementations (Drizzle, Redis, BullMQ, XML parsers).

**Rationale**: A personal long-term-maintained project cannot afford layering rot. Keeping layers strict lets future-you change Drizzle, NestJS, or BullMQ without touching business rules.

### II. Monorepo with Shared Packages

The repository is a Turborepo + pnpm workspace with two top-level trees:

- `apps/` — deployable applications: `web`, `api`, `worker`, `tv`.
- `packages/` — shared code: `types`, `ui`, `utils`, `backend-core`, `tsconfig`.

Rules:

- DTOs, Enums, VOs, and Zod schemas MUST be defined once in `packages/types` and imported by every app. Duplicating a type across apps is forbidden.
- Cross-app code reuse goes through `packages/*`, never through direct app-to-app imports.
- A new package MUST have a clear, single purpose; organizational-only packages (just a folder) are not allowed.

**Rationale**: Frontend and backend share one source of truth for contracts, eliminating the "type drifted between web and api" failure mode.

### III. Domain Independence

The `domain/` layer MUST NOT depend on:

- Frameworks (NestJS, Express, React, etc.).
- ORMs or database clients (Drizzle, pg, Knex).
- Infrastructure concerns (Redis, BullMQ, filesystem).

Repositories are exposed as interfaces in the application/domain layer; their concrete implementations live in `infrastructure/`. UseCases depend on interfaces, not on Drizzle classes.

**Rationale**: Business rules are the highest-value, slowest-changing code. They must survive replacement of any framework or vendor.

### IV. Async-First for Heavy Work

Long-running operations MUST be offloaded to the Worker via BullMQ. The API MUST respond immediately with a Task handle; clients poll `GET /tasks/:id` for status.

Examples of mandatory async:

- XMLTV / M3U source import and parsing
- Source sync, scheduled refresh, availability checks
- Stream probing and bulk stream checks
- EPG matching and EPG refresh

The Worker mirrors the API's layered architecture (`application/`, `domain/`, `infrastructure/`).

**Rationale**: A single XMLTV source can take minutes to import. Blocking API requests degrades the admin UI for every user and risks proxy timeouts.

### V. Type-Safe End-to-End

TypeScript is mandatory across the entire monorepo. Rules:

- `any` is forbidden without an inline justification comment. Prefer `unknown` + narrowing.
- Zod schemas are the single source of truth; TypeScript types are inferred via `z.infer<typeof Schema>`. Do not hand-write parallel interfaces.
- API contract changes MUST be made in `packages/types` first, then consumed by `apps/api` and `apps/web`.
- `eslint` and `tsc --noEmit` MUST pass before merge.

**Rationale**: Catching a contract drift at compile time is ~1000× cheaper than catching it when the admin UI hits a 500 in production.

### VI. Long-Term Maintainability (Single-Developer Friendly)

MAGI is maintained primarily by one person. Code MUST be optimized for "future-you in six months", not for showing off cleverness.

- **YAGNI**: don't build for hypothetical future requirements. Add abstractions only when the third concrete case appears.
- Prefer deletion over abstraction. Three similar lines are better than a premature generic helper.
- Comments explain **WHY**, never **WHAT**. Well-named identifiers already say what.
- Every feature should be explainable in one paragraph in `docs/` or a spec; if you can't, the design is too complex.

**Rationale**: A solo maintainer has no team to reverse-engineer past decisions. Simplicity compounds; cleverness decays.

## Technology Stack Standards

The stack is fixed. Replacements require a constitution amendment.

| Layer | Required Technology |
|-------|---------------------|
| Frontend framework | TanStack Start (Vite), TanStack Router, React 19 |
| Styling | TailwindCSS 4, shadcn/ui |
| Server state | TanStack Query, TanStack Table |
| Client state | Zustand |
| Auth | better-auth (email/password) |
| Backend framework | NestJS |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Cache / queue | Redis, BullMQ |
| Validation | Zod |
| Build / repo | Turborepo, pnpm (Node ≥ 20) |
| Deployment | Docker, Docker Compose |

- New runtime dependencies MUST be justified in the PR description (why existing deps can't do the job).
- `package.json` scripts stay minimal; Docker and infra bootstrap logic lives in `scripts/*.sh`.

## Development Workflow & Quality Gates

- **Local bootstrap**: `bash scripts/init-dev.sh` is the canonical way to bring up PostgreSQL + Redis, run migrations, and seed the admin user. Manual `docker run` setups MUST NOT diverge from this script.
- **Schema changes**: any change to Drizzle schemas MUST be paired with `db:generate` + `db:migrate` migration files committed in the same PR.
- **Quality gates (MUST pass before merge)**:
  - `pnpm lint`
  - `pnpm build`
  - `tsc --noEmit` per package
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Scope allowed (e.g., `feat(api): …`).
- **Spec-first**: non-trivial features SHOULD be preceded by a spec under `.specify/specs/<feature>/`. Trivial fixes do not.
- **Tests**: when adding tests, follow Red-Green-Refactor — write the failing test first, then the implementation. Tests live next to source or under a `tests/` mirror, matching the layer they cover.

## Governance

- This constitution is the **supreme authority** for architecture and code-style disputes. When `README.md`, `docs/architecture.md`, or any other doc conflicts with this file, **the constitution wins** — and the conflicting doc MUST be updated to match.
- **Amendments** require:
  1. A written rationale in the PR description.
  2. An updated **Sync Impact Report** at the top of this file.
  3. A semver bump of `CONSTITUTION_VERSION` (MAJOR/MINOR/PATCH per the rules below).
- **Versioning policy**:
  - **MAJOR**: principle removed or fundamentally redefined; non-backward-compatible governance change.
  - **MINOR**: new principle or materially expanded guidance added.
  - **PATCH**: clarifications, wording, typos, non-semantic refinements.
- **Compliance review**: every PR review MUST include an implicit check that the change does not violate any principle in this file. Where a violation is intentional (justified complexity), it MUST be recorded in the plan's "Complexity Tracking" section.
- **Runtime development guidance**: refer to `README.md` for setup, `docs/architecture.md` for layer/routing details, and `.specify/specs/<feature>/` for in-flight feature specs.

**Version**: 1.0.0 | **Ratified**: 2026-07-07 | **Last Amended**: 2026-07-07
