---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C9
---

# Resultados de la suite y estado de la fase 3

## Objetivo

La suite de cumplimiento ya corrió con un agente real. ARCHITECTURE debe decir lo que mostró y en qué estado queda la fase 3. Su criterio de salida es una suite estable con cada agente, y la épica lo fijó en al menos cuatro. Este corte anota los resultados de Claude Code y deja la fila de la fase 3 con lo hecho y lo que falta.

## Fuera de alcance

- Ejecutar la suite con Codex, Gemini CLI, OpenCode o Cursor CLI, que no están instalados ni tienen sesión en esta máquina.
- Cambiar la suite o sus escenarios.

## Supuestos

- A1: Los resultados son los de las dos ejecuciones del 2026-10-28 con Claude Code 2.1.312 (la extensión de VS Code), autorizadas por el usuario en el chat. La primera solo hizo «pide código sin spec»; la segunda, los cuatro escenarios una vez.
- A2: Una suite «estable» con un agente es la que cumple todos los escenarios en todas sus ejecuciones, sin violaciones. Cinco ejecuciones no bastan para llamarla estable, así que la fase 3 no se marca como hecha.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO se lee ARCHITECTURE §16 ENTONCES tiene la fecha, el agente y su versión, las ejecuciones de cada escenario con cuántas cumplieron, violaron o no avanzaron, la media de bloqueos y de rondas, y los agentes que faltan.
  - test: manual
- AC2: CUANDO se lee la fila de la fase 3 en ARCHITECTURE §18 ENTONCES dice qué está hecho y que la fase sigue abierta hasta que la suite sea estable con al menos cuatro agentes, con uno medido hoy.
  - test: manual

## Archivos

- modificar docs/ARCHITECTURE.md — §16: los resultados; §18: el estado de la fase 3

## Tareas

- [x] T1: Los resultados de la suite y el estado de la fase 3
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Cierre

### Resumen

ARCHITECTURE §16 anota los resultados de la suite del 2026-10-28 con Claude Code 2.1.312: cinco ejecuciones de los cuatro escenarios, las cinco cumplidas, sin violaciones ni bloqueos del guard, con 4 a 14 llamadas a herramientas por ejecución. Nombra también los agentes que faltan. §18 deja la fase 3 «en curso»: todo su contenido está hecho, pero su criterio de salida, una suite estable con al menos cuatro agentes, sigue abierto.

### Desviaciones

- Ninguna.

### Decisiones

- Cinco ejecuciones con un solo agente no bastan para llamar estable a la suite, así que la fase 3 no se marca como hecha.

### Pendientes

- Ejecutar `pnpm evals` con Codex, Gemini CLI, OpenCode y Cursor CLI, con su sesión, y repetir cada escenario varias veces antes de marcar la fase 3.
