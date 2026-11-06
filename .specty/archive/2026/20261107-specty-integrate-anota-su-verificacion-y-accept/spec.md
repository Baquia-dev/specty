---
kind: standard
epic: 20261107-verificacion-sin-repetir
slice: C1
---

# `specty integrate` anota su verificación y `accept` no la repite

## Objetivo

Cuando el agente termina con `specty integrate` la incorporación de main que dejó `accept` o `close`, la verificación completa que la aprueba queda anotada en la auditoría como `change.verified`, con el código sobre el que corrió. Así el `accept` siguiente sobre ese mismo código no la ejecuta otra vez, también en un repo sin `verify.units`, donde hoy se repite entera.

## Fuera de alcance

- Anotar la verificación de `integrate` que falla: el merge sigue en curso para el agente y nada la reutiliza.
- Cambiar cómo se calculan `codeTree` o las huellas de `verify.units`.
- Los demás flujos de la épica (cortes C2, C3 y C4).

## Supuestos

- A1: `integrate` anota la verificación como la incorporación de `mergeTarget` (`verifyMerged` en `flow/integrate.ts`): con `recordFullVerification`, el comando de `verify.full` (o `verify.default`), el inicio y la duración desde su turno, la salida, lo que hizo cada unidad y el `tree` de `codeTree` tomado tras verificar, que es el árbol de trabajo con el merge resuelto que entra en su commit. La cobertura la mide `recordFullVerification`, desde el commit que entra, porque el merge sigue en curso.
  - impacto: medio
- A2: Con `verify.units` y todas ya pasadas, `integrate` no corre la verificación ni la anota, como hoy: `accept` ya las reutiliza por sus huellas.
- A3: Este corte no añade ni cambia textos visibles: el `accept` siguiente dice que ya pasó con la nota que ya tiene en español y en inglés (`verificationReusedNote`), así que el AC13 de la épica no tiene nada que comprobar aquí.
- A4: `docs/formats.md` §4 (`change.verified`) y ARCHITECTURE §6 y §9 nombran a `specty integrate` entre quienes la anotan.

## Criterios de aceptación

- AC1: CUANDO `specty integrate` termina una incorporación con la verificación completa en verde ENTONCES la auditoría tiene un `change.verified` con el `tree` de ese código, y el `accept` siguiente sobre el mismo código no la vuelve a ejecutar y dice que ya pasó, también sin `verify.units`.
- AC2: CUANDO, tras `integrate`, el código cambia antes de `accept` (main avanzó y se incorpora otra vez) ENTONCES `accept` verifica el código nuevo como hoy.

## Diseño

- `commands/integrate.ts`: `failedVerification`, cuando la verificación corre y pasa, la anota con `recordFullVerification` y `codeTree` antes de decir que no hay problema; el inicio cuenta desde su turno, como en `verifyMerged`.
- Tests: `packages/cli/test/integrate.test.ts`, sin unidades, cuenta las verificaciones en `$(git rev-parse --git-common-dir)/runs` (AC1 y AC2); `packages/cli/test/integrate-units.test.ts`, con unidades, lee el `change.verified` que deja (AC1).

## Archivos

- modificar packages/cli/src/commands/integrate.ts — anota la verificación en verde como `change.verified` con su `tree`
- modificar packages/cli/test/integrate.test.ts — AC1 y AC2 sin `verify.units`
- modificar packages/cli/test/integrate-units.test.ts — AC1 con `verify.units`
- modificar docs/formats.md — `change.verified` también lo anota `specty integrate`
- modificar docs/ARCHITECTURE.md — §6 y §9: `integrate` anota su verificación y `accept` no la repite

## Tareas

- [x] T1: `specty integrate` anota su verificación en verde y `accept` no la repite
  - files: packages/cli/src/commands/integrate.ts, packages/cli/test/integrate.test.ts, packages/cli/test/integrate-units.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/integrate-units.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [x] T2: formats.md y ARCHITECTURE cuentan que `integrate` anota su verificación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q 'terminar esa incorporación con `specty integrate`' docs/formats.md && grep -q 'deja su verificación anotada como `change.verified`' docs/ARCHITECTURE.md
  - type: docs

## Cierre

### Resumen

`specty integrate`, cuando la verificación completa del merge resuelto corre y pasa, la anota como `change.verified` con `recordFullVerification`: el comando de `verify.full` (o `verify.default`), el inicio y la duración desde su turno, la salida, lo que hizo cada unidad y el `tree` de `codeTree` tomado tras verificar (`recordPassed` en `commands/integrate.ts`). Así `passedOnThisCode` la reconoce y el `accept` siguiente sobre ese código no la repite, también sin `verify.units`; si main avanza otra vez, la incorporación de `accept` verifica el código nuevo. `docs/formats.md` §4 y ARCHITECTURE §6 y §9 lo cuentan.

### Desviaciones

- Ninguna.

### Decisiones

- El `tree` se toma después de verificar, como en `verifyMerged`, porque es el árbol de trabajo que entra en el commit del merge y el que `accept` calculará después.
- Se anota el comando completo configurado, no el de la última unidad que corrió, porque es el que compara `passedOnThisCode`.
- No se anota la verificación que falla: el merge sigue en curso para el agente y nada la reutiliza.

### Pendientes

- Ninguno.
