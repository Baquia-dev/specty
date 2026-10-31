---
kind: standard
---

# Hints con ejemplos en preguntas de selección de init y soporte completo de ramas de Git Flow

## Objetivo

Las preguntas de selección de `specty init` (idioma, agentes y flujo de Git) deben ofrecer un `hint` en cada opción explicando con ejemplos qué implica cada una para guiar la decisión del usuario. Asimismo, en las formas de trabajar con Git, Git Flow pasa a soportar el conjunto completo de ramas del flujo (`feature/<slug>`, `bugfix/<slug>`, `hotfix/<slug>`, `release/<slug>` y `support/<slug>`), ampliando los tipos de cambio admitidos para que ningún flujo de Git quede recortado.

## Fuera de alcance

- Crear ramas automáticas en repositorios remotos o interactuar con APIs externas de Git.
- Modificar retroactivamente ramas de cambios ya creados o cerrados.
- Añadir comandos nuevos de flujo de Git más allá de los tipos de cambio y la resolución de ramas semánticas.

## Supuestos

- A1: En Git Flow, un cambio `fix` va en `bugfix/<slug>`, `hotfix` en `hotfix/<slug>`, `release` en `release/<slug>`, `support` en `support/<slug>`, y el resto de tipos (`feat`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `style`) en `feature/<slug>`, mientras que un spike va en `spike/<slug>`.
  - impacto: alto
- A2: Los tipos de cambio `--type` admiten `hotfix`, `release` y `support` además de los tipos existentes de Conventional Commits, permitiendo usarlos tanto en Git Flow como en GitHub Flow y Trunk-based development.
  - impacto: medio
- A3: `Terminal.choose` y `Terminal.chooseMany` reciben en sus opciones un campo opcional `hint?: string`, el cual `systemTerminal` traslada directamente a las opciones de `select` y `multiselect` de `@clack/prompts`.
- A4: Las opciones de idioma (`languageChoices`), agentes (`agentChoices`) y flujo de Git (`flowChoices`) proporcionan un texto explicativo con ejemplos claros en su propiedad `hint`, respetando el idioma de la interacción (`es` o `en`, o bilingüe en la pregunta inicial de idioma).

## Criterios de aceptación

- AC1: CUANDO se presenta la pregunta de selección de idioma en `specty init` ENTONCES cada opción incluye un `hint` con ejemplos descriptivos (`es`: "Comandos, tarjetas y especificaciones en español (ej. specty new, tareas)"; `en`: "Commands, specs, and cards in English (e.g. specty new, tasks)").
- AC2: CUANDO se presenta la pregunta de selección de agentes en `specty init` ENTONCES cada opción de herramienta incluye un `hint` explicando qué instala y con qué entorno/agente se usa con ejemplos (Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Copilot, Windsurf y Antigravity).
- AC3: CUANDO se presenta la pregunta de selección de flujo de Git en `specty init` ENTONCES cada opción describe la convención de ramas y un `hint` con ejemplos concretos (Specty, GitHub Flow, Git Flow y Trunk-based development), reflejando en Git Flow sus ramas completas.
- AC4: CUANDO `git.flow` es `gitflow` y se crea un cambio con `specty new` ENTONCES la rama es `bugfix/<slug>` para `fix`, `hotfix/<slug>` para `hotfix`, `release/<slug>` para `release`, `support/<slug>` para `support`, `feature/<slug>` para `feat` y demás tipos cotidianos, y `spike/<slug>` para spikes.
- AC5: CUANDO se crea un cambio con `--type hotfix`, `--type release` o `--type support` bajo `github` o `trunk` ENTONCES la rama generada utiliza ese tipo como prefijo (`hotfix/<slug>`, `release/<slug>`, `support/<slug>`).
- AC6: CUANDO `init` o `doctor` detectan el flujo del repositorio ENTONCES reconocen Git Flow también por la presencia de ramas con prefijo `support/` además de `feature/`, `bugfix/`, `release/`, `hotfix/` o `develop`.
- AC7: CUANDO se ejecuta `specty init` en una terminal interactiva ENTONCES las opciones de selección en `@clack/prompts` reciben y muestran el `hint` correspondiente junto a la etiqueta de la opción.
- AC8: CUANDO se leen `docs/ARCHITECTURE.md` y `docs/formats.md` ENTONCES reflejan el soporte completo de ramas de Git Flow y los nuevos tipos de commit admitidos.

## Diseño

- `packages/core/src/spec/model.ts`:
  - `CommitType` y `COMMIT_TYPES` se amplían con `"hotfix"`, `"release"` y `"support"`.
- `packages/core/src/branches.ts`:
  - `prefixOf(flow, type)`: para `gitflow`, mapea `fix` -> `bugfix`, `hotfix` -> `hotfix`, `release` -> `release`, `support` -> `support`, y los demás tipos cotidianos a `feature`.
- `packages/core/src/cards/init.ts`:
  - `FLOW_BRANCHES[gitflow]` se actualiza para enumerar todas las ramas: `feature/<slug>, bugfix/<slug>, release/<slug>, hotfix/<slug> y support/<slug>`.
  - `languageChoices(detected)` añade `hint` bilingüe con ejemplos a español e inglés.
  - `agentChoices(detected, lang)` añade `hint` en el idioma correspondiente para cada una de las 8 herramientas soportadas.
  - `flowChoices(detected, lang)` añade `hint` explicando el estilo y ramas de cada flujo de Git.
- `packages/cli/src/session.ts` y `packages/cli/src/terminal.ts`:
  - `Terminal.choose` y `chooseMany` admiten `readonly hint?: string;` en sus opciones y lo pasan a `select` y `multiselect` de `@clack/prompts`.
- `packages/cli/src/install/git-flow.ts`:
  - `GIT_FLOW_PREFIXES` incluye `"support/"`.
- Documentación:
  - `docs/ARCHITECTURE.md` y `docs/formats.md` se actualizan con la tabla y descripciones ampliadas de Git Flow y tipos.

## Archivos

- modificar packages/core/src/spec/model.ts — tipos de commit ampliados con hotfix, release y support
- modificar packages/core/src/branches.ts — soporte de prefijos completos de Git Flow en prefixOf
- modificar packages/core/src/cards/init.ts — hints con ejemplos en languageChoices, agentChoices, flowChoices y FLOW_BRANCHES
- modificar packages/cli/src/session.ts — hint opcional en opciones de Terminal
- modificar packages/cli/src/terminal.ts — propagar hint a select y multiselect de @clack/prompts
- modificar packages/cli/src/install/git-flow.ts — prefijo support/ en detección de Git Flow
- modificar packages/core/test/branches.test.ts — tests de ramas completas de Git Flow y tipos nuevos
- modificar packages/core/test/cards/init.test.ts — tests de opciones con hint y ramas en flowChoices y agentChoices
- modificar packages/core/test/cards/language.test.ts — tests de languageChoices con hint
- modificar packages/cli/test/init-git-flow.test.ts — tests de detección y flujo con ramas y hints
- modificar packages/cli/test/terminal.test.ts — tests de choose y chooseMany con hints
- modificar docs/ARCHITECTURE.md — documentación de flujos y ramas
- modificar docs/formats.md — especificación de formatos con flujos y tipos

## Tareas

- [ ] T1: Tipos de commit ampliados y ramas completas de Git Flow en core
  - files: packages/core/src/spec/model.ts, packages/core/src/branches.ts, packages/core/test/branches.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core test test/branches.test.ts
- [ ] T2: Opciones de selección con hints explicativos y ejemplos en cards de init
  - files: packages/core/src/cards/init.ts, packages/core/test/cards/init.test.ts, packages/core/test/cards/language.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core test test/cards/init.test.ts test/cards/language.test.ts
- [ ] T3: Soporte de hint en Terminal y passthrough a @clack/prompts, y detección de soporte en CLI
  - files: packages/cli/src/session.ts, packages/cli/src/terminal.ts, packages/cli/src/install/git-flow.ts, packages/cli/test/terminal.test.ts, packages/cli/test/init-git-flow.test.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty test test/terminal.test.ts test/init-git-flow.test.ts
- [ ] T4: Documentación actualizada de flujos y tipos de commit en arquitectura y formatos
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC8
  - verify: pnpm check
  - type: docs
