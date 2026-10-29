---
kind: quick
---

# accept incorpora main antes de su verificación y close no la repite

## Objetivo

Cuando main avanzó, `accept` verifica el código de la rama y después `close` fusiona main y verifica otra vez; en un cambio quick, las dos verificaciones van seguidas en el mismo `accept`. En la semana medida, 122 de 138 merges de main ya estaban disponibles al aceptar, unas 3,5 horas de `pnpm check` de más. `accept` pasa a fusionar main en la rama del cambio antes de su verificación completa, la del merge queda anotada como `change.verified` y `accept` la reutiliza, y `close` solo fusiona y verifica si main avanzó desde el `accept`. La carpeta de main solo se comprueba antes de llevar el cambio a main, como hasta ahora.

## Archivos

- modificar packages/cli/src/commands/accept.ts — fusiona main antes de la verificación completa y muestra lo que entró
- modificar packages/cli/src/flow/integrate.ts — separa el merge de la comprobación de la carpeta de main, y anota la verificación del merge
- modificar packages/cli/test/integrate.test.ts — accept fusiona main y la verificación completa corre una vez, en un cambio normal y en uno quick
- modificar packages/cli/test/support.ts — `toAcceptance`, el paso previo de `toClosing`
- modificar docs/ARCHITECTURE.md — §6 y §9: accept fusiona main antes de verificar
- modificar docs/formats.md — `change.verified` e `integration.started` también al aceptar

## Tareas

- [ ] T1: accept fusiona main antes de su verificación completa
  - files: packages/cli/src/commands/accept.ts, packages/cli/src/flow/integrate.ts, packages/cli/test/integrate.test.ts, packages/cli/test/support.ts, docs/ARCHITECTURE.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/reuse.test.ts test/unverified.test.ts && pnpm lint
