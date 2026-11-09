---
kind: standard
---

# Los textos y la protección que quedaban de Gemini CLI se van

## Objetivo

Último de los cambios consecutivos que retiran Gemini CLI, que Antigravity reemplaza (decisión de la persona del 2026-11-10: se quita todo, no se deshabilita). Sin su módulo de agente, quedaban los restos que solo existían por él: el guard aún protegía `.gemini/settings.json` como los hooks de un agente, `specty uninstall` aún decía que `GEMINI.md` sigue importando `AGENTS.md`, y core aún tenía y exportaba los textos de su instalación y sus códigos de `doctor`. Se van, ARCHITECTURE deja de nombrarlos y el ADR 0018 lleva una nota de que Gemini CLI se retiró.

## Fuera de alcance

- Los tests que comprueban que Gemini CLI ya no está (la tabla de capacidades, la detección, la orden de `new`, las exclusiones): se quedan, porque son los criterios de los cambios anteriores.
- Lo de Antigravity que comparte nombre con Gemini (`~/.gemini/antigravity-cli/`, `ANTIGRAVITY_GEMINI_DIR`, los modelos `gemini-…`), que se queda; y `stats/summary.test.ts`, que usa `gemini` como nombre de una herramienta cualquiera.
- Reescribir los ADR: son históricos. El ADR 0013 no nombra a Gemini CLI (solo la carpeta de Antigravity, `~/.gemini/antigravity-cli`), así que no lleva nota.

## Supuestos

- A1: Ninguna instalación tiene ya el guard de Gemini CLI que proteger: Specty aún no está publicado y este repositorio no tiene `.gemini/`, así que `.gemini/settings.json` pasa a ser un archivo más de la persona.
  - impacto: medio
- A2: Los textos y códigos de Gemini CLI de core solo los usaba su módulo de agente, ya borrado; quitarlos de `cards/index.ts` no deja a ningún paquete sin algo que importa.

## Criterios de aceptación

- AC1: CUANDO el agente escribe o borra `.gemini/settings.json` ENTONCES el guard lo trata como un archivo más, no como los hooks protegidos de un agente; los de Antigravity (`.agents/hooks.json`) y Devin (`.devin/hooks.v1.json`) siguen protegidos.
- AC2: CUANDO `specty uninstall` quita Specty de un repositorio que tiene un `GEMINI.md` ENTONCES no dice nada de ese archivo y no lo toca; sigue diciendo que `CLAUDE.md` importa `AGENTS.md`.
- AC3: CUANDO se buscan en core los textos de instalación, de `doctor` y de `uninstall` de Gemini CLI ENTONCES no queda ninguno ni se exporta.
  - test: manual
- AC4: CUANDO se leen ARCHITECTURE y el ADR 0018 ENTONCES ARCHITECTURE no nombra `.gemini/settings.json` entre los archivos protegidos ni `GEMINI.md` en lo que deja `uninstall`, y el ADR 0018 dice que Gemini CLI se retiró el 2026-11-10 en favor de Antigravity, sin reescribirlo.
  - test: manual

## Diseño

- core `guard/spec.ts`: `.gemini/settings.json` sale de los archivos protegidos.
- cli `commands/uninstall.ts`: sin la línea de `GEMINI.md`; `install/project-files.ts`: sin `GEMINI_POINTER`. core `cards/uninstall.ts`: sin `geminiPointerStaysLine`.
- core `cards/install.ts`: sin `geminiPointerLine`, `geminiTrustWarning`, `geminiSandboxLine` ni `geminiSandboxVersionedWarning`. `cards/doctor.ts` y `cards/doctor-agents.ts`: sin los códigos `gemini-guard`, `no-gemini-guard` ni `gemini-hooks`. `cards/index.ts`: sin sus exportaciones.
- Las tareas son `chore` y no `refactor`: retiran una función con sus tests, y con `policy.tests: contract` un refactor no puede quitar aserciones.

## Archivos

- modificar packages/core/src/guard/spec.ts — `.gemini/settings.json` deja de estar protegido
- modificar packages/core/test/guard/decide.test.ts — `.gemini/settings.json` como archivo de la persona
- modificar docs/ARCHITECTURE.md — sin `.gemini/settings.json` entre los protegidos ni `GEMINI.md` en `uninstall`
- modificar packages/cli/src/commands/uninstall.ts — sin la línea de `GEMINI.md`
- modificar packages/cli/src/install/project-files.ts — sin `GEMINI_POINTER`
- modificar packages/core/src/cards/uninstall.ts — sin `geminiPointerStaysLine`
- modificar packages/core/src/cards/index.ts — sin las exportaciones de Gemini CLI
- modificar packages/cli/test/uninstall.test.ts — `uninstall` no nombra `GEMINI.md`
- modificar packages/core/src/cards/install.ts — sin los textos de la instalación de Gemini CLI
- modificar packages/core/src/cards/doctor.ts — sin los códigos de Gemini CLI
- modificar packages/core/src/cards/doctor-agents.ts — sin las líneas de esos códigos
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — la nota de que Gemini CLI se retiró

## Tareas

- [x] T1: El guard deja de proteger `.gemini/settings.json`
  - files: packages/core/src/guard/spec.ts, packages/core/test/guard/decide.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
  - type: chore
- [ ] T2: `specty uninstall` deja de nombrar `GEMINI.md`
  - files: packages/cli/src/commands/uninstall.ts, packages/cli/src/install/project-files.ts, packages/core/src/cards/uninstall.ts, packages/core/src/cards/index.ts, packages/cli/test/uninstall.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/uninstall.test.ts
  - type: chore
- [ ] T3: Core deja de tener los textos de instalación y de `doctor` de Gemini CLI
  - files: packages/core/src/cards/install.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/src/cards/index.ts, docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm lint && pnpm typecheck && pnpm sources && pnpm knip
  - type: chore
