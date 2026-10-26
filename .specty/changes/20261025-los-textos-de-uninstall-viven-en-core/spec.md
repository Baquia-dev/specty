---
kind: standard
follows:
  - 20261025-los-textos-de-doctor-viven-en-core
---

# Los textos de uninstall viven en core

## Objetivo

Noveno cambio de la serie que lleva a core los textos de la CLI, con el último comando de la instalación. `uninstall` arma en la CLI lo que dice de cada archivo, su simulación, la nota y la pregunta antes de quitar nada, el aviso de un cambio en curso, lo que quitó y lo que deja a propósito. Pasan a `core/src/cards/uninstall.ts`, con tests, y la copia de seguridad reutiliza `backupLine`, la de `init`. La salida no cambia ni una letra.

## Fuera de alcance

- Qué quita `uninstall`: solo cambia dónde viven sus textos.
- Los textos de `integrate`, `review` y los demás comandos, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: La copia de lo que había antes se describe igual en `init` y en `uninstall` («Copia de lo que había antes: …»), así que `uninstall` usa `backupLine` de `cards/init.ts`.

## Criterios de aceptación

- AC1: CUANDO `specty uninstall` no tiene nada que quitar, simula, pregunta, no quita nada o quita lo de Specty ENTONCES la terminal y la tarjeta muestran lo mismo que antes, y los textos salen de `cards/uninstall.ts` de core.
- AC2: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto de `uninstall`, en español y en inglés.

## Archivos

- crear packages/core/src/cards/uninstall.ts — los textos de uninstall
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/uninstall.test.ts — sus tests
- modificar packages/cli/src/commands/uninstall.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los textos de uninstall
  - files: packages/core/src/cards/uninstall.ts, packages/core/src/cards/index.ts, packages/core/test/cards/uninstall.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: uninstall pide sus textos a core
  - files: packages/cli/src/commands/uninstall.ts
  - ac: AC1
  - verify: pnpm check
  - type: refactor
