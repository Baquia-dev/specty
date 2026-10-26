---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C6
---

# El flujo y el guard de la CLI: la vista del cambio, la incorporación, la tarea hecha, el pre-commit, las épicas y la limpieza

## Objetivo

Nueve funciones del flujo y del guard de la CLI pasan de los límites de Specty: `changeView` (85 líneas, complejidad 13) y su función de tareas (complejidad 13), `absorbTarget` (67, 13), `completeTask` (51), `preCommit` (12), `awaits` (11), `sliceRefusal` (12), `childrenOf` (11) y `removeFinished` (11). Cada una se divide en los pasos que ya sigue, en el mismo orden, sin cambiar lo que lee, ejecuta, escribe, registra o responde.

## Fuera de alcance

- Cambiar una vista, una tarjeta, un evento, un commit, una fusión o lo que el hook deja pasar.
- La instalación, git, las verificaciones y el servidor, que son de los cortes C7 y C8.

## Supuestos

- A1: Los tests de la CLI recorren la vista del cambio, la incorporación, `task done`, el hook pre-commit, los cortes de una épica y `prune`, así que un cambio en lo que hacen los haría fallar.
  - impacto: alto
- A2: La vista del cambio conserva el orden de sus campos y de sus lecturas, porque la salida `--json` y la UI la muestran tal cual.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se miden `packages/cli/src/flow/` y `packages/cli/src/enforce/` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/cli/src/flow/views.ts — la vista de cada tarea, lo que pide la fase, las suposiciones rechazadas y la incorporación en curso
- modificar packages/cli/src/flow/integrate.ts — la carpeta con cambios, la fusión que falla, su verificación y su commit
- modificar packages/cli/src/flow/task-done.ts — el commit de la tarea
- modificar packages/cli/src/enforce/hook.ts — la edición manual dentro del cambio abierto
- modificar packages/cli/src/flow/epic.ts — el corte pedido entre los de la épica, y los cambios abiertos y archivados de cada corte
- modificar packages/cli/src/flow/changes.ts — el cierre que espera a la persona
- modificar packages/cli/src/flow/prune.ts — por qué se queda la carpeta de un cambio terminado

## Tareas

- [x] T1: La vista del cambio
  - files: packages/cli/src/flow/views.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T2: La incorporación de la rama destino
  - files: packages/cli/src/flow/integrate.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T3: La tarea hecha y el hook pre-commit
  - files: packages/cli/src/flow/task-done.ts, packages/cli/src/enforce/hook.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T4: Los cortes de una épica
  - files: packages/cli/src/flow/epic.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T5: Lo que espera a la persona y la limpieza
  - files: packages/cli/src/flow/changes.ts, packages/cli/src/flow/prune.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor

## Cierre

### Resumen

Las nueve funciones del flujo y del guard de la CLI que pasaban de los límites se dividieron en los pasos que ya seguían: la vista del cambio (cada tarea, lo que trae la fase, las suposiciones rechazadas y la incorporación), la incorporación de la rama destino (la carpeta con cambios, la fusión detenida, su verificación y su commit), el commit de la tarea, la edición manual del hook pre-commit, el corte pedido y los cambios de cada corte de una épica, el cierre que espera a la persona y por qué se queda una carpeta en `prune`. Ninguna función de `flow/` ni de `enforce/` pasa ya de los límites; los tests de la CLI y la verificación completa pasan.

### Desviaciones

- Ninguna.

### Decisiones

- La vista del cambio conserva el orden de sus campos y de sus lecturas: `phaseFacts` agrupa los campos de la fase, que ya iban seguidos.
- El aviso CWE-78 en `flow/integrate.ts` es la misma ejecución de la verificación configurada que había en `main`, solo movida a `failedVerification`; se aceptó por la regla acordada con el usuario.

### Pendientes

- Los cortes C7 a C9 de la épica: install, io y check de la CLI, el servidor, y la UI con los exportadores.
