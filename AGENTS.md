# Repository Guidelines

## Project Structure & Module Organization

NEVKO-UI is a Steam theme for Millennium. It loads CSS and JavaScript directly.

- `skin.json` defines theme metadata, settings, and file injection rules. Register new files under the correct condition or patch entry.
- `Main Design/` contains the header, library, settings, context menus, and friends/chat interface.
- `Features/` contains optional appearance and behavior changes.
- `Patches/` contains Steam fixes, shared colors, and icon assets.
- `Credits/` contains contributor badges and support controls. `github/` contains README images.

Preserve path spelling and case in `skin.json`.

## Build, Test, and Development Commands

There is no package manager configuration, build step, or development server. Put the repository folder in `Steam/millennium/themes`, select it in Millennium settings, and restart Steam.

Run these checks from the repository root with Python and Node.js available:

- `python -m json.tool skin.json /dev/null` — check JSON syntax.
- `node --check "Patches/Safe Triangle/Safe Triangle.js"` — check JavaScript syntax without execution; substitute the changed file.
- `git diff --check` — check the diff for whitespace errors.

## Coding Style & Naming Conventions

Match the surrounding file: JavaScript uses two or four spaces; CSS commonly uses tabs; JSON mainly uses two spaces. Preserve local quote and semicolon style. No formatter or linter is configured.

Use descriptive feature names, such as `Steam Submenus.js`. Use camelCase for functions and variables, and UPPER_SNAKE_CASE for constants. Keep CSS separate from behavior. Use existing Millennium helpers where applicable. Remove obsolete paths instead of adding compatibility layers.

## Testing Guidelines

There is no automated test suite or coverage target. First reproduce the affected behavior in Steam. Check the changed interface and each affected setting in both enabled and disabled states. For menu changes, check pointer movement, clicks, and keyboard dismissal. Confirm that referenced manifest files exist. Syntax checks do not prove correct Steam behavior. Add tests only for a confirmed need.

## Commit & Pull Request Guidelines

Use short imperative subjects, such as `Fix popup menu sizing`. Keep each commit focused. Describe the problem, resulting behavior, and checks performed. Link related issues and include screenshots for visible changes. State any checks that remain incomplete.
