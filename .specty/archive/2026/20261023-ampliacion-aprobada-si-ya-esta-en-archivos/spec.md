---
kind: standard
---

# Ampliación aprobada si ya está en Archivos

## Objetivo

`specty scope add` aprueba solo, sin esperar a la persona, un archivo que ya está en la sección Archivos de la spec aprobada, salvo que sea una ruta sensible. La persona ya aprobó ese archivo como alcance del cambio, y pasarlo a otra tarea (por ejemplo, un stub que T3 necesita y que estaba previsto para T5) no concede nada nuevo; hoy obliga a parar a esperar una aprobación. La salida y `audit.jsonl` dicen por qué se aprobó y para qué tarea estaba previsto.

## Fuera de alcance

- El aviso en la UI de que una tarea toca un archivo previsto para otra: es trabajo de la sesión de la UI, con el dato ya en `audit.jsonl`.
- Cambiar qué rutas son sensibles o protegidas.
- Los avisos de archivos compartidos entre cambios en paralelo.

## Supuestos

- A1: Con `autoApprove: tests-and-generated`, el valor por defecto, también se aprueban solos los archivos de la sección Archivos; con `none`, ninguno, como hasta ahora. No hay un valor nuevo en la configuración, así que los repositorios ya configurados lo reciben sin tocar `config.yaml`.
  - impacto: alto
- A2: Cuenta como previsto todo lo que coincide con una entrada de Archivos, también con un glob, y los dos lados de un renombrado, aunque ninguna tarea lo liste en `files`.
- A3: Un archivo que es a la vez un test o generado y está en Archivos se registra con el primer motivo que aplica, en este orden: `test`, `generated`, `planned`.

## Criterios de aceptación

- AC1: CUANDO el agente pide con `scope add` un archivo que ya está en Archivos y no es sensible (por ejemplo, `src/greeting.ts`, previsto para T2, desde T1) ENTONCES se aprueba solo y la salida dice que ya estaba en Archivos y para qué tarea.
- AC2: CUANDO el archivo está en Archivos pero es una ruta sensible, o la política es `none` ENTONCES la solicitud espera a la persona, como hasta ahora.
- AC3: CUANDO la política aprueba una ampliación ENTONCES `scope.decided` en `audit.jsonl` registra por qué se aprobó cada ruta (`test`, `generated` o `planned`) y, para las previstas, las tareas que las listaban.
- AC4: CUANDO se pide un archivo que no está en Archivos ni es un test o un generado ENTONCES la solicitud espera a la persona, como hasta ahora.

## Diseño

- **Core** (`scope/scope.ts`): `autoBasis(ruta, reglas, previstos)` devuelve `test`, `generated`, `planned` o nada, y nunca aprueba una ruta sensible; `decideScopeRequest(rutas, reglas, previstos)` aprueba si la política no es `none` y todas las rutas tienen motivo.
- **CLI** (`commands/scope.ts`): los previstos salen de la sección Archivos de la spec aprobada (con los dos lados de cada renombrado); al aprobar, la salida anota cada ruta prevista con las tareas que la listaban, y `scope.decided` guarda `basis` (ruta → motivo) y `plannedFor` (ruta → tareas).

## Archivos

- modificar packages/core/src/scope/scope.ts — el motivo de cada ruta y lo previsto en Archivos
- modificar packages/core/src/index.ts — exportar `autoBasis`
- modificar packages/core/test/scope/scope.test.ts — tests de la política con lo previsto
- modificar packages/cli/src/commands/scope.ts — pasar lo previsto, anotar la salida y registrar el motivo
- modificar packages/cli/test/commands.test.ts — scope add con un archivo previsto para otra tarea

## Tareas

- [x] T1: La política aprueba lo previsto en Archivos
  - files: packages/core/src/scope/scope.ts, packages/core/src/index.ts, packages/core/test/scope/scope.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope
- [x] T2: scope add lo aplica y lo registra
  - files: packages/cli/src/commands/scope.ts, packages/cli/test/commands.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
  - notes: Actualizar también docs/formats.md §4 (datos de `scope.decided`) y §6 (qué aprueba `tests-and-generated`) y docs/ARCHITECTURE.md §8 (Ampliación).

## Riesgos

- R1: Una tarea puede quedarse con el trabajo de otra sin que nadie lo vea hasta la aceptación — la salida de `scope add` lo dice al momento, `audit.jsonl` lo guarda para la UI, y el commit de la tarea muestra qué archivos tocó.

## Cierre

### Resumen

`specty scope add` aprueba solo un archivo que ya está en la sección Archivos de la spec aprobada, con un glob o como lado de un renombrado, salvo que sea una ruta sensible o que la política sea `none`. `autoBasis` da el motivo de cada ruta (`test`, `generated` o `planned`, en ese orden) y `decideScopeRequest` recibe lo previsto. Al aprobar, la salida anota cada ruta prevista con las tareas que la listaban («src/greeting.ts (ya en Archivos, prevista para T2)»), y `scope.decided` guarda `basis` y `plannedFor` en `audit.jsonl`.

### Desviaciones

- Ninguna respecto al plan.

### Decisiones

- **Sin valor nuevo en la configuración (A1, confirmado):** `tests-and-generated` cubre también lo previsto en Archivos, así que los repositorios ya configurados lo reciben sin tocar `config.yaml`; `formats.md` §6 lo aclara.
- **Lo previsto sale de la spec aprobada**, no de los `files` de las tareas: cuenta un archivo de Archivos aunque ninguna tarea lo liste.
- **`plannedFor` solo nombra otras tareas:** un archivo que ya estaba en la tarea activa no llega a pedirse.

### Pendientes

- **El aviso en la UI** de que una tarea toca un archivo previsto para otra, con `plannedFor` como dato: es trabajo de la sesión de la UI.
