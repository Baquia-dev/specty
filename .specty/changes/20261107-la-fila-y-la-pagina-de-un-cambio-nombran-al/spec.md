---
kind: standard
---

# La fila y la página de un cambio nombran al agente por su nombre

## Objetivo

En `specty ui`, la fila de la Bandeja y la página de un cambio dicen qué agente llevaba su conversación con el id de su herramienta («Su conversación (codex) salió de su carpeta»), mientras la línea de un corte ya lo dice con su nombre («Codex»). Con este cambio, todas las vistas usan su nombre, de una sola lista: la de core (`AGENT_NAMES`). Así se resuelve el pendiente P240.

## Fuera de alcance

- Los textos de la CLI (`specty status`, `next`, `doctor`…) no cambian: ya usan `AGENT_NAMES` o hablan de la herramienta por su id a propósito.
- Las órdenes para abrir cada agente en la carpeta del cambio («Claude Code: cd … && claude», «Antigravity CLI: …») no cambian.
- El tamaño de `inbox/inbox-row.ts` (P238) no se trata aquí.

## Supuestos

- A1: El nombre de cada herramienta es el de `AGENT_NAMES` de core, como ya hace la línea de un corte. Una herramienta que no está en esa lista sale con su id, como hoy.
- A2: En la página de un cambio también se nombran por su nombre el agente del `specty wait` que se agotó o se cortó y el de la última conversación en su carpeta. Son el mismo id de herramienta que el de la conversación que salió, y P240 pide unificar.
- A3: La pestaña Historial tiene su propia lista de nombres, igual a `AGENT_NAMES` salvo que le falta GitHub Copilot. Pasa a usar la misma función, así que un paso de Copilot dirá «GitHub Copilot» y no «copilot».

## Criterios de aceptación

- AC1: CUANDO la conversación de un cambio salió de su carpeta ENTONCES su fila en la Bandeja dice «Su conversación (Codex) salió de su carpeta» («Its conversation (Codex) left its folder»), con el nombre del agente y no su id.
- AC2: CUANDO la página de un cambio explica en «Cómo retomarlo» qué pasó ENTONCES nombra al agente por su nombre, en español y en inglés: el de la conversación que salió de su carpeta («Su conversación (Codex) salió de su carpeta hace 4 min.»), el del `specty wait` que se agotó o se cortó («El specty wait del agente (Claude Code) agotó su tiempo…») y el de la última conversación en su carpeta («…en su carpeta (Claude Code) dio un paso…»).
- AC3: CUANDO la pestaña Historial muestra un paso de un agente de GitHub Copilot ENTONCES dice «Agente · GitHub Copilot».
- AC4: CUANDO la herramienta de una conversación no está entre los agentes que conoce Specty ENTONCES las vistas la muestran con su id, tal como llega.

## Diseño

- Una función pura, `agentName(tool)` en `ui/src/data/agent-name.ts`, da el nombre de `AGENT_NAMES` (de `@baquia-dev/specty-core/light`) o, si no está, el id. Es la que hoy tiene en privado `inbox/lane-holds.ts` (`nameOf`), que pasa a importarla.
- `inbox/inbox-row.ts` la expone a su plantilla para el aviso de la conversación que salió de su carpeta.
- `change/resume-hints.ts` la usa en sus tres textos con herramienta: conversación fuera de su carpeta, `specty wait` agotado o cortado, y última conversación en su carpeta.
- `history/history-tab.ts` deja su lista `TOOLS` y usa `agentName`.

## Archivos

- crear packages/ui/src/data/agent-name.ts — el nombre de un agente por su herramienta, o su id si no lo conoce
- crear packages/ui/src/data/agent-name.test.ts — AC4: cada herramienta conocida por su nombre y una desconocida por su id
- modificar packages/ui/src/inbox/lane-holds.ts — usa `agentName` en lugar de su `nameOf` privado
- modificar packages/ui/src/inbox/inbox-row.ts — el aviso de la conversación que salió de su carpeta nombra al agente
- modificar packages/ui/src/change/resume-hints.ts — sus tres textos con herramienta nombran al agente
- modificar packages/ui/src/change/resume-hints.test.ts — AC1 y AC2: la fila y la página dicen el nombre del agente, no su id
- modificar packages/ui/src/change/change-page.unattended.test.ts — AC2: su aserción del `specty wait` agotado espera el nombre del agente
- modificar packages/ui/src/history/history-tab.ts — usa `agentName` en lugar de su lista `TOOLS`
- modificar packages/ui/src/history/history-who.test.ts — AC3 y AC4: GitHub Copilot por su nombre y una herramienta desconocida por su id

## Tareas

- [x] T1: Una sola función nombra a los agentes, y la línea de un corte la usa
  - files: packages/ui/src/data/agent-name.ts, packages/ui/src/data/agent-name.test.ts, packages/ui/src/inbox/lane-holds.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/agent-name.test.ts --include src/inbox/lane-holds.test.ts --include src/inbox/inbox-lane.test.ts
  - type: fix
- [ ] T2: La fila y la página de un cambio nombran al agente por su nombre
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/resume-hints.ts, packages/ui/src/change/resume-hints.test.ts, packages/ui/src/change/change-page.unattended.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/resume-hints.test.ts --include src/change/change-page.unattended.test.ts --include src/inbox/inbox-row.test.ts
  - type: fix
- [ ] T3: La pestaña Historial nombra a los agentes con la misma función
  - files: packages/ui/src/history/history-tab.ts, packages/ui/src/history/history-who.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-who.test.ts --include src/history/history-tab.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
