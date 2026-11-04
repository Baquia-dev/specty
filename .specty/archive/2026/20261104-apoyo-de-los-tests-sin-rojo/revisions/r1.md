---
kind: quick
---

# Los archivos de apoyo de los tests no tienen que fallar

## Objetivo

Resuelve P39. Con `policy.tests: contract`, `specty propose` en la fase de tests exige que la salida de la verificación que falla nombre cada test nuevo o modificado. Un archivo de apoyo de los tests (un helper como `packages/cli/test/support.ts`) no declara ningún test, así que nunca sale en esa salida y el envío se rechaza siempre. Con este cambio, la exigencia solo cuenta los archivos que declaran algún caso de test, por el catálogo de `testCases` de core, que sirve en cualquier stack. Un archivo de apoyo va en el envío y queda bloqueado con los demás, sin que se le pida fallar. Un test que declara casos y no sale en la salida se sigue rechazando.

## Archivos

- modificar packages/cli/src/commands/tests.ts — el rojo solo exige que se nombren los archivos que declaran casos de test
- modificar packages/cli/test/testing-phase.test.ts — un archivo de apoyo sin casos se envía con los tests
- modificar docs/ARCHITECTURE.md — la regla del rojo en la fase de tests (§4)

## Tareas

- [ ] T1: El rojo de los tests no pide fallar a un archivo de apoyo sin casos
  - files: packages/cli/src/commands/tests.ts, packages/cli/test/testing-phase.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
