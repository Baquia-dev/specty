---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C4
---

# El fin de turno devuelve al agente a esperar con `specty wait`

## Objetivo

Hoy un agente puede terminar su turno mientras el cambio espera la decisión de la persona sin que nada la espere, y nadie retoma la conversación cuando la persona decide. Con este cambio, `specty hook agent-stop <agente>` comprueba antes de `check --changed` si el cambio de la carpeta de la conversación espera a la persona sin ningún `specty wait` vivo, y en ese caso le devuelve el turno una vez con una línea que lo dice y la tarjeta de `next`, que pide `specty wait` en la forma de su herramienta o, en modo delegado, que decida él.

## Fuera de alcance

- Instalar el fin de turno sin `check --install`: es el corte C5. Hasta entonces la regla solo actúa donde `check --install` instaló el hook.
- Que `doctor` avise si falta el hook: es el corte C6.
- El freno del guard a `specty wait` en primer plano y a `sleep`: es el corte C2.
- Cambiar la tarjeta de `next`, la marca de `wait` o cómo espera cada herramienta (`waitStep`): son de los cortes C1 y C3.
- Esperar un momento a que aparezca la marca de un `wait` recién lanzado: no hay margen de espera (supuesto A6).

## Supuestos

- A1: Un cambio espera a la persona cuando su fase es de la persona o tiene solicitudes de alcance pendientes, como lo calcula `wait` con `isWaitingForHuman` (`commands/wait.ts`), que se exporta y se reutiliza sin copiarla (supuesto A2 de la épica). El cambio es el de la carpeta en que trabaja la conversación, la que da `enteredSession` como hoy.
  - impacto: alto
- A2: Hay un `wait` vivo cuando `readWait` (`store/waits.ts`) da una marca del cambio sin `ended`. Una marca terminada (`decided`, `timeout`) o cortada (`stopped`) no cuenta, ni la falta de marca. Se lee con la hora del reloj real, la misma de la marca y de su archivo.
  - impacto: alto
- A3: La regla actúa una vez por turno con lo que ya decide cuándo actúa el fin de turno de cada agente (`acts`, y la cuenta por conversación de `counts` en Antigravity), así que el fin siguiente termina el turno (supuesto A3 de la épica). Si la regla actúa, ese fin de turno no ejecuta `check --changed`: lo ejecuta el del turno siguiente.
  - impacto: medio
- A4: La regla no actúa con el evento de un subagente (el `agent_id` de Claude Code y Codex), que devuelve el turno a la sesión principal. Los subagentes de Claude Code terminan con `SubagentStop`, que Specty no escucha, y el `acts` de Antigravity ya deja fuera los suyos.
  - impacto: medio
- A5: La tarjeta y la línea usan la herramienta del argumento `<agente>` del hook aunque su entorno no la marque, para que la tarjeta de `next` diga cómo esperar en esa herramienta. En modo delegado la tarjeta de `next` pide al agente decidir él, y la línea no pide `specty wait`.
  - impacto: medio
- A6: Un agente puede terminar el turno justo después de lanzar `specty wait` en segundo plano, antes de que exista su marca. No se añade margen de espera: el agente recibe el turno una vez, la línea le dice que si ya lo lanzó y sigue en marcha puede terminar, y el fin siguiente termina el turno.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente termina su turno, el cambio de la carpeta de su conversación espera a la persona (su fase es de la persona o tiene solicitudes de alcance pendientes) y ningún `specty wait` de ese cambio está vivo (no hay marca, o terminó o se cortó) ENTONCES su fin de turno lo devuelve a trabajar con una línea que dice que nadie espera esa decisión y la tarjeta de `next`, que pide `specty wait` en la forma de su herramienta, en lugar del informe de `check --changed`.
- AC2: CUANDO hay un `specty wait` vivo de ese cambio, o el cambio no espera a la persona ENTONCES la regla no actúa y el fin de turno sigue como hoy: el turno termina, o `check --changed` lo devuelve si falla.
- AC3: CUANDO el fin de turno ya devolvió ese turno una vez (`stop_hook_active`, o la cuenta por conversación en Antigravity) ENTONCES el turno termina. CUANDO el evento es de un subagente (`agent_id`) ENTONCES la regla no actúa.
- AC4: CUANDO el modo delegado está activo ENTONCES la línea pide al agente tomar la decisión que la persona le delegó, como dice la tarjeta de `next`, y no pide `specty wait`.
- AC5: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/hooks.ts`: `noWaitLine(id, ctx)`, junto a `checkChangedFailedLine`, da la línea del fin de turno cuando el cambio espera a la persona y ningún `wait` lo espera, en español y en inglés, y la de modo delegado (`ctx.delegated`). Se exporta en `cards/index.ts`.
- CLI, `commands/wait.ts`: exporta `isWaitingForHuman`, sin cambiarla.
- CLI, `enforce/agent-stop.ts`: `turnReport` resuelve el cambio activo una vez y prueba primero la regla de `wait` y después `check --changed`, con la misma cuenta por conversación para las dos. La regla (`waitReport`) no actúa con un subagente (`subagentOf`), ni sin cambio, ni si no espera a la persona, ni con un `wait` vivo (`readWait` con `new Date()`). Si actúa, da `noWaitLine` y la tarjeta de `next` renderizada (`renderText`), con la herramienta del hook en la sesión y en `cards`.
- Docs: el párrafo «Fin de turno» de `docs/ARCHITECTURE.md` cuenta la regla de `wait`.

## Archivos

- modificar packages/core/src/cards/hooks.ts — la línea del fin de turno cuando nadie espera la decisión de la persona, en español y en inglés, y en modo delegado
- modificar packages/core/src/cards/index.ts — exporta `noWaitLine`
- modificar packages/core/test/cards/hooks.test.ts — la línea en los dos idiomas y en modo delegado
- modificar packages/cli/src/commands/wait.ts — exporta `isWaitingForHuman` para el fin de turno
- modificar packages/cli/src/enforce/agent-stop.ts — la regla de `wait` antes de `check --changed`, una vez por turno y nunca con un subagente
- crear packages/cli/test/agent-stop-wait.test.ts — el fin de turno con el cambio esperando a la persona: sin `wait`, con uno vivo, cortado o agotado, una vez por turno, con subagente, en la carpeta de la conversación, en modo delegado y en inglés
- modificar docs/ARCHITECTURE.md — el fin de turno cuenta la regla de `wait`

## Tareas

- [ ] T1: La línea del fin de turno cuando nadie espera la decisión, en español y en inglés
  - files: packages/core/src/cards/hooks.ts, packages/core/src/cards/index.ts, packages/core/test/cards/hooks.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/hooks.test.ts
  - type: feat
- [ ] T2: El fin de turno devuelve al agente a esperar con `specty wait`
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/test/agent-stop-wait.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agent-stop-wait.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T3: La documentación cuenta la regla de `wait` en el fin de turno
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Un agente que termina el turno justo tras lanzar `wait` en segundo plano, antes de su marca, recibe el turno una vez sin necesitarlo: cuesta una llamada al modelo, nunca un bucle, y la línea le dice que puede terminar si su `wait` sigue en marcha (supuesto A6).
- R2: Mientras la regla actúa, ese fin de turno no da el informe de `check --changed`. Mientras el cambio espera a la persona el código está bloqueado o pendiente de su decisión, y el turno siguiente vuelve a comprobarlo.
