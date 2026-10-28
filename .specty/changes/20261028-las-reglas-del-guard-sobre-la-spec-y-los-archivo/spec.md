---
kind: quick
---

# Las reglas del guard sobre la spec y los archivos protegidos, en su archivo

## Objetivo

`guard/decide.ts` tiene 302 líneas de código, por encima del aviso de 300, y el corte C3 de la épica «Tests como contrato» va a añadirle la regla de los tests bloqueados. El guard ya tiene cada regla en su propio archivo (`integration.ts`, `session.ts`, `testing.ts`, `worktrees.ts`). Este cambio lleva a `guard/spec.ts` la lista de archivos protegidos y lo que se puede hacer con `spec.md` en cada fase, sin cambiar ninguna decisión ni ningún texto, y los tests del guard no cambian.

## Archivos

- modificar packages/core/src/guard/decide.ts — usa las reglas de `guard/spec.ts`
- crear packages/core/src/guard/spec.ts — los archivos protegidos y el acceso a la spec por fase

## Tareas

- [x] T1: Las reglas de la spec y de los archivos protegidos, en guard/spec.ts
  - files: packages/core/src/guard/decide.ts, packages/core/src/guard/spec.ts
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard && pnpm --filter @baquia-dev/specty-core typecheck
  - type: refactor
