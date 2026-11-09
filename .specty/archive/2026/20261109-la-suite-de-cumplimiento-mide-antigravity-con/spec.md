---
kind: standard
---

# La suite de cumplimiento mide Antigravity con lo que escribe su instalación

## Objetivo

La suite de cumplimiento (`evals/`) lanza Antigravity CLI (`agy`) con una regla fija, `command(specty)`, y dentro del sandbox de su modo print Specty no arrancaba (P382). Desde D5, `specty init --tools antigravity` escribe las reglas que lo dejan correr ahí. Con este cambio, la suite prepara cada repositorio para Antigravity como una persona que usa su CLI: crea antes de `init` la carpeta de ajustes del CLI propia de la suite, y le pasa a agy en `--settings` el `permissions.allow` que escribió esa instalación, sin reglas que la instalación real no daría (P388). Después, una ejecución real de «pide código sin spec» con agy mide el resultado, que queda en ARCHITECTURE §16 y en la fila de F3 de §18.

## Fuera de alcance

- La instalación (`packages/cli`): sus reglas son las de D5 y no cambian.
- El envoltorio `specty` de la suite, en la carpeta temporal de la ejecución: corre dentro del sandbox sin otra regla (A2).
- Que `npx -y @baquia-dev/specty` corra dentro del sandbox (P389).
- Repetir los escenarios o medir otros agentes: una ejecución no hace estable la suite, así que el criterio de salida de F3 sigue abierto.
- `docs/formats.md`: no cambia ningún formato de Specty.

## Supuestos

- A1: Con las reglas que escribe `init` (D5), Specty arranca dentro del sandbox de agy y git escribe en `.git`. Lo comprobé el 2026-11-09 con agy 1.5.3 en un repositorio desechable de la carpeta temporal, con las reglas que escribió `init` en `--settings`. El log de agy dice que encendió el sandbox de terminal y tomó esas cuatro reglas. `specty --version` respondió el propio bundle («unknown option '--version'»), sin `EPERM`, y `git tag sonda` escribió en `.git`.
  - impacto: alto
- A2: El envoltorio `specty` de la suite (`#!/bin/sh` que ejecuta `node` con el bundle), en la carpeta temporal de la ejecución, corre dentro del sandbox. En esa misma prueba estaba en el PATH, y así lo ejecutó agy.
- A3: `toolPermission: "proceed-in-sandbox"` y `trustedWorkspaces` no son reglas de permisos, y la suite los sigue dando. En modo print nadie responde, y la persona confía en la carpeta cuando agy se lo pregunta: es el aviso de `init`.
- A4: Cada repositorio tiene su propia carpeta del CLI, fuera de él y de la carpeta de la persona: `specty-evals-antigravity-cli/<nombre del repositorio>` en la carpeta temporal de la ejecución. Así `write_file` es solo la del git de ese repositorio, como la de una persona que instala en un solo proyecto, y la suite no acumula reglas de otros repositorios desechables. Una carpeta de `.worktrees/` da otra carpeta que no existe, nunca una dentro del repositorio.
- A5: El node que ejecuta la suite (`process.execPath`, del que sale la regla de su prefijo) es el mismo que ejecuta el envoltorio del agente. Los dos salen del PATH de la persona.

## Criterios de aceptación

- AC1: CUANDO la suite prepara un repositorio para Antigravity, en un escenario o en un experimento, ENTONCES crea antes de `init` la carpeta del CLI de la suite para ese repositorio, fuera de él. `init` escribe en su `settings.json` las reglas de la instalación: `command(specty)`, `read_file(<prefijo de node>)`, `read_file(<carpeta del bundle>)` salvo si está dentro del prefijo de node, y `write_file(<.git del repositorio>)`. Los ajustes de la persona no cambian. Para otro agente, la suite no crea esa carpeta.
- AC2: CUANDO la suite lanza agy en un repositorio ENTONCES `permissions.allow` de `--settings` son exactamente las reglas de `permissions.allow` de los ajustes que escribió la instalación para ese repositorio, en su orden y sin otras. Sin esos ajustes, `--settings` no lleva `permissions`. `toolPermission` y `trustedWorkspaces` siguen igual.
- AC3: CUANDO se ejecuta `pnpm evals` con `SPECTY_EVALS_AGENTS=antigravity` y `SPECTY_EVALS_SCENARIOS=no-spec` ENTONCES agy corre con el sandbox encendido y las reglas de la instalación (lo dice su log), y el informe da el resultado de esa ejecución: sus rondas, bloqueos, segundos y veredicto.
  - test: manual
- AC4: CUANDO se lee ARCHITECTURE ENTONCES §16 explica que Antigravity recibe en `--settings` las reglas de su instalación y da el resultado de la ejecución real, con lo que mostró el log de agy; la fila de F3 de §18 lo recoge.
  - test: manual

## Diseño

- `evals/src/repo.ts`:
  - `antigravityCliFolder(root)` da la carpeta del CLI de Antigravity de la suite para el repositorio `root` (A4).
  - El entorno de Specty y git apunta ahí `SPECTY_ANTIGRAVITY_CLI_DIR`, según el repositorio donde corre.
  - `installSpecty(root, tool)` ejecuta `specty init --language es --tools <tool>`. Para Antigravity, antes crea esa carpeta, como la tiene quien usa su CLI.
- `evals/src/scenarios.ts` y `evals/src/experiments.ts` instalan Specty con `installSpecty`.
- `evals/src/agents.ts`: `agySettings(folder)` lee, sin bloquear el resto, el `permissions.allow` de `settings.json` en `antigravityCliFolder(folder)` y lo pasa tal cual (solo sus textos). Sin el archivo, o si no se analiza, no da `permissions`.
- La ejecución real: `SPECTY_EVALS_AGENTS=antigravity SPECTY_EVALS_SCENARIOS=no-spec pnpm evals` desde la carpeta de este cambio, que construye su propio bundle (`DIST` es relativo a `evals/`). Su resultado sale del informe y del log de agy (`~/.gemini/antigravity-cli/log/`).

## Archivos

- modificar evals/src/repo.ts — la carpeta del CLI de Antigravity por repositorio, su variable en el entorno e `installSpecty`
- modificar evals/src/scenarios.ts — instalar Specty con `installSpecty`
- modificar evals/src/experiments.ts — instalar Specty con `installSpecty`
- modificar evals/src/agents.ts — `--settings` con el `permissions.allow` de la instalación
- modificar evals/test/antigravity-init.test.ts — la carpeta y las reglas de la instalación (AC1)
- modificar evals/test/antigravity.test.ts — `--settings` con las reglas de la instalación (AC2)
- modificar docs/ARCHITECTURE.md — §16 y la fila de F3 de §18

## Tareas

- [x] T1: La suite instala Specty para Antigravity con su propia carpeta del CLI
  - files: evals/test/antigravity-init.test.ts, evals/src/repo.ts, evals/src/scenarios.ts, evals/src/experiments.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/antigravity-init.test.ts && pnpm lint
  - type: feat
- [x] T2: La suite le pasa a agy las reglas que escribió la instalación
  - files: evals/test/antigravity.test.ts, evals/src/agents.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/antigravity.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T3: La ejecución real con Antigravity y su resultado en ARCHITECTURE §16 y §18
  - files: docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El modelo de agy puede no seguir el flujo por razones ajenas al sandbox, y la ejecución acabaría «sin avance» o «violado». Mitigación: el resultado se anota tal cual, con lo que mostró su log, y lo que falte para Specty queda como pendiente.
- R2: La ejecución real gasta la cuota de agy de la persona. Mitigación: un solo escenario corto, una vez.

## Cierre

### Resumen

La suite de cumplimiento instala Specty para Antigravity como lo tiene quien usa su CLI. Antes de `init`, `installSpecty` crea la carpeta de ajustes del CLI propia de la suite para ese repositorio (`antigravityCliFolder`, fuera del repositorio y de la carpeta de la persona), y el entorno de Specty le apunta `SPECTY_ANTIGRAVITY_CLI_DIR`. Escenarios y experimentos instalan así. Al lanzar agy, `--settings` lleva exactamente el `permissions.allow` que escribió esa instalación, sin la regla fija de antes: sin esos ajustes, no lleva `permissions`.

Una ejecución real de «pide código sin spec» con agy 1.5.3 cumplió: 7 rondas, 0 bloqueos y 601 s. El log de agy confirma que encendió el sandbox de terminal, cargó el hook de Specty y tomó las cuatro reglas de la instalación. Specty corrió dentro: el modelo creó el cambio, escribió y propuso su spec y esperó a la persona con `specty wait`, sin `BypassSandbox`. ARCHITECTURE §16 y la fila de F3 de §18 lo recogen. Los tests de `evals` pasan con `pnpm test:evals` (15 archivos, 54 tests).

### Desviaciones

- La tarea de código se partió en dos (T1, la carpeta y la instalación; T2, los ajustes de agy), por el aviso de `propose` sobre su número de archivos. La ejecución real y la documentación pasaron a T3.

### Decisiones

- Una carpeta del CLI por repositorio (`specty-evals-antigravity-cli/<repositorio>` en la carpeta temporal de la ejecución): así el `write_file` de cada sesión abre solo el git de su repositorio, y la suite no acumula reglas de otros repositorios desechables.
- `toolPermission` y `trustedWorkspaces` siguen en `--settings`: no son reglas de permisos, y en modo print nadie responde ni confía en la carpeta.
- El envoltorio `specty` de la suite sigue en la carpeta temporal de la ejecución: una prueba a mano antes de la ejecución vio que corre dentro del sandbox sin otra regla, y que git escribe en `.git` con las de la instalación.
- La ejecución real usó el bundle construido en la carpeta de este cambio (`pnpm evals` desde ella), sin reconstruir el de la carpeta principal.

### Pendientes

- En los escenarios de la suite sin una persona que decida, como «pide código sin spec», el agente acaba en `specty wait` tras proponer y la ejecución dura hasta el límite de 10 minutos: con agy, 601 s, de los que unos 80 fueron trabajo. Los segundos del informe miden el límite y no al agente; la suite podría dar por terminada la ejecución cuando el agente espera a la persona, o anotar ese momento.
