---
kind: quick
---

# «Verificar» de la UI hace el commit del cierre enviado antes de incorporar main

## Objetivo

En aceptación delegada, con el cierre ya enviado y sin commit, «Verificar» de la UI incorpora main con `mergeTarget` (`server/merged-run.ts`) sin hacer antes el commit del cierre: si main cambió uno de sus archivos, como el glosario, el merge se niega por archivos sin commit y la ejecución se para sin mover nada, como hacía `accept` antes de P246 (P251). Con este cambio, la incorporación de «Verificar» le pasa a `mergeTarget` el mismo `beforeMerge` que `accept` (`closingFirst` de `flow/closing-turn.ts`): el cierre enviado entra en su propio commit si main cambió sus archivos, main se incorpora y la verificación completa corre sobre el código incorporado. Sin el cierre enviado, nada cambia.

## Archivos

- modificar packages/cli/src/server/merged-run.ts — pasa `closingFirst` del cambio a `mergeTarget`
- modificar packages/cli/test/server/verify-merge.test.ts — con el cierre enviado y el glosario cambiado en main, «Verificar» hace el commit del cierre, incorpora main y verifica, sin pararse
- modificar docs/ARCHITECTURE.md — §15, «Verificación completa desde la UI»: la incorporación hace antes el commit del cierre enviado, como `accept`

## Tareas

- [x] T1: «Verificar» de la UI hace el commit del cierre enviado antes de incorporar main
  - files: packages/cli/src/server/merged-run.ts, packages/cli/test/server/verify-merge.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/verify-merge.test.ts && pnpm typecheck && pnpm lint
  - type: fix
