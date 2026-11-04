---
kind: quick
---

# El aviso de la comprobación de tipos ignora comandos vacíos y tareas hechas

## Objetivo

Resuelve P69, P70 y P71, lo que dejó el cambio `20261104-fallo-de-tipos-con-contract`. El aviso `task-no-typecheck` callaba con un `verify.full` vacío, porque cualquier verificación contiene la cadena vacía (P69): ahora un comando vacío no cuenta. En un ajuste sin tareas de código nuevas, el aviso caía en la última tarea, ya hecha y que no se puede cambiar (P70): ahora no avisa si esa tarea está hecha, porque ese ajuste no añade código que comprobar. Y se añaden los tests de una spec `quick` y de la fase `closing`, que la regla exime (P71). `docs/formats.md` §2 lo cuenta.

## Archivos

- modificar packages/core/src/validate/quality.ts — un comando vacío no cuenta, y no avisa de una tarea hecha
- modificar packages/core/test/validate/quality.test.ts — los casos de P69, P70 y P71
- modificar docs/formats.md — el aviso solo mira una tarea pendiente

## Tareas

- [ ] T1: El aviso ignora los comandos vacíos y la última tarea de código ya hecha
  - files: packages/core/src/validate/quality.ts, packages/core/test/validate/quality.test.ts, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/quality.test.ts && pnpm typecheck && pnpm lint
  - type: fix
