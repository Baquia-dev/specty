---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C5
---

# Los demás comandos de la CLI: scope, la decisión de alcance, integrate, export, init, doctor, los registros de comandos y el programa

## Objetivo

Nueve funciones de los demás comandos de la CLI pasan de los límites de Specty: `scopeAdd` (101 líneas, complejidad 15), `decideScope` (54), `integrate` (81, 16), `exportChange` (13), `init` (95, 19), `doctor` (64, 12), `agentCommands` (103), `personCommands` (54) y `runCli` (90). Cada una se divide en los pasos o los grupos que ya sigue, en el mismo orden, sin cambiar lo que pregunta, escribe, registra o responde.

## Fuera de alcance

- Cambiar un comando, una opción, su ayuda, una pregunta, un archivo que se escribe, un evento, un commit o una tarjeta.
- El flujo, el guard, la instalación y el servidor, que son de los cortes C6 a C8.

## Supuestos

- A1: Los tests de la CLI recorren estos comandos y su ayuda, así que un cambio en el orden de registro, de las preguntas o de lo que se escribe los haría fallar.
  - impacto: alto
- A2: Los registros de comandos se dividen por grupos y conservan el orden en que commander los muestra; `init` mantiene el orden de sus efectos: configuración, AGENTS.md, PRODUCT.md, hooks y commit.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se miden los comandos de la CLI y `program.ts` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/cli/src/commands/agent-commands.ts — `new`, y `task done` con `scope add`, registrados aparte
- modificar packages/cli/src/commands/person-commands.ts — la decisión de la persona, fuera del registro
- modificar packages/cli/src/program.ts — la salida, la sesión y los comandos de lectura y preparación
- modificar packages/cli/src/commands/doctor.ts — las herramientas del agente y los avisos
- modificar packages/cli/src/commands/export.ts — los datos del cambio y la carpeta que se muestra
- modificar packages/cli/src/commands/init.ts — la preparación, la instalación y el commit
- modificar packages/cli/src/commands/integrate.ts — lo que impide el commit de la fusión, y el commit
- modificar packages/cli/src/commands/scope.ts — la tarea, la aprobación automática y la solicitud
- modificar packages/cli/src/commands/scope-decision.ts — el registro de la decisión

## Tareas

- [x] T1: Los registros de comandos y el programa
  - files: packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/person-commands.ts, packages/cli/src/program.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T2: doctor y export
  - files: packages/cli/src/commands/doctor.ts, packages/cli/src/commands/export.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T3: init
  - files: packages/cli/src/commands/init.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T4: integrate
  - files: packages/cli/src/commands/integrate.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T5: El alcance y su decisión
  - files: packages/cli/src/commands/scope.ts, packages/cli/src/commands/scope-decision.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor

## Cierre

### Resumen

Los comandos de la CLI que quedaban fuera de los límites de funciones se dividieron por responsabilidad: los registros de comandos y `runCli`, `doctor`, `export`, `init`, `integrate`, `scope add` y la decisión de alcance. Mantienen el mismo orden de registro, de preguntas y de efectos, y las mismas tarjetas. Ninguna función de `commands/` ni de `program.ts` supera ya los límites; los 448 tests de la CLI y la verificación completa pasan.

### Desviaciones

- En `scope.ts`, la solicitud copia las rutas (`paths: [...wanted.paths]`) porque el estado guarda una lista mutable y `Wanted` las tiene de solo lectura.

### Decisiones

- El aviso CWE-78 en `integrate.ts` señala la misma ejecución por la shell de la verificación configurada que ya existía en `main`, solo movida a `failedVerification`. El usuario lo dio por bueno y acordó aceptar en adelante los avisos de llamadas existentes que solo se mueven, y parar solo ante ejecuciones nuevas.

### Pendientes

- Los cortes C6 a C9 de la épica: flujo y enforce de la CLI, install, io y check, el servidor, y la UI con los exportadores.
