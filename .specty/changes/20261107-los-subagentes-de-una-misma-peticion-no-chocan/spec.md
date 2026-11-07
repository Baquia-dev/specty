---
kind: quick
---

# Los subagentes de una misma petición no chocan con el aviso de duplicado por ella

## Objetivo

La tarjeta sin cambio activo pide un subagente por cada cambio que pide el usuario, y a todos les pasa su misma petición literal, así que el `new --subagent` del segundo y del tercero se rechaza como posible duplicado del primero por «petición parecida» (P265): en la eval `changes-subagent` del 2026-11-07, los subagentes de `b` y `c` lo resolvieron ellos con `--distinct-from`, en lugar de volver con la pregunta. Con este cambio, `new --subagent` no compara la petición de un cambio abierto que tiene exactamente la misma (igual sin los espacios de los extremos), como ya no la compara entre un corte y su épica; su título y lo que sigue sí se comparan, y el aviso no cambia sin `--subagent` ni con una petición distinta aunque se parezca. No pierde duplicados reales: la misma petición literal es el mismo mensaje del usuario, que la sesión reparte en un subagente por cambio, cada uno con su título; dos subagentes con el mismo trabajo llevarían títulos parecidos, que se siguen comparando, y otra sesión que repite un trabajo con sus palabras trae otra petición, que también. Nadie tiene que hacer nada: ni la sesión ni el usuario marcan los encargos.

## Archivos

- modificar packages/cli/src/flow/duplicates.ts — con `subagent`, la petición idéntica de un cambio abierto no se compara; su título y `follows` sí
- modificar packages/cli/src/commands/new.ts — pasa `--subagent` a `duplicatesOf`
- crear packages/cli/test/duplicates-subagent.test.ts — subagentes con la misma petición y títulos distintos crean sus cambios; título parecido, petición parecida pero distinta y `new` sin `--subagent` siguen avisando
- modificar docs/ARCHITECTURE.md — la fila de `specty new` (§6) cuenta la excepción, y la eval de un subagente por cambio (§16) dice que el aviso ya no llega

## Tareas

- [x] T1: Los subagentes de una misma petición no chocan con el aviso de duplicado por ella
  - files: packages/cli/src/flow/duplicates.ts, packages/cli/src/commands/new.ts, packages/cli/test/duplicates-subagent.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/duplicates-subagent.test.ts test/duplicates.test.ts test/duplicates-slice.test.ts && pnpm typecheck && pnpm lint
  - type: fix
