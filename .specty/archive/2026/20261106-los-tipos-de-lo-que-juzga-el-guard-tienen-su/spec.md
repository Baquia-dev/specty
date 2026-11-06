---
kind: standard
---

# Los tipos de lo que juzga el guard tienen su propio módulo

## Objetivo

`packages/core/src/guard/decide.ts` tiene 323 líneas de código (el aviso salta en 300) desde que la regla `change-folder` llevó al guard a juzgar quién quita la carpeta de un cambio abierto (P207). Mezcla dos responsabilidades: los tipos de lo que el guard juzga y las reglas que lo deciden. Con este cambio, los tipos pasan a `guard/action.ts` y `decide.ts` se queda solo con `decideGuard` y sus reglas, sin que cambie nada de lo que hace el guard ni la API pública de core.

## Fuera de alcance

- Cambiar cualquier regla, texto o decisión del guard.
- Partir las reglas de `decide.ts` en más archivos.

## Supuestos

- A1: Los tipos que se mueven son `GuardChange`, `GuardContext`, `ShellFacts`, `GuardAction`, `GuardRule` y `GuardDecision`; `index.ts` y `guard/after.ts` los importan de `guard/action.ts`, y `decide.ts` no los reexporta. Los tests que ya existen los importan de `src/index.ts` y cubren lo que se mueve.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --changed` sobre este cambio ENTONCES no avisa del tamaño de `packages/core/src/guard/decide.ts` ni de `packages/core/src/guard/action.ts`.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa sin cambiar ningún test que ya existía, y `packages/core/src/index.ts` exporta los mismos nombres.
  - test: manual

## Diseño

- `guard/action.ts`, nuevo: los seis tipos, con sus comentarios, tal cual.
- `guard/decide.ts`: importa de `./action` los tipos que usa; mantiene `decideGuard`, sus reglas y la reexportación de `HUMAN_COMMANDS`.
- `index.ts`: exporta los tipos de `./guard/action`, y `decideGuard` y `HUMAN_COMMANDS` de `./guard/decide`. `guard/after.ts` importa de `./action` los tipos.

## Archivos

- crear packages/core/src/guard/action.ts — los tipos de lo que juzga el guard
- modificar packages/core/src/guard/decide.ts — solo `decideGuard` y sus reglas
- modificar packages/core/src/guard/after.ts — importa los tipos de `./action`
- modificar packages/core/src/index.ts — exporta los tipos de `./guard/action`

## Tareas

- [x] T1: Los tipos de lo que juzga el guard pasan a guard/action.ts
  - files: packages/core/src/guard/action.ts, packages/core/src/guard/decide.ts, packages/core/src/guard/after.ts, packages/core/src/index.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor

## Cierre

### Resumen

Los tipos de lo que juzga el guard (`GuardChange`, `GuardContext`, `ShellFacts`, `GuardAction`, `GuardRule` y `GuardDecision`) pasan, tal cual y con sus comentarios, a `packages/core/src/guard/action.ts` (P207). `decide.ts` queda solo con `decideGuard` y sus reglas, y baja de 323 a 243 líneas de código. `index.ts` exporta los mismos nombres, los tipos desde `./guard/action`, y `after.ts` también los importa de allí. No cambia nada de lo que hace el guard. La verificación completa pasó en la aceptación sin cambiar ningún test, y el `check` de la tarea ya no avisa del tamaño de `decide.ts` (AC1, AC2).

### Desviaciones

- Ninguna.

### Decisiones

- `decide.ts` no reexporta los tipos: quien los usa los importa de `./action`, para que no haya dos caminos.

### Pendientes

- Ninguno.
