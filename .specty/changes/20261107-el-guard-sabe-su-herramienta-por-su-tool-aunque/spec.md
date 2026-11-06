---
kind: standard
---

# El guard sabe su herramienta por su --tool aunque el entorno del hook no la diga

## Objetivo

Las tarjetas que da el guard (la del `SessionStart` al empezar, la de tras compactar o limpiar, y las demás que salen de `next`) solo saben que la sesión es de Claude Code o de Codex si el entorno del hook lo dice (`CLAUDECODE`, `CODEX_THREAD_ID`); sin eso salen como las de una herramienta desconocida, sin el encargo de subagentes. Con este cambio, la sesión del guard lleva la herramienta de su `--tool`, que es la que instaló el hook, así que sus tarjetas son las de `next` en esa herramienta, diga lo que diga su entorno (P256).

## Fuera de alcance

- `specty next` y los demás comandos siguen sabiendo la herramienta por su entorno (`detectAgentTool`): solo cambia la sesión del guard y la del fin de turno.
- Nada de lo que decide un permiso cambia: la persona en la terminal sigue siendo la de una TTY real sin marcas de agente (`personAtTerminal`), que lee el entorno y no la sesión.
- Los hooks de una herramienta que corre los de otra siguen respondiendo antes, sin sesión (`borrowed`, Devin con los de Claude Code).
- No se instala ni cambia ningún hook, y no hay evals nuevas.

## Supuestos

- A1: El `--tool` del hook manda sobre el entorno, como ya hacen el fin de turno (`waitReport` en `enforce/agent-stop.ts`) y los avisos del guard (`guardContext`): el hook está en la configuración de esa herramienta, y un entorno con la marca de otra solo puede venir de haberla abierto desde la terminal de aquella, que lo hereda.
  - impacto: medio
- A2: Basta con poner la herramienta en la sesión que responde al evento (`enteredSession`, que ya le pone la conversación del evento), tanto en `session.tool` como en `session.cards.tool`: el guard no escribe auditoría ni commits, así que `session.tool` solo llega a lo que muestran sus tarjetas y sus mensajes.
  - impacto: bajo
- A3: Con esto, qué variables llegan al entorno de los hooks reales deja de importar para las tarjetas del guard; el cierre lo anota así en vez de medirlo en cada herramienta.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el guard de Claude Code (`specty guard --tool claude-code`) responde a un `SessionStart`, al empezar o tras compactar, y el entorno de su hook no tiene `CLAUDECODE` ENTONCES su tarjeta es la misma que imprime `specty next` en Claude Code para esa conversación, con el encargo de subagentes.
- AC2: CUANDO el guard de Codex (`specty guard --tool codex`) responde a su `SessionStart` y el entorno de su hook no tiene ninguna marca de Codex ENTONCES su tarjeta es la misma que imprime `specty next` en Codex para ese hilo.
- AC3: CUANDO el entorno del hook tiene la marca de otra herramienta que la de su `--tool` ENTONCES la tarjeta del guard es la de su `--tool`.

## Diseño

- `packages/cli/src/enforce/sessions.ts`: `enteredSession(tool, session, event)` devuelve la sesión con `tool` y `cards.tool` iguales al `--tool` del hook, además de la conversación del evento. Es la sesión con la que responden el guard y el fin de turno, también la de la carpeta del cambio en la que entró la conversación.
- `packages/cli/src/enforce/agent-stop.ts`: `waitReport` ya recibe esa sesión, así que quita su copia con la herramienta del hook.
- Tests: `front-start.test.ts` y `front-start-codex.test.ts` vuelven a comparar la tarjeta entera del guard con la de `next` en la misma herramienta (AC1, AC2), también tras compactar en Claude Code, y con un entorno de Claude Code en el hook de Codex (AC3).

## Archivos

- modificar packages/cli/src/enforce/sessions.ts — la sesión que responde al evento lleva la herramienta del `--tool`
- modificar packages/cli/src/enforce/agent-stop.ts — `waitReport` usa la sesión que ya lleva la herramienta del hook
- modificar packages/cli/test/front-start.test.ts — la tarjeta del guard de Claude Code es la de `next` entera, al empezar y tras compactar
- modificar packages/cli/test/front-start-codex.test.ts — la tarjeta del guard de Codex es la de `next` entera, también con el entorno de otra herramienta
- modificar docs/ARCHITECTURE.md — el guard toma la herramienta de su `--tool` (§7 y §10)

## Tareas

- [x] T1: El guard y el fin de turno responden con la herramienta de su --tool
  - files: packages/cli/src/enforce/sessions.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/test/front-start.test.ts, packages/cli/test/front-start-codex.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-start.test.ts test/front-start-codex.test.ts test/agent-stop-wait.test.ts test/session-start.test.ts test/session-start-codex.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T2: La arquitectura cuenta que el guard toma la herramienta de su --tool
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: grep -q 'la herramienta de su `--tool`' docs/ARCHITECTURE.md
  - type: docs

## Riesgos

- R1: Otros tests del guard sin entorno de agente esperaban las tarjetas de una herramienta desconocida y cambian de texto. Mitigación: se ejecuta la suite entera de la CLI antes de proponer los tests y antes de aceptar, y cada test que cambie se ajusta de forma mínima, manteniendo su intención.
