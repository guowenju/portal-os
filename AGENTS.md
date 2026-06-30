# Repository Guidelines

## Build, Test, and Development Commands

- Frontend formatting: `pnpm format`
- Frontend checks: `pnpm lint` and `pnpm build`
- Backend formatting: `cargo fmt`
- Backend checks: `cargo clippy --all-targets --all-features -- -D warnings`

## Frontend Application Guidelines

- PortalOS applications should feel like independent desktop apps inside the shared window shell, not embedded external pages.
- Read-only content apps such as Docs should prefer native Vue layouts over iframe embeds so theme, window sizing, navigation, and accessibility remain under project control.
- Keep user-facing UI text in locale files and access it through `vue-i18n`; do not hard-code interface text in Vue templates.
- Markdown content should be rendered through the shared Markdown utility instead of ad hoc parsing in app views. Keep raw HTML rendering disabled unless a sanitizer and explicit threat model are added.
- Code blocks in Markdown articles should preserve copy behavior and readable styling across light and dark themes.

## Documentation Guidelines

- Add Chinese documentation comments for frontend/backend functions, structs, and modules; Rust docs must use `//!` and `///` and comply with `cargo doc` conventions.
- CHANGELOG entries should be user-facing; avoid implementation details and internal refactors.
- Please use Chinese for document content (including README and design documents).

## Commit & Pull Request Guidelines

- Commit messages follow a Conventional Commits-style prefix such as `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, or `build:`.
- Keep commits scoped and descriptive; separate refactors from behavior changes when possible.

## Development Process

- If a task requires modifying more than five files, pause first and break it down into updated tasks.
- Before writing any code, please describe your proposed approach and wait for approval. If the requirements are unclear, make sure to ask clarifying questions before writing any code.
- After modifying frontend code, run `pnpm format`, `pnpm lint`, and `pnpm build`.
- After modifying backend Rust code, run `cargo fmt` and `cargo clippy --all-targets --all-features -- -D warnings`.
- During refactor, compatibility is not required; prioritize a clean redesign.
- When a bug is caused by backend, engine, state machine, or lifecycle timing issues, do not add frontend “stopgap” patches to mask it. Fix the source of truth first, and only adjust frontend logic when the root cause is genuinely on the frontend side.

## Communication

- Please respond in chinese by default.
