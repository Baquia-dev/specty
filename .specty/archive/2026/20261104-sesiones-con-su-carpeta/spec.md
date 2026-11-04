---
kind: epic
---

# Las sesiones no pierden la carpeta de su cambio

## Objetivo

Hoy una sesión de agente pierde la carpeta (worktree) de su cambio de dos formas, y ninguna tiene salida clara:

- La sesión vuelve a la carpeta principal: al reanudarla, tras compactar o tras un `cd` a la ruta principal. Allí `specty next` dice «No hay un cambio activo» y le propone `specty new`, aunque el guard sabe en qué carpeta entró (`sessions/<conversación>.json`). Además, `status` deja de decir quién lleva el cambio.
- La carpeta del cambio desaparece: alguien la borró o git la «podó». El cambio deja de verse en `status` y en la UI aunque su rama sigue ahí. Y `EnterWorktree` con su id crea otra worktree vacía en `.claude/worktrees/`.

Con esta épica, la sesión recuerda su cambio y Specty le dice cómo volver. Una carpeta perdida se ve, y se recupera desde su rama con un comando que pueden ejecutar el agente o la persona, o con un botón en la UI.

## Fuera de alcance

- Recuperar lo que no estaba confirmado en la rama cuando la carpeta se borró: no vuelve, y las salidas lo dicen.
- Recuperar una rama de cambio borrada o la carpeta principal.
- Los cambios sin rama propia (`git.branchPerChange: false`).
- Mover la sesión a su carpeta sin que el agente actúe: Specty no cambia la carpeta de trabajo de Claude Code, le dice cómo hacerlo.
- El evento de reanudar de otros agentes (Codex, Cursor, Devin…). Los que entran con `specty enter` ya trabajan en su carpeta por la redirección del guard.
- Impedir que la persona borre carpetas, o rescatar los archivos de una carpeta que git ya no reconoce.

## Supuestos

- A1: La referencia es el enlace que el guard ya escribe en `common/specty/sessions/<conversación>.json` cuando la conversación entra con `EnterWorktree` o `specty enter` (formats.md §1). No hace falta un estado nuevo: `next`, `status` y la UI lo leen, y `specty new` también lo escribe cuando sabe la conversación que lo ejecuta.
  - impacto: alto
- A2: Claude Code conserva el `session_id` al reanudar una sesión (`--resume`, `--continue` y reabrir una conversación en la extensión), y su `SessionStart` llega con `source: "resume"`. Si no lo conservara, la sesión reanudada no tiene enlace y le sirve la lista de cambios sin conversación de AC4.
  - impacto: alto
- A3: Un comando de shell solo sabe su conversación en Claude Code (`CLAUDE_CODE_SESSION_ID`, `agentSession`). Las demás herramientas la dicen en el evento del guard, que ya redirige sus comandos a la carpeta en la que entraron (`enteredFolder`). Por eso la pérdida por volver a la principal es, en la práctica, de Claude Code, y la carpeta perdida es de todos.
  - impacto: medio
- A4: `specty new` enlaza la conversación al cambio nuevo solo si no está enlazada a otro cambio abierto. Así no se salta la regla de un cambio por sesión, que el guard sigue aplicando al entrar (`sessionDenial`).
- A5: Una carpeta perdida es la de un cambio abierto (su `state.json` en la punta de su rama no está en `done` ni en `cancelled`) cuya rama ningún worktree con carpeta existente tiene: git lista ese worktree con la carpeta borrada o ya no lo lista. Se detecta con una sola lectura de las ramas y del `.specty/changes/` de las que no tienen carpeta. Medido en Specty el 2026-11-04: 29 ramas, 21 sin carpeta, ninguna con un cambio abierto, en menos de un segundo.
  - impacto: alto
- A6: Recuperar la carpeta no decide nada sobre permisos, como crearla en `specty new`: lo puede ejecutar el agente o la persona, sin terminal de persona, y toma el bloqueo del cambio (`withChangeLock`). La recrea donde `specty new` pone hoy las carpetas (`.worktrees/<id>`), aunque antes viviera en la carpeta hermana de ADR 0018.
- A7: La recuperación limpia solo el registro muerto de esa carpeta en git, saca la rama existente sin crear otra ni moverla, copia los hooks del agente y el `go.work` como `addWorktree` y la prepara como `prepareWorktree`.
- A8: Si en el lugar del cambio hay una carpeta que git no reconoce como su worktree, Specty prueba `git worktree repair`. Si con eso no la recupera, no toca esa carpeta ni sus archivos: dice cuál es y que la persona la aparte.
- A9: `EnterWorktree` con el id de un cambio sin carpeta no la recupera dentro del hook `WorktreeCreate`, porque prepararla puede pasar del tiempo del hook. Responde que la carpeta se perdió y con qué comando se recupera; lo mismo hace `specty enter <id>`.
- A10: La UI recupera con el mismo código que el comando, como acción `POST` del servidor (con la cookie, la comprobación de origen y una acción a la vez, como las decisiones de la persona). La página de un cambio sin carpeta muestra la recuperación en lugar de sus pestañas, porque sus archivos están solo en la rama.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO una conversación de Claude Code enlazada a la carpeta de un cambio abierto ejecuta `specty next` en la carpeta principal ENTONCES la salida nombra el cambio y su carpeta, y `SIGUIENTE:` le pide volver allí (`EnterWorktree` con `name: "<id>"`) y no crear un cambio.
- AC2: CUANDO una conversación cuya herramienta dice su id ejecuta `specty new` y no está enlazada a otro cambio abierto ENTONCES queda enlazada a la carpeta del cambio nuevo, aunque aún no haya entrado en ella.
- AC3: CUANDO Claude Code reanuda una sesión (`SessionStart` con `source: "resume"`) ENTONCES el guard le devuelve la tarjeta de `specty next`; `init` escribe ese evento y `doctor` avisa cuando falta.
- AC4: CUANDO se ejecuta `specty next` sin cambio activo y sin enlace a un cambio abierto, y hay cambios abiertos que esperan al agente sin una conversación viva en su carpeta ENTONCES la salida los lista, cada uno con cómo retomarlo, antes de proponer `specty new`.
- AC5: CUANDO la conversación enlazada a la carpeta de un cambio abierto dio su último paso en otra carpeta ENTONCES `specty status` lo dice en la línea de ese cambio, con cómo retomarlo.
- AC6: CUANDO la carpeta de un cambio abierto ya no existe y su rama sigue ENTONCES `specty status`, y `specty next` en cualquier otra carpeta, lo listan como cambio sin carpeta con `specty restore <id>`.
- AC7: CUANDO el agente o la persona ejecutan `specty restore <id>` ENTONCES Specty recrea la carpeta del cambio desde su rama en `.worktrees/<id>`, con los hooks del agente copiados y preparada; la salida dice que lo no confirmado en la rama no vuelve y cómo entrar.
- AC8: CUANDO en el lugar del cambio hay una carpeta que git no reconoce como su worktree y `git worktree repair` no la recupera ENTONCES `specty restore` no la toca, falla y dice qué carpeta debe apartar la persona.
- AC9: CUANDO Claude Code pide `EnterWorktree` con el id de un cambio abierto sin carpeta, o el agente ejecuta `specty enter <id>` ENTONCES no se crea otra worktree: la respuesta dice que la carpeta se perdió y que se recupera con `specty restore <id>`.
- AC10: CUANDO una conversación está enlazada a la carpeta perdida de un cambio abierto y ejecuta `specty next` en la carpeta principal ENTONCES `SIGUIENTE:` le pide `specty restore <id>` y volver a la carpeta.
- AC11: CUANDO la UI lista los cambios y uno abierto no tiene carpeta ENTONCES aparece con la marca «Sin carpeta», y su página muestra qué pasó, el botón «Recuperar carpeta» y el comando de terminal equivalente.
- AC12: CUANDO la persona pulsa «Recuperar carpeta» ENTONCES el servidor recupera la carpeta como `specty restore` y la UI muestra el cambio con su carpeta, o el motivo por el que no pudo.
- AC13: CUANDO un cambio abierto espera al agente y ninguna conversación trabaja en su carpeta (salió de ella o el cambio quedó huérfano) ENTONCES la UI lo marca y muestra, para copiar, cómo retomarlo con cada agente.

## Diseño

- Core (`cards/`): `nextCard` sin cambio activo recibe el cambio de la conversación (con su carpeta, o perdida), los cambios sin conversación y los cambios sin carpeta. La línea de `status` lleva «salió de su carpeta» y «sin carpeta». La salida de `specty restore` y la respuesta de `enter` y `WorktreeCreate` para una carpeta perdida, en español y en inglés. La API pública de core añade lo que use el CLI.
- CLI: un módulo de flujo para las carpetas perdidas (detectarlas desde las ramas y recuperarlas, reutilizando `addWorktree` y `prepareWorktree`); `commands/restore.ts`, registrado como comando que el agente puede ejecutar. Cambian `next.ts`, `status.ts`, `new.ts` (escribe el enlace), `enter.ts`, `enforce/worktree-hooks.ts` (`create` ante un cambio sin carpeta) y `agents/claude-code.ts` (`SessionStart` con `resume`, y su aviso de `doctor`).
- Servidor y UI: los registros de cambios incluyen los cambios sin carpeta (título y fase leídos de la rama) y la marca de cambio sin conversación en su carpeta; `POST /api/changes/<id>/restore` ejecuta la recuperación; la fila del buzón y la página del cambio muestran la marca, el botón y las instrucciones para copiar.
- Docs: ARCHITECTURE §6 (el comando nuevo), §9 (carpetas perdidas y su recuperación) y §15 (la acción del servidor); formats.md §1 (quién escribe `sessions/`) y la salida de `status --json` si cambia.

## Cortes

- C1: La conversación que sale de su carpeta vuelve a ella
  - ac: AC1, AC2, AC3, AC4, AC5
- C2: La carpeta perdida de un cambio abierto se ve y se recupera desde la terminal
  - ac: AC6, AC7, AC8, AC9, AC10
  - depends: C1
- C3: La UI muestra los cambios sin carpeta o sin conversación y recupera la carpeta
  - ac: AC11, AC12, AC13
  - depends: C2

## Riesgos

- R1: Leer las ramas en cada `status`, `next` y sondeo de la UI lo hace más lento en repositorios con muchas ramas. Mitigación: un solo proceso de git para todas (A5), solo sobre las ramas sin carpeta; la UI lo recalcula solo cuando cambian las referencias.
- R2: Dos sesiones recuperan la misma carpeta a la vez. Mitigación: la recuperación toma el bloqueo del cambio (A6).
- R3: El aviso de `doctor` por el `resume` que falta salta en todas las instalaciones anteriores. Mitigación: el aviso dice que basta repetir `specty init`, como los avisos de eventos anteriores.
- R4: Una conversación que salió de su carpeta a propósito recibe la indicación de volver. Mitigación: es la regla de un cambio por sesión que el guard ya aplica; la salida dice también cómo abrir otra sesión para otra cosa.

## Cierre

### Resumen

Una sesión de agente ya no pierde la carpeta de su cambio sin salida. La conversación que vuelve a la carpeta principal (al reanudarla, tras compactar o tras un `cd`) oye en `next` y en su `SessionStart` qué cambio lleva y cómo volver. `specty new` la enlaza a la carpeta nueva. Claude Code da la tarjeta también al reanudar, y `doctor` avisa a las instalaciones sin `resume`. `status` marca el cambio cuya conversación salió de su carpeta. Una carpeta borrada o podada se ve en `status`, en `next` y en la UI, y se recupera desde su rama con `specty restore <id>` o con «Recuperar carpeta». `EnterWorktree` y `specty enter` ya no crean otra worktree ni enlazan a una carpeta que no existe. La UI marca además los cambios que nadie lleva y dice cómo retomarlos con cada agente.

### Desviaciones

- Los tres cortes salían grandes y cada uno se repartió en dos cambios. C1: `20261104-conversacion-vuelve-a-su-carpeta`, más `20261104-reanudar-con-tarjeta` (AC3) y `20261104-status-fuera-de-su-carpeta` (AC5). C2: `20261104-carpeta-perdida-se-recupera`, más `20261104-carpeta-perdida-en-next-y-enter` (AC6 en `next`, AC9 y AC10). C3: `20261104-ui-carpeta-perdida`, más `20261104-ui-retomar-cambios` (AC13).
- El `.claude/settings.json` de este repositorio sigue sin `resume`, porque el guard no deja editarlo a mano (P72).

### Decisiones

- Un cambio sin carpeta es cualquier cambio abierto cuya rama marcada no tiene una carpeta existente; en el modo sin worktrees eso incluye una rama sin sacar (P77).
- `restore` no decide nada sobre permisos: lo ejecutan el agente o la persona, y la UI lo ofrece como acción del servidor.

### Pendientes

- Ninguno
