# Repository Guidelines

## Build, Test, and Development Commands

- Frontend formatting: `pnpm format`
- Frontend checks: `pnpm lint` and `pnpm build`
- Backend formatting: `cargo fmt`
- Backend checks: `cargo clippy --all-targets --all-features -- -D warnings`

## Frontend Application Guidelines

- PortalOS applications should feel like independent desktop apps inside the shared window shell, not embedded external pages.
- Read-only content apps should use native React layouts instead of iframe embeds so theme, window sizing, navigation, and accessibility remain under project control.
- Keep user-facing UI text in locale files and access it through `react-i18next`; do not hard-code interface text in TSX.
- Markdown content should be rendered through the shared Markdown utility instead of ad hoc parsing in app views. Keep raw HTML rendering disabled unless a sanitizer and explicit threat model are added.
- Code blocks in Markdown articles should preserve copy behavior and readable styling across light and dark themes.

## Animal Island UI Design Guidelines

- `animal-island-ui` is the only base visual component library. Prefer its Button, Input, Card, Form, Modal, Tabs, Table, Tag, Tooltip, Loading, and Notification components instead of rebuilding equivalents.
- Before changing UI, read the installed package's `AI_USAGE.md`. Only use documented props; never invent APIs such as `variant`, `shape`, `rounded`, or `secondary`.
- Preserve the library's warm parchment surfaces, pill shapes, soft brown borders, teal primary actions, coral danger actions, and signature 3D primary-button shadow. Do not flatten these into a generic SaaS dashboard style.
- Custom CSS is allowed only for capabilities missing from the library. It must use PortalOS theme tokens and visually match the library's real colors, radii, borders, shadows, and motion.
- Do not introduce another UI framework or theme-disconnected browser controls. When a custom control is unavoidable, document why the component library cannot provide it.
- Icons should remain rounded, friendly, and island-life oriented. Avoid dense enterprise-dashboard iconography.
- Motion must be short and gentle and must respect `prefers-reduced-motion`.
- Verify every new or changed page in light and dark themes, desktop and minimum window sizes, mobile layout, keyboard navigation, and reduced-motion mode.

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
- During the alpha phase, do not keep legacy routes, types, adapters, or data migration bridges unless the task explicitly requires them.
- When a bug is caused by backend, engine, state machine, or lifecycle timing issues, do not add frontend “stopgap” patches to mask it. Fix the source of truth first, and only adjust frontend logic when the root cause is genuinely on the frontend side.

## Communication

- Please respond in chinese by default.
