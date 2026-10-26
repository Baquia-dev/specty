---
kind: standard
follows:
  - 20261026-un-ejemplo-de-specty-check-por-cada-stack
---

# Un ajuste de un quick puede añadir tareas

## Objetivo

Hoy un cambio quick cuya verificación completa falla al aceptarlo queda atascado: el ajuste no puede añadir una tarea de corrección, porque quick admite una, y pasarlo a standard exige `ac` en la tarea ya hecha, que no se puede modificar. El límite de una tarea pasa a aplicarse solo al primer plan, así que un quick se corrige como un standard: ajuste, tarea de corrección y aceptación.

## Fuera de alcance

- Cambiar los límites de archivos y de rutas sensibles del carril quick.
- Pasar un quick a standard durante un ajuste.

## Supuestos

- A1: El límite de una tarea es para el plan que se aprueba primero. Un quick ya aprobado solo gana tareas con un ajuste, que sale de una aceptación; los límites de archivos y de rutas sensibles siguen en todas las revisiones.
  - impacto: alto
- A2: Que el cambio ya se aprobó se lee de la revisión aprobada que la validación ya recibe (`approved`), sin campos nuevos en el estado.

## Criterios de aceptación

- AC1: CUANDO un quick aprobado se ajusta y su spec añade una tarea ENTONCES `propose` y `approve` la aceptan.
- AC2: CUANDO un quick sin aprobar tiene más de una tarea, o un quick ajustado supera el límite de archivos ENTONCES `propose` lo rechaza con `quick-limits`, como hasta ahora.
- AC3: CUANDO la verificación completa falla al aceptar un quick ENTONCES el agente lo ajusta con una tarea de corrección, la completa, y al aceptarlo el cambio queda archivado e incorporado a main.
- AC4: CUANDO alguien lee las reglas del carril quick en formats.md y ARCHITECTURE.md ENTONCES sabe que un ajuste puede añadirle tareas.

## Archivos

- modificar packages/core/src/validate/structure.ts — el límite de tareas, solo antes de la primera aprobación
- modificar packages/core/test/validate/structure.test.ts — sus casos
- modificar packages/cli/test/flow.test.ts — el quick que se ajusta tras fallar la verificación completa
- modificar docs/formats.md — la regla
- modificar docs/ARCHITECTURE.md — el carril quick

## Tareas

- [x] T1: El límite de tareas del quick, solo en el primer plan
  - files: packages/core/src/validate/structure.ts, packages/core/test/validate/structure.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/structure.test.ts
  - type: fix
- [x] T2: Un quick se corrige tras fallar al aceptarlo
  - files: packages/cli/test/flow.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/flow.test.ts
  - type: test
- [x] T3: La regla en la documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
