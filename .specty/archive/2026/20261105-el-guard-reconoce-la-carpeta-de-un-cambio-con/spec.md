---
kind: standard
---

# El guard reconoce la carpeta de un cambio con la configuración inválida

## Objetivo

Cuando la `.specty/config.yaml` de la carpeta de un cambio no es válida, el guard no puede abrir su sesión: a la conversación que entró con `specty enter` le trata esa carpeta como «otra worktree» y no le deja escribir en ella, y a la que trabaja dentro (Claude Code tras `EnterWorktree`) le deja pasar todo, incluida la propia configuración (P154, la mitad de P131 que no cubrió el corte C6 de `20261105-pendientes-de-las-unidades`). Con este cambio, el guard juzga esa carpeta con una configuración válida del mismo repositorio: la reconoce como la carpeta del cambio, aplica las reglas de su fase y su tarea, y sigue sin dejar al agente editar `.specty/config.yaml`, que corrige la persona como ya dice `specty next`.

## Fuera de alcance

- Que los comandos de Specty (`next`, `task done`, `enter`…) funcionen en una carpeta con la configuración inválida: siguen dando el error y pidiendo a la persona que la corrija.
- Una carpeta principal con la configuración inválida y sin otra válida de la que tomarla: el guard sigue dejando pasar, como hoy.
- El fin de turno (`hook agent-stop`) y la tarjeta «TU CAMBIO» de `next` para una conversación ligada a una carpeta con la configuración inválida.
- Textos nuevos: el bloqueo de `.specty/config.yaml` es el de cualquier archivo protegido, y su SIGUIENTE (`specty next`) lleva a la tarjeta que pide a la persona corregirla.

## Supuestos

- A1: Para una conversación que entró con `specty enter` en la carpeta de un cambio cuya configuración no es válida, el guard abre la sesión de esa carpeta con la configuración de la carpeta en la que trabaja la herramienta, que ya abrió y es válida: es del mismo repositorio y solo puede diferir en lo que el cambio tocó de ella.
  - impacto: alto
- A2: Para un agente que trabaja dentro de esa carpeta (su herramienta le da ese `cwd`), el guard la abre con la configuración de la carpeta principal del repositorio (la primera worktree que lista git), si es válida; si no lo es, deja pasar como hoy.
- A3: La configuración de repuesto solo cambia cómo juzga el guard: el estado del cambio, su spec y su fase siguen siendo los de la carpeta del cambio, y `.specty/config.yaml` sigue protegido por la regla de archivos protegidos, que no depende de la configuración.

## Criterios de aceptación

- AC1: CUANDO una conversación que entró con `specty enter` en la carpeta de un cambio cuya `.specty/config.yaml` no es válida escribe un archivo de esa carpeta ENTONCES el guard no lo bloquea como de «otra worktree», sino que lo juzga con las reglas de su cambio: la spec en borrador se escribe y el código se bloquea por la fase.
- AC2: CUANDO esa conversación escribe la `.specty/config.yaml` de la carpeta ENTONCES el guard lo bloquea como archivo protegido; y un comando que correría fuera de la carpeta se bloquea con `cd '<carpeta>' && …`, como con una configuración válida.
- AC3: CUANDO un agente trabaja dentro de la carpeta de un cambio cuya configuración no es válida ENTONCES el guard la juzga con la configuración de la carpeta principal: bloquea la escritura de `.specty/config.yaml` como archivo protegido y el código por la fase del cambio, en lugar de dejar pasarlo todo.

## Diseño

- CLI, `session.ts`: `openSession(environment, fallback?)`. Si la configuración de la carpeta no es válida y `fallback(git)` da una, abre la sesión con ella; sin `fallback`, o si no da ninguna, sigue devolviendo `invalid`. Los comandos no la pasan.
- CLI, `enforce/sessions.ts`: `enteredFolder` abre la carpeta ligada con la configuración de la sesión de la herramienta como repuesto (A1). `guardSession(environment, cwd)` abre la carpeta de la herramienta con la configuración de la carpeta principal como repuesto (A2), leída con `loadConfig`.
- CLI, `enforce/guard.ts`: abre la sesión con `guardSession`.
- Docs: ARCHITECTURE §10 («Entrar con `specty enter`») y formats.md §6, qué hace el guard con una configuración inválida.

## Archivos

- modificar packages/cli/src/session.ts — `openSession` acepta una configuración de repuesto cuando la de la carpeta no es válida
- modificar packages/cli/src/enforce/sessions.ts — la carpeta ligada se abre con la configuración de la herramienta, y la de la herramienta con la de la carpeta principal
- modificar packages/cli/src/enforce/guard.ts — el guard abre su sesión con la configuración de repuesto
- crear packages/cli/test/invalid-config-guard.test.ts — el guard en una carpeta con la configuración inválida: AC1, AC2 y AC3
- modificar docs/ARCHITECTURE.md — el guard juzga una carpeta con la configuración inválida
- modificar docs/formats.md — qué hace el guard con una configuración inválida

## Tareas

- [x] T1: El guard juzga la carpeta de un cambio con la configuración inválida
  - files: packages/cli/src/session.ts, packages/cli/src/enforce/sessions.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/invalid-config-guard.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/invalid-config-guard.test.ts test/enter.test.ts test/invalid-config.test.ts && pnpm typecheck
  - type: fix
- [x] T2: Documentar qué hace el guard con una configuración inválida
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: La configuración de repuesto puede diferir de la que tenía la carpeta (otro `governed`, otro alcance implícito de tests) — solo mientras la persona no corrige la suya, y la regla que protege `.specty/config.yaml` no depende de ella.

## Cierre

### Resumen

El guard ya no trata como «otra worktree» la carpeta de un cambio cuya `.specty/config.yaml` no es válida (P154). `openSession` acepta una configuración de repuesto que solo pasa el guard: `enteredFolder` abre la carpeta en la que entró la conversación con `specty enter` usando la configuración de la carpeta en la que trabaja la herramienta, y `guardSession` abre la carpeta de la herramienta con la de la carpeta principal. Así el guard reconoce la carpeta del cambio, la juzga con las reglas de su fase (AC1), sigue bloqueando `.specty/config.yaml` como archivo protegido y los comandos que correrían fuera de ella (AC2), y a un agente que trabaja dentro de esa carpeta (Claude Code tras `EnterWorktree`) ya no le deja pasar todo, incluida la propia configuración (AC3). ARCHITECTURE §10 y formats.md §6 lo documentan.

### Desviaciones

- Ninguna.

### Decisiones

- La configuración de repuesto solo existe para el guard: los comandos siguen sin abrir una carpeta cuya configuración no es válida, y su tarjeta pide a la persona que la corrija.
- Para la conversación que entró con `specty enter` se usa la configuración de la herramienta, que el guard ya abrió y es válida; para el agente que trabaja dentro, la de la carpeta principal (la primera worktree de git), porque no hay otra sesión abierta.
- Sin textos nuevos: el bloqueo de `.specty/config.yaml` es el de cualquier archivo protegido, y su SIGUIENTE (`specty next`) lleva a la tarjeta que dice que la corrige la persona.

### Pendientes

- Con la configuración de la carpeta inválida, el fin de turno (`hook agent-stop`) y la tarjeta «TU CAMBIO» de `next` para una conversación ligada a esa carpeta siguen sin abrirla: no la reconocen hasta que la persona la corrige.
- Si la carpeta principal también tiene la configuración inválida, el guard sigue dejando pasar todo a un agente que trabaja dentro de la carpeta de un cambio, también `.specty/config.yaml`.
