---
kind: quick
---

# En aceptación, el cierre enviado tiene su commit antes de incorporar main

## Objetivo

En aceptación delegada, el agente envía el cierre antes de `accept`, y ese cierre (la spec y el glosario) queda sin commit. `accept` incorpora main antes de verificar (`mergeTarget` en `mergeFirst`), pero no hace antes el commit del cierre, como sí hace `close` con `commitClosing`. Si main cambió el glosario, la incorporación se niega por archivos sin commit, y el agente no puede hacer ese commit (P246). Con este cambio, `accept` de un cambio con el cierre enviado (`closingSubmittedAt`) le pasa a `mergeTarget` el mismo `beforeMerge` que `close`, que reutiliza `commitClosing`. El cierre entra en su commit (`docs(spec): cierre de <título>`) solo si main cambió alguno de sus archivos sin commit, y main se incorpora con los dos cambios. Vale tanto para el `accept` del agente, que además cierra, como para el de la persona, que deja el cambio en `closing`. Sin el cierre enviado, `accept` incorpora main como hoy. «Verificar» de la UI (`server/merged-run.ts`) queda fuera de este cambio.

## Archivos

- modificar packages/cli/src/flow/closing-turn.ts — `closingFirst`: con el cierre enviado, el `beforeMerge` que hace su commit con `commitClosing`
- modificar packages/cli/src/commands/accept.ts — `mergeFirst` pasa `closingFirst` a `mergeTarget`
- modificar packages/cli/test/close-shared-file.test.ts — `accept` con el cierre enviado y el glosario cambiado en main: el del agente cierra y aterriza con los dos cambios, y el de la persona deja el cambio en `closing`
- modificar docs/ARCHITECTURE.md — §9: la incorporación de `accept` hace antes el commit del cierre enviado

## Tareas

- [x] T1: En aceptación, el cierre enviado tiene su commit antes de incorporar main
  - files: packages/cli/src/flow/closing-turn.ts, packages/cli/src/commands/accept.ts, packages/cli/test/close-shared-file.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-shared-file.test.ts test/accept-quick-turn.test.ts test/closing-ahead.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Cierre

### Resumen

accept pasa a mergeTarget closingFirst, que con el cierre enviado reutiliza commitClosing antes de incorporar main; tests del accept del agente y de la persona con el glosario cambiado en main; ARCHITECTURE §9
