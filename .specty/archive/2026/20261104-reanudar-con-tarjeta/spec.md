---
kind: standard
follows:
  - 20261104-conversacion-vuelve-a-su-carpeta
---

# Al reanudar una sesión de Claude Code vuelve la tarjeta de su cambio

## Objetivo

Hoy, cuando Claude Code reanuda una sesión (`--resume`, `--continue` o reabrir la conversación en la extensión), el `SessionStart` de Specty no se dispara, porque su matcher solo admite `startup|clear|compact`. La sesión reanudada no recibe la tarjeta de su cambio, ni la de volver a su carpeta si quedó en la principal. Con este cambio, `init` escribe también `resume`, el guard responde con la tarjeta de `specty next` y `doctor` avisa a las instalaciones anteriores. Es el AC3 de la épica `20261104-sesiones-con-su-carpeta`.

## Fuera de alcance

- La marca «fuera de su carpeta» en `status` (AC5 de la épica): va en el cambio siguiente.
- Las carpetas perdidas y la UI: son los cortes C2 y C3 de la épica.
- El evento de reanudar de otros agentes (Codex, Cursor, Devin…), fuera de alcance de la épica.
- Una tarjeta distinta al reanudar: es la misma que al empezar o tras compactar (la de `specty next`).
- Los pendientes del cambio anterior (dividir `cards/next.ts`, `cancel` con id desde la carpeta principal, `propose` con un `kind` distinto del estado): siguen en la memoria de Specty.
- Rehacer la instalación de este repositorio con `specty init`: solo se añade `resume` al matcher de `.claude/settings.json`.

## Supuestos

- A1: Claude Code conserva el `session_id` al reanudar una sesión y su `SessionStart` llega con `source: "resume"` (A2 de la épica). El guard ya responde a cualquier `SessionStart` de Claude Code con la tarjeta de `next`, y desde el cambio anterior esa tarjeta, en la carpeta principal, es la de volver a la carpeta enlazada; así que basta con que el matcher deje pasar `resume`.
  - impacto: alto
- A2: El aviso nuevo (`claude-resume`) solo sale cuando el `SessionStart` de Specty ya se dispara al empezar y no al reanudar. Si tampoco se dispara al empezar, sale solo el aviso de antes (`claude-startup`), porque el mismo `specty init` arregla los dos.
- A3: Que se dispare al reanudar se decide igual que al empezar: el matcher es una expresión regular sobre `source`, y sin matcher, vacío o `*` admite todos.

## Criterios de aceptación

- AC1: CUANDO `specty init` instala el guard de Claude Code ENTONCES su `SessionStart` lleva el matcher `startup|clear|compact|resume`.
- AC2: CUANDO Claude Code reanuda en la carpeta principal una conversación enlazada a la carpeta de un cambio abierto (`SessionStart` con `source: "resume"`) ENTONCES el guard responde con la tarjeta de `specty next`, que nombra el cambio y su carpeta y pide volver allí.
- AC3: CUANDO el `SessionStart` de Specty se dispara al empezar una sesión pero no al reanudarla ENTONCES `specty doctor` avisa de que la sesión reanudada no recibe la tarjeta y de que basta con `specty init`, y deja de avisar tras `specty init`.
- AC4: CUANDO el `SessionStart` de Specty no se dispara ni al empezar ni al reanudar ENTONCES `specty doctor` da solo el aviso de antes de la tarjeta al empezar una sesión.

## Diseño

- `agents/claude-code.ts`: `resume` en el matcher de `SessionStart`. `runsAtSessionStart(matcher, source)` recibe el origen (por defecto `startup`). En `doctor`, una función que dice qué orígenes no admite ninguna de las entradas de Specty: sin `startup`, `claude-startup`; con `startup` y sin `resume`, `claude-resume`.
- Core (`cards/doctor.ts` y `cards/doctor-agents.ts`): el código `claude-resume` y su texto, en español y en inglés.
- El `.claude/settings.json` de este repositorio lleva el matcher nuevo, para que `doctor` no avise aquí.

## Archivos

- modificar packages/cli/src/agents/claude-code.ts — `resume` en el matcher y el aviso `claude-resume` de `doctor`
- modificar packages/core/src/cards/doctor.ts — el código `claude-resume` en `DoctorLine`
- modificar packages/core/src/cards/doctor-agents.ts — el texto de `claude-resume`, en español y en inglés
- modificar .claude/settings.json — `resume` en el matcher del `SessionStart` de este repositorio
- modificar packages/core/test/cards/doctor.test.ts — el texto de `claude-resume`, en español y en inglés
- modificar packages/cli/test/setup.test.ts — el matcher que escribe `init`
- crear packages/cli/test/session-resume.test.ts — la tarjeta al reanudar y los avisos de `doctor`, de punta a punta
- modificar docs/ARCHITECTURE.md — la tarjeta al reanudar en Claude Code y su aviso

## Tareas

- [x] T1: El aviso `claude-resume`, en español y en inglés
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor.test.ts && pnpm typecheck && pnpm lint
- [x] T2: `init` con `resume` y el aviso de `doctor`, y la documentación
  - files: packages/cli/src/agents/claude-code.ts, .claude/settings.json, packages/cli/test/setup.test.ts, packages/cli/test/session-resume.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-resume.test.ts test/setup.test.ts src/agents/claude-code.test.ts test/session-return.test.ts test/session-start.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: El aviso sale en todas las instalaciones anteriores de Claude Code. Mitigación: dice que basta con `specty init`, como los avisos de eventos anteriores (R3 de la épica).
- R2: Si Claude Code no conservara el `session_id` al reanudar, la sesión reanudada no tiene enlace. Mitigación: recibe la tarjeta sin cambio activo, con la lista de cambios huérfanos del cambio anterior.

## Cierre

### Resumen

Claude Code ya da la tarjeta de Specty al reanudar una sesión. `init` escribe el `SessionStart` del guard con el matcher `startup|clear|compact|resume`. Al reanudar, el guard responde con la tarjeta de `specty next`: en la carpeta principal, la de volver a la carpeta del cambio enlazado. `doctor` tiene el aviso `claude-resume` para un `SessionStart` que se dispara al empezar y no al reanudar; si tampoco se dispara al empezar, da solo el aviso anterior (`claude-startup`). Cubre el AC3 de la épica `20261104-sesiones-con-su-carpeta`.

### Desviaciones

- `.claude/settings.json` de este repositorio no se tocó: el guard no deja editarlo a mano porque lo gestiona Specty. Su matcher sigue sin `resume` hasta que la persona ejecute `specty init`.
- `packages/cli/src/agents/claude-code.ts` pasó también al alcance de T1. La verificación de T1 incluía `pnpm typecheck`, y el test aprobado de `runsAtSessionStart` con el origen no compilaba hasta cambiar su firma.

### Decisiones

- `runsAtSessionStart(matcher, source)` recibe el origen, con `startup` por defecto, en lugar de una función nueva solo para `resume`: la regla del matcher es la misma.
- Un solo aviso por instalación: sin `startup`, `claude-startup`; con `startup` y sin `resume`, `claude-resume`. El mismo `specty init` arregla los dos.

### Pendientes

- El `.claude/settings.json` de este repositorio no tiene `resume` en el matcher del `SessionStart`: la persona debe ejecutar `specty init` en la carpeta principal, con el CLI ya construido desde main, y `doctor` avisará hasta entonces.
