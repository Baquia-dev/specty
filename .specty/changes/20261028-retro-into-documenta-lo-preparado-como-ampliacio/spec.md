---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C1
---

# `retro --into` documenta lo preparado como ampliación del cambio activo

## Objetivo

Cuando alguien prepara a mano código fuera del alcance del cambio activo, hoy el hook `pre-commit` solo ofrece una retro aparte, aunque el código pertenezca a ese cambio. `specty retro --into <id> --reason "<motivo>"` lo documenta como una ampliación del alcance de la tarea activa: la persona la aprueba y el commit pasa con los trailers del cambio activo, como prometen ARCHITECTURE §6 y §9.

## Fuera de alcance

- `--into` en otra fase que `implementing`, o sobre un cambio de otra carpeta: la salida pide `specty retro`.
- Combinar `--into` con `--minimal`.
- Mostrar en la UI que una solicitud viene de un retro.
- Que el agente repita el `git commit`: el guard se lo sigue impidiendo, y lo repite la persona.

## Supuestos

- A1: La huella de lo preparado es la ruta, el modo y el blob de cada archivo gobernado preparado fuera de `.specty/` (`git ls-files -s`), más los borrados; cambia si se prepara, se quita o se modifica cualquiera de ellos, aunque esté dentro del alcance, porque el recibo cubre todo el índice.
  - impacto: medio
- A2: Al aprobar la solicitud, Specty prepara el estado y la auditoría del cambio, como prepara la spec archivada de una retro aparte, así que el commit que se repite lleva la ampliación que lo documenta.
- A3: Si la persona cambia lo preparado después de la aprobación, el recibo deja de valer y el hook trata el commit como un cambio manual, que pasa porque sus archivos ya están en el alcance ampliado.
- A4: Una solicitud caducada la rechaza Specty, sin preguntar a la persona: `scope.decided` con `decision: rejected`, actor `specty` y el motivo.
- A5: Desbloquear un test aprobado con `retro --into` sigue siendo decisión solo de la persona, también en modo delegado, como con `scope add` (ADR 0014).

## Criterios de aceptación

- AC1: CUANDO hay código gobernado preparado fuera del alcance del cambio activo, en `implementing` con una tarea activa, y el agente ejecuta `specty retro --into <id> --reason "<motivo>"` ENTONCES Specty crea la solicitud `S<n>` de la tarea activa con esos archivos y el motivo, no la aprueba sola aunque `scope.autoApprove` cubra sus archivos, y el commit sigue bloqueado.
- AC2: CUANDO se aprueba esa solicitud con `specty approve --scope S<n>` y lo preparado no cambió ENTONCES los archivos entran en el alcance de la tarea, la auditoría del cambio registra `retro.confirmed` con la solicitud, y el `git commit` que se repite pasa con `Specty-Change: <id>` y `Specty-Retro: true` e incluye el estado del cambio.
- AC3: CUANDO lo preparado cambió entre la solicitud y su aprobación ENTONCES Specty rechaza la solicitud con ese motivo, los archivos no entran en el alcance, el commit sigue bloqueado y la salida pide repetir `specty retro --into <id>`.
- AC4: CUANDO se ejecuta `specty retro --into <id>` sin motivo, con un id que no es el cambio activo de la carpeta, sin una tarea activa, junto a `--minimal` o sin código gobernado preparado fuera del alcance ENTONCES no crea nada y la salida da el paso válido.
- AC5: CUANDO el hook `pre-commit` bloquea código fuera del alcance de un cambio en `implementing` con una tarea activa ENTONCES su mensaje propone `specty retro --into <id>`; con el cambio en otra fase, propone `specty retro`.

## Diseño

- `ScopeRequest` gana `retro` (opcional): la huella de lo preparado cuando la solicitud la creó `retro --into`.
- `commands/retro-into.ts` valida y crea la solicitud. `flow/retro-into.ts` reúne lo que comparten el comando, el hook y la aprobación:
  - el alcance del cambio, que hoy está en `enforce/hook.ts`;
  - la huella de lo preparado;
  - la confirmación: `retro.confirmed`, preparar `.specty/changes/<id>/` y el recibo `retro` del cambio para el índice resultante.
- `decideScope` (aprobación por la terminal, la UI o el modo delegado): ante una solicitud con `retro`, si la huella cambió la rechaza sin preguntar; si no, la aprueba como hoy y después confirma la retro. La tarjeta pide repetir `git commit` a la persona, o al agente delegado que se lo pida.
- Las tarjetas nuevas van en `core/src/cards/retro-into.ts`; `blockedCommitMessage` recibe si el cambio admite `--into`.

## Archivos

- modificar packages/core/src/schema/state.ts — el campo `retro` de la solicitud
- crear packages/core/src/cards/retro-into.ts — rechazos, solicitud creada, aprobada y caducada
- modificar packages/core/src/cards/hooks.ts — el bloqueo propone `retro --into`
- modificar packages/core/src/cards/index.ts — exportar las tarjetas nuevas
- crear packages/core/test/cards/retro-into.test.ts — textos de las tarjetas
- crear packages/core/test/cards/hooks.test.ts — el mensaje del bloqueo con y sin `--into`
- crear packages/cli/src/commands/retro-into.ts — el comando
- crear packages/cli/src/flow/retro-into.ts — alcance del cambio, huella y confirmación
- modificar packages/cli/src/commands/agent-commands.ts — opciones `--into` y `--reason`
- modificar packages/cli/src/commands/scope-decision.ts — solicitud caducada o confirmada al aprobar
- modificar packages/cli/src/enforce/hook.ts — el alcance desde el flujo y el mensaje con `--into`
- crear packages/cli/test/retro-into.test.ts — el recorrido con hooks de git reales
- modificar docs/ARCHITECTURE.md — §6 y §9: `--into` implementado
- modificar docs/formats.md — `retro` de la solicitud y datos de `retro.confirmed`

## Tareas

- [x] T1: Tarjetas de `retro --into` y el mensaje del bloqueo
  - files: packages/core/src/schema/state.ts, packages/core/src/cards/retro-into.ts, packages/core/src/cards/hooks.ts, packages/core/src/cards/index.ts, packages/core/test/cards/retro-into.test.ts, packages/core/test/cards/hooks.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
- [ ] T2: El comando, la aprobación con recibo y el hook
  - files: packages/cli/src/commands/retro-into.ts, packages/cli/src/flow/retro-into.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/enforce/hook.ts, packages/cli/test/retro-into.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
- [ ] T3: Documentación de `retro --into`
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - type: docs

## Riesgos

- R1: Mover el alcance del cambio fuera de `enforce/hook.ts` podría cambiar lo que deja pasar el hook. Mitigación: la función se mueve sin cambios, y las pruebas actuales del hook siguen igual.
- R2: Preparar el estado del cambio en el commit de la persona mezcla el estado con su código. Mitigación: es lo mismo que hace una retro aparte con su spec, y solo se prepara la carpeta de ese cambio.
