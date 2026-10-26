---
kind: standard
follows:
  - 20261026-los-agentes-no-leen-ruido
---

# task done ejecuta specty check y el archivo de reglas se reduce

## Objetivo

`specty task done` ejecuta `specty check --changed --spec` como compuerta y no completa una tarea con fallos, así que la regla principal ya no depende de que el agente la cumpla. El bloque de Specty en AGENTS.md queda en el flujo de Specty más las 5 reglas que no puede verificar una herramienta, en el idioma configurado.

## Fuera de alcance

- Que `accept` o `close` ejecuten `specty check`: la compuerta de este corte es `task done`, y el pre-commit, la CI y el fin de turno ya lo ejecutan.
- Tocar el texto de la persona en AGENTS.md (fuera de los marcadores de Specty), aunque repita reglas que ahora verifica `specty check`.
- La documentación de cada verificación en español e inglés (C9).

## Supuestos

- A1: `task done` ejecuta `check` tras sus propias comprobaciones (alcance de la tarea y tamaño de los archivos) y antes de la verificación de la tarea, para que lo barato falle primero. Deja fuera `scope` y `max-lines`, que `task done` ya comprueba por tarea y más estricto. Cuando la tarea tiene verificación, deja fuera también `format`, `lint`, `typecheck` y `tests`: esa verificación es como la persona ejecuta los comandos del proyecto en cada tarea, y así los tests nunca corren dos veces. Sin verificación, `check` sí los ejecuta.
  - impacto: alto
- A2: Las 5 reglas van dentro del bloque `flow` que ya existe, bajo su propio título, así que `init` las escribe y las refresca, y `uninstall` las quita sin bloques nuevos. La primera dice `specty check --changed --spec` sin `<id>`, porque `--spec` solo toma el cambio activo de la carpeta.
  - impacto: alto
- A3: El bloque del proyecto (stack, paquetes y comandos) se queda: son datos, no reglas, y el agente necesita el comando de tests para escribirlos primero. Los punteros que Specty escribe (CLAUDE.md y los demás) no traen reglas propias. La pista de «Convenciones» pasa a decir que no se escriba ahí lo que verifica `specty check`.
- A4: Si `check` falla, la tarjeta es la de verificación fallida, con el comando `specty check --changed --spec` y su informe como salida. Si solo hay avisos, la tarea se completa y el informe sale por la salida de error antes de la tarjeta, como la nota de la verificación.

## Criterios de aceptación

- AC1: CUANDO la tarea deja un fallo de `specty check` (por ejemplo, un test enfocado en una línea que añade) ENTONCES `task done` no la completa, y su tarjeta muestra `specty check --changed --spec` con el informe y pide corregir y repetir `task done`.
- AC2: CUANDO la tarea tiene verificación ENTONCES el `check` de `task done` no ejecuta `format`, `lint`, `typecheck` ni `tests`; CUANDO no la tiene ENTONCES sí los ejecuta.
- AC3: CUANDO `check` solo da avisos ENTONCES `task done` completa la tarea y el informe aparece en la salida de error.
- AC4: CUANDO `specty init` escribe AGENTS.md ENTONCES el bloque de Specty tiene el flujo y las 5 reglas, en español o en inglés según el idioma configurado.
- AC5: CUANDO un AGENTS.md nuevo trae la sección «Convenciones» ENTONCES su pista dice que no se escriba ahí lo que verifica `specty check`.

## Diseño

- `cli/src/commands/check.ts`: `check` acepta los ids que se dejan fuera y los quita de los proveedores antes de ejecutarlos, y una función nueva da la ejecución de `task done` (modo `changed`, el plan del cambio activo y lo que deja fuera según A1).
- `cli/src/commands/task.ts`: la llama tras el tamaño de los archivos y antes de `verifyTask`, con `verifyingNote` y `verifyFailedCard` de core.
- `core/src/agents-md.ts`: las 5 reglas en `flowBlock` y la pista nueva en `humanSections`.

## Archivos

- modificar packages/cli/src/commands/check.ts — dejar fuera verificaciones y la ejecución de `task done`
- modificar packages/cli/src/commands/task.ts — ejecutar `specty check` antes de la verificación de la tarea
- crear packages/cli/test/task-check.test.ts — `task done` con fallos, con avisos y con y sin verificación
- modificar packages/core/src/agents-md.ts — las 5 reglas en el bloque y la pista de «Convenciones»
- modificar packages/core/test/cards.test.ts — el tamaño del bloque y sus reglas en los dos idiomas
- modificar AGENTS.md — el bloque de Specty de este repositorio, como lo escribe `init`
- modificar docs/formats.md — `task done` ejecuta `specty check` y el bloque de AGENTS.md con sus reglas
- modificar docs/ARCHITECTURE.md — `task done` en la tabla de comandos

## Tareas

- [x] T1: `task done` ejecuta `specty check`
  - files: packages/cli/src/commands/check.ts, packages/cli/src/commands/task.ts, packages/cli/test/task-check.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
- [ ] T2: Las 5 reglas en el bloque de AGENTS.md
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts, AGENTS.md
  - ac: AC4, AC5
  - verify: pnpm test
- [ ] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC4
  - verify: pnpm check

## Riesgos

- R1: Un fallo previo de la rama que `check --changed` ve en archivos de tareas anteriores bloquea la tarea actual — esas tareas ya pasaron la misma compuerta, y `checks.levels` permite bajar a `warn` u `off` cada verificación.
- R2: Las pruebas de la CLI que completan tareas pasan ahora también por `check` y tardan más o fallan por sus fixtures — T1 ejecuta toda la batería de la CLI.
