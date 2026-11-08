---
kind: quick
---

# La pestaña Historial muestra el cambio de tipo de una propuesta

## Objetivo

Desde que `spec.proposed` trae `kind` y `previousKind` cuando el borrador cambia de tipo con esa propuesta, `specty audit` lo dice («(de standard a epic)»), pero la línea de la propuesta en la pestaña Historial de la UI no (P377). Con este cambio, esa línea lleva antes del tamaño el detalle «Pasó de carril estándar a épica» («Went from standard lane to epic»), con los nombres de carril que ya usa «Creó el cambio» y el tipo tal cual si no tiene nombre; una propuesta sin esos campos, como las de versiones anteriores, se ve igual que hoy.

## Archivos

- modificar packages/ui/src/data/history.ts — la línea de `spec.proposed` añade el detalle del cambio de tipo cuando el evento trae `kind` y `previousKind`
- modificar packages/ui/src/data/history.test.ts — una propuesta que pasa de standard a epic lo dice, en español y en inglés; un tipo sin nombre sale tal cual, y sin `previousKind` no hay detalle
- modificar packages/ui/src/data/sample-history.ts — el cambio de muestra «20261019-boletines-pdf» se crea como quick y su primera propuesta lo pasa a standard, para verlo en el prototipo
- modificar docs/ui.md — Historial y trazabilidad: la propuesta con la que el borrador cambió de tipo lo dice

## Tareas

- [ ] T1: La línea de una propuesta en el Historial dice el cambio de tipo del borrador
  - files: packages/ui/src/data/history.ts, packages/ui/src/data/history.test.ts, packages/ui/src/data/sample-history.ts, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/history.test.ts --include src/data/sample-specs.test.ts && pnpm typecheck && pnpm lint
  - type: feat
