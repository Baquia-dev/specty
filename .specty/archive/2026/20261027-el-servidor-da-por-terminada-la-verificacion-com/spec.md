---
kind: quick
---

# El servidor da por terminada la verificación completa solo tras anotarla

## Objetivo

El servidor local vigila las verificaciones de las tareas y recuerda la última que vio. Si una verificación completa del mismo cambio empieza y acaba entre dos de sus miradas, esa vigilancia anuncia el fin del cambio (`run: null`) otra vez, a veces antes de que `change.verified` esté en la auditoría; por eso `test/server/verify.test.ts` falla de vez en cuando. Al empezar la verificación completa de un cambio, la vigilancia olvida las tareas de ese cambio, así el fin solo lo anuncia la verificación completa, una vez y con su resultado ya anotado.

## Archivos

- modificar packages/cli/src/server/runs.ts — la vigilancia de las tareas olvida el cambio cuya verificación completa empieza
- crear packages/cli/test/server/runs.test.ts — el fin se oye una vez, con `change.verified` ya en la auditoría

## Tareas

- [x] T1: la verificación completa termina una sola vez y después de anotarse
  - files: packages/cli/src/server/runs.ts, packages/cli/test/server/runs.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/runs.test.ts test/server/verify.test.ts test/server/live.test.ts
  - type: fix

## Cierre

### Resumen

Al empezar la verificación completa de un cambio, la vigilancia de las tareas olvida lo que vio de él (forget), así solo la completa anuncia el fin, una vez y con change.verified ya anotado. Test determinista con el reloj de la vigilancia simulado.
