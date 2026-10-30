---
kind: standard
epic: 20261030-memoria-de-specty
slice: C1
---

# Specty sabe qué sesión lleva cada cambio y cuáles quedan huérfanos

## Objetivo

Hoy `specty status` lista los cambios abiertos de todas las carpetas, pero no dice si alguna sesión de un agente los está llevando. Con este corte, el guard anota en qué carpeta trabaja cada conversación de un agente y cuándo dio su último paso. `status` dice qué agente lleva cada cambio y hace cuánto, o que el cambio quedó huérfano: espera al agente y nadie trabaja en él.

Es la mitad en vivo de la memoria de Specty. Trae el ADR 0016, que recoge las decisiones de la épica.

## Fuera de alcance

- La memoria duradera (la rama `specty-memory`) y sus comandos: C2.
- Que `new` y `propose` usen quién lleva cada cambio: C4.
- Las sesiones en la UI: C7. Aquí llegan como datos en `status --json`.
- Los agentes sin hooks no anotan nada. Sus comandos de Specty sí cuentan como actividad del cambio (A4).

## Supuestos

- A1: Una sesión se reconoce por su agente y por el id de su conversación (`session_id` o `conversation_id` del evento), como ya hace el guard para ligar una conversación a la carpeta en la que entró. Un evento sin id no se anota.
- A2: Un cambio lo lleva la última sesión que dio un paso en su carpeta: la carpeta del evento o, si la conversación entró con `specty enter`, la del cambio. Solo queda huérfano si espera al agente; uno que espera a la persona no necesita una sesión.
  - impacto: alto
- A3: El guard reescribe la actividad de una sesión solo si cambió de carpeta o si su último paso anotado tiene más de un minuto. Cuesta una lectura pequeña por evento y, como mucho, una escritura por minuto.
- A4: Un cambio cuyo `state.json` cambió hace menos de `memory.orphanAfterMin` minutos no es huérfano aunque no haya actividad anotada: alguien acaba de trabajar en él, por ejemplo un agente sin hooks o un cambio recién creado al que su sesión aún no ha entrado.
- A5: 60 minutos sin pasos (`memory.orphanAfterMin`) bastan para dar por ida a una sesión. Un agente que espera una verificación larga da pasos antes y después de ella.
- A6: La actividad vive en `.git/common/specty/activity/`, aparte de `sessions/`, donde el guard liga cada conversación a la carpeta en la que entró. Los de `sessions/` tienen otro sentido y otro lector, `prune`.

## Criterios de aceptación

- AC1: CUANDO el guard recibe un evento de una conversación de un agente en la carpeta de un cambio ENTONCES `specty status`, desde cualquier carpeta, dice en la línea de ese cambio qué agente lo lleva y hace cuánto dio su último paso, y `--json` lo trae en `holder`, con `tool` y `ago`, en minutos.
- AC2: CUANDO un cambio espera al agente, su `state.json` no cambió en `memory.orphanAfterMin` minutos y ninguna sesión dio un paso en su carpeta en ese tiempo ENTONCES `specty status` lo marca como huérfano (`orphan: true` en `--json`), con el agente y hace cuánto dio su último paso, si alguno lo dio.
- AC3: CUANDO la misma conversación da varios pasos en la misma carpeta en menos de un minuto ENTONCES el guard anota la actividad una sola vez, y la anota otra vez en cuanto la conversación cambia de carpeta.
- AC4: CUANDO `config.yaml` da `memory.orphanAfterMin` ENTONCES tiene que ser un entero positivo; sin él, vale 60.

## Diseño

- Core:
  - `schema/memory.ts`: el esquema de `memory` (`orphanAfterMin`) y su valor resuelto, con 60 por defecto. `schema/config.ts` lo incluye en `ConfigSchema` y en `ResolvedConfig`.
  - `cards/human.ts`: `StatusEntry` gana `holder` (`tool` y `ago`) y `orphan`. La línea del estado añade, según el caso:
    - «lo lleva claude-code, hace 3 min»;
    - «huérfano: claude-code dio su último paso hace 2 h»;
    - «huérfano: ninguna sesión lo lleva».
  - Los minutos se muestran como «ahora mismo», «N min», «N h» o «N d».
- CLI:
  - `store/activity.ts`:
    - `noteActivity` escribe `common/specty/activity/<agente>-<conversación>.json` con `tool`, `folder`, `first` y `last`, salvo que la misma carpeta tenga un último paso de hace menos de un minuto.
    - `readActivity` las lee todas.
  - `enforce/guard.ts`: tras resolver la sesión del evento, anota la actividad en su carpeta. Un fallo al anotarla no cambia la respuesta del guard.
  - `commands/status.ts`: casa cada cambio abierto con la actividad más reciente de su carpeta, comparada por ruta real, y calcula `holder` y `orphan` con `memory.orphanAfterMin` y la fecha de modificación de su `state.json`.
- Documentación:
  - ADR 0016 «La memoria de Specty»: la mitad en vivo y la duradera, la rama propia y quién decide qué. Descartar es solo de la persona.
  - ARCHITECTURE §9 enmienda «no existe un archivo de estado global», y la sección del guard cuenta la actividad.
  - `docs/formats.md`: `activity/` en §1 y `memory` en §6.
  - El glosario gana «Cambio huérfano».

## Archivos

- crear packages/core/src/schema/memory.ts — el esquema y los valores de `memory`
- modificar packages/core/src/schema/config.ts — incluye `memory`
- crear packages/core/test/schema/memory.test.ts — AC4
- modificar packages/core/src/cards/human.ts — quién lleva el cambio y si es huérfano, en la línea del estado
- crear packages/core/test/cards/status-holder.test.ts — AC1 y AC2 en la línea del estado
- crear packages/cli/src/store/activity.ts — anota y lee la actividad de las sesiones
- modificar packages/cli/src/enforce/guard.ts — anota la actividad de cada evento
- modificar packages/cli/src/commands/status.ts — `holder` y `orphan` de cada cambio
- crear packages/cli/test/activity.test.ts — AC1, AC2 y AC3
- crear docs/decisions/0016-la-memoria-de-specty.md — el ADR de la épica
- modificar docs/ARCHITECTURE.md — §9 enmendado y la actividad en el guard
- modificar docs/formats.md — `activity/` y `memory`
- modificar docs/dominio.md — «Cambio huérfano»

## Tareas

- [x] T1: La configuración y la línea del estado saben quién lleva cada cambio
  - files: packages/core/test/schema/memory.test.ts, packages/core/test/cards/status-holder.test.ts, packages/core/src/schema/memory.ts, packages/core/src/schema/config.ts, packages/core/src/cards/human.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/memory.test.ts test/cards/status-holder.test.ts test/cards.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm knip
- [x] T2: El guard anota la actividad de las sesiones y status dice quién lleva cada cambio
  - files: packages/cli/test/activity.test.ts, packages/cli/src/store/activity.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/commands/status.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/activity.test.ts test/status-json.test.ts test/bundle.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T3: El ADR 0016 y la documentación de la actividad
  - files: docs/decisions/0016-la-memoria-de-specty.md, docs/ARCHITECTURE.md, docs/formats.md, docs/dominio.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Anotar la actividad frena al guard — una lectura pequeña por evento y una escritura por minuto. Se mide la mediana del guard de un `Bash` antes y después.
- R2: Una conversación que dejó de trabajar sigue figurando hasta `memory.orphanAfterMin` — `status` dice hace cuánto fue su último paso, y la persona lo ve.
