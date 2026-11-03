---
kind: quick
---

# Reloj de los tests alineado con la hora real

## Objetivo

El reloj de los comandos en los tests de la CLI pasa de «hoy a las 10:00 UTC» a la hora real al cargar los tests, redondeada al minuto. Hoy los archivos que escriben los tests llevan la fecha real y, cuando la hora real queda a más de una hora de las 10:00 UTC, `status` toma `state.json` por antiguo y marca el cambio como huérfano, y los tests que comparan esa hora fija con las fechas de los archivos fallan según la hora del día.

## Archivos

- modificar packages/cli/test/support.ts — `NOW` toma la hora real redondeada al minuto, con el comentario que explica por qué

## Tareas

- [ ] T1: Alinear el reloj de los tests con la hora real
  - files: packages/cli/test/support.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/anywhere.test.ts test/activity.test.ts test/enforce.test.ts test/prune.test.ts test/server.test.ts
