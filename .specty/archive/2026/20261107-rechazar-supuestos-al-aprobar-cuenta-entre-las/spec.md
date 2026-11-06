---
kind: quick
---

# Rechazar supuestos al aprobar cuenta entre las decisiones que nadie retoma

## Objetivo

Rechazar supuestos al aprobar, en la terminal o en la UI, devuelve la revisión al agente desde P225 (`changesRequestedAt`), pero la UI no marca «Nadie retoma tu decisión» cuando ningún agente la retoma, porque `server/unattended.ts` solo cuenta los eventos de `DECISIONS` y esa decisión se anota como `assumption.decided` (P232). Con este cambio cuenta la línea de `assumption.decided` de la persona que lleva `rejected`, la que `approve` escribe junto a `changesRequestedAt`, justo cuando `changeWaitsFor` pasa el turno al agente; un supuesto decidido suelto desde la UI, que nombra su `item` y no cambia a quién espera el cambio, sigue sin contar. Se toma la línea de la auditoría y no la hora de `changesRequestedAt`, porque el estado no dice quién devolvió la revisión (en modo delegado la devuelve el agente) ni ordena la decisión frente a las líneas del agente que la retoman.

## Archivos

- modificar packages/cli/src/server/unattended.ts — cuenta como decisión la línea `assumption.decided` de la persona con `rejected`
- modificar packages/cli/test/server-unattended.test.ts — rechazar un supuesto al aprobar en la terminal deja `unattended`; decidir uno suelto desde la UI no entrega el turno
- modificar docs/ARCHITECTURE.md — §15 nombra esa decisión entre las que nadie retoma
- modificar docs/formats.md — §4: el `assumption.decided` de aprobar lleva `rejected`

## Tareas

- [x] T1: Rechazar supuestos al aprobar cuenta entre las decisiones que nadie retoma
  - files: packages/cli/src/server/unattended.ts, packages/cli/test/server-unattended.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-unattended.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Cierre

### Resumen

unattended.ts cuenta como decisión de la persona el assumption.decided con rejected que approve escribe junto a changesRequestedAt; un supuesto decidido suelto desde la UI sigue sin contar; ARCHITECTURE §15 y formats §4 lo cuentan
