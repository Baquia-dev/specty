---
kind: epic
---

# Interruptor para encender y apagar el flujo de Specty desde la UI

## Objetivo

La persona enciende y apaga Specty desde la UI con un interruptor en la cabecera. Apagado, el agente trabaja libre: nada de lo que hace pasa por Specty (ni el guard, ni los hooks de git, ni el fin de turno, y `specty next` le dice que trabaje sin el flujo). Cada apagado y cada encendido queda en un registro con quién lo hizo y cuándo, que la UI muestra. Como un solo cambio salía demasiado grande (16 archivos de código, toca core, cli y ui), va en dos cortes: primero lo que hace Specty apagado y su registro, y después el interruptor de la UI que lo cambia.

## Fuera de alcance

- Un comando de terminal para encender o apagar Specty: solo la UI de la persona lo cambia.
- Apagar Specty para el equipo o en la CI: `specty ci` y los clones de otras personas siguen igual.
- Documentar después lo que se hizo con Specty apagado: sus commits quedan como cualquier commit hecho sin Specty, y `specty audit` y `specty ci` los ven así.
- Mostrar el estado del interruptor en `specty status`, `specty doctor`, la extensión de VS Code o la MCP App.
- Deshacer en el guard un apagado que haga un comando de shell sin nombrar el registro (ver R1).

## Supuestos

- A1: El interruptor vale para el clon y todas sus worktrees, como el modo delegado, y vive en el almacenamiento local de git (`.git/common/specty/`), sin versionar; su registro también es local, de solo añadir, y la UI es donde se consulta.
  - impacto: alto
- A2: «Nada pasa por Specty» significa que el guard deja pasar todas las acciones del agente sin juzgarlas ni anotar sus pasos, que `pre-commit` no bloquea commits, que el fin de turno no revisa nada y que `specty next` le dice al agente que trabaje sin el flujo. Los hooks de carpetas de Claude Code (`WorktreeCreate` y `WorktreeRemove`) siguen creando y quitando carpetas, porque sin ellos `EnterWorktree` no funcionaría.
  - impacto: alto
- A3: Los comandos de Specty que alguien ejecute a propósito con Specty apagado siguen funcionando (la persona puede aprobar o aceptar desde la UI), y sus commits llevan sus trailers como siempre. Los cambios abiertos se quedan como están y siguen al volver a encenderlo.
- A4: Quien apaga o enciende es el `user.name` de git del servidor de la UI, como en el modo delegado; apagarlo pide confirmación en un diálogo que explica el efecto, y encenderlo también pasa por un diálogo, que muestra desde cuándo estaba apagado.

## Criterios de aceptación

- AC1: CUANDO Specty está apagado ENTONCES el guard de cualquier agente deja pasar todas sus acciones, antes y después, sin rechazos, avisos ni tarjetas y sin anotar sus pasos en `activity/`; los hooks de carpetas de Claude Code siguen creando y quitando carpetas.
- AC2: CUANDO Specty está apagado ENTONCES `pre-commit` deja pasar un commit de código gobernado que encendido bloquearía, y el fin de turno del agente (`agent-stop` y `memory-stop`) le deja terminar sin revisar nada; un commit de Specty con su recibo sigue llevando su trailer `Specty-Change`.
- AC3: CUANDO Specty está apagado ENTONCES `specty next` dice que está apagado, desde cuándo y quién lo apagó, que nada de lo que haga el agente pasa por Specty, y como SIGUIENTE que haga lo que pide el usuario sin spec ni comandos de Specty.
- AC4: CUANDO la persona apaga o enciende Specty desde la UI ENTONCES se añade al registro `.git/common/specty/switch.jsonl` una línea `{ "on", "by", "at" }` con el estado nuevo, quién y cuándo, y `GET /api/switch` da el estado actual y el registro, el más reciente primero; pedir el estado que ya tiene no añade ninguna línea.
- AC5: CUANDO `POST /api/switch` llega a un servidor de solo lectura, sin el token de la sesión o con un cuerpo sin `on` booleano ENTONCES se rechaza y el registro no cambia.
- AC6: CUANDO el agente ejecuta un comando de shell que nombra el registro (`common/specty/switch.jsonl`) ENTONCES el guard lo rechaza con la regla `bypass`, como hace con el interruptor del modo delegado.
- AC7: CUANDO la persona vuelve a encender Specty ENTONCES el guard, `pre-commit` y `specty next` vuelven a actuar como antes, y los cambios abiertos siguen en la fase en que estaban.
- AC8: CUANDO la persona abre la UI ENTONCES la cabecera muestra el interruptor «Specty», encendido o apagado; al pulsarlo, un diálogo explica qué pasa al apagarlo o al encenderlo, muestra el registro (estado, quién y cuándo) y lo cambia al confirmar; en un servidor de solo lectura el interruptor está desactivado y dice por qué.

## Diseño

- **Registro** (`.git/common/specty/switch.jsonl`, formats §1): una línea JSON por cada cambio de estado, `{ "on": boolean, "by": string, "at": ISO }`. El estado es el de la última línea válida; sin archivo o sin ninguna línea válida, Specty está encendido, así que borrar el registro solo puede encenderlo. Se escribe como `delegated.json`: permisos `0o666`, se añade la línea y vuelve a `0o444`. Solo se añade una línea si el estado cambia.
- **`packages/cli/src/store/switch.ts`** (nuevo): `readSwitch(git)` da `{ on, by?, at? }`, `switchLog(git)` las entradas, de la más reciente a la más antigua, y `turnSwitch(git, on, by, at)` añade la línea si cambia el estado.
- **Guard** (`enforce/guard.ts`): los eventos `worktree` se responden como hoy, antes de mirar el interruptor. Después de `guardSession`, si Specty está apagado responde como fuera de un repositorio de Specty (`agent.reply(ALLOW, …)`), sin `noted`, sin fotos de shell y sin tarjetas.
- **Hooks**: en `enforce/entry.ts`, `agent-stop` y `memory-stop` apagados responden como fuera de Specty (`stopPass`). En `enforce/hook.ts`, `pre-commit` sigue atendiendo primero los recibos de Specty (sus commits conservan la marca y los trailers) y, si está apagado, deja pasar el resto. `prepare-commit-msg` no cambia: solo actúa con la marca de un recibo o de una edición manual.
- **`next`**: `NextView` (`core/src/cards/next.ts`) gana `off?: { by?, at? }`, y `nextCard` da con él la tarjeta de Specty apagado antes que ninguna otra; `commands/next.ts` lo lee del registro al empezar.
- **Regla `bypass`**: `SENSITIVE_SPECTY` (`core/src/guard/shell.ts`) también reconoce `common/specty/switch.jsonl`, como `common/specty/delegated.json`.
- **Servidor** (`server/api.ts`): `GET /api/switch` da `{ on, by?, at?, log: [{ on, by, at }] }`; `POST /api/switch` con `{ on: boolean }` pasa por las mismas comprobaciones que las demás acciones (servidor con acciones, origen y token) y por `context.serial`, escribe con el `user.name` de git (o `unknown`) y responde con la vista nueva. `fingerprint` (`server/events.ts`) incluye el tamaño y la hora del registro, para que las demás pestañas se actualicen.
- **UI**: `SpectyData` gana `specty()` (nada si la fuente no lo sabe) y `setSpecty(on)` (rechazado en la fuente de solo lectura); `ServerData` las pide a `/api/switch` con su comprobación en `server-answers.ts`, y `FixtureData` guarda un estado de ejemplo con un registro. `app/specty-switch.ts` (nuevo, como `app/delegation.ts`): el interruptor de la cabecera (`role="switch"`, `aria-checked`; en el teléfono, sin el texto), los diálogos para apagar (el efecto y el registro) y encender (desde cuándo, quién y el registro), y el comando de la paleta «Encender o apagar Specty…». En solo lectura se desactiva con el motivo de `Decisions.blocked()`. Si la fuente no sabe del interruptor, no aparece.
- **Documentación**: `switch.jsonl` en `docs/formats.md` §1 (C1), qué deja de actuar con Specty apagado en `docs/ARCHITECTURE.md` (C1) y el interruptor del armazón en `docs/ui.md` (C2).

## Cortes

- C1: Con Specty apagado, el agente trabaja sin el flujo y el registro guarda cada cambio de estado
  - ac: AC1, AC2, AC3, AC6, AC7
- C2: La persona apaga y enciende Specty desde la cabecera de la UI y ve su registro
  - ac: AC4, AC5, AC8
  - depends: C1

## Riesgos

- R1: Un comando de shell que apaga Specty sin nombrar el registro (un script que calcula la ruta) escapa a la regla `bypass`. Mitigación: el archivo queda en solo lectura, el registro muestra cada cambio con su hora y la UI lo enseña; el guard no lo deshace después porque no distingue ese comando de la persona que apaga Specty desde la UI mientras el comando corre.
- R2: El servidor de la UI acepta `POST /api/switch` de quien tenga su token, como `/api/delegation`. Mitigación: las mismas comprobaciones de origen, token y servidor con acciones que el resto de decisiones de la persona.
- R3: El guard lee el registro en cada acción del agente. Mitigación: es un archivo local pequeño, y solo se lee su última línea válida.

## Cierre

### Resumen

La persona enciende y apaga Specty desde el interruptor «Specty» de la cabecera de la UI, y cada cambio de estado queda en `.git/common/specty/switch.jsonl` con quién y cuándo, en dos cortes cerrados en main. C1 (9c0581a): con Specty apagado, el guard responde a cualquier agente como fuera de Specty (salvo los hooks de carpetas de Claude Code), `pre-commit` solo atiende los recibos de Specty, el fin de turno deja terminar y `specty next` da la tarjeta de Specty apagado; al encenderlo todo vuelve a actuar y los cambios abiertos siguen donde estaban; la regla `bypass` rechaza los comandos que nombran el registro. C2 (43f2585): `GET` y `POST /api/switch` en el servidor, con las comprobaciones de las demás decisiones, y el interruptor de la cabecera con sus diálogos, el registro y el comando de la paleta; en solo lectura está desactivado con el motivo.

### Desviaciones

- La épica nació como un cambio estándar que `propose` rechazó por XL (16 archivos de código). Se convirtió en épica en su sitio, sin cancelarlo, después de que el usuario pidiera arreglar antes P354 (`20261108-un-borrador-demasiado-grande-pasa-a-epica-sin`, ab0118a).
- Dos cortes en lugar de los tres que proponía el borrador (núcleo, API y UI): la API y la UI van juntas en C2, para que el corte sea vertical.
- C1 se rehízo tras cancelar un primer intento cuya verificación encadenaba con `&&` los tests de dos paquetes (P190), y su test de AC6 se corrigió con un desbloqueo (S1) que decidió la persona.
- C2 rechaza `setSpecty` en la fuente de solo lectura con un motivo propio, `NO_SWITCH`, y no con `READ_ONLY`.

### Decisiones

- C2 esperó a C1 porque usa su registro (`store/switch.ts`).
- Los textos de los diálogos van en la UI con `t()`, como los del modo delegado: el servidor solo da el estado y el registro.

### Pendientes

- `enforce/guard.ts` (320 líneas de código) sigue por encima del aviso de 300 (P218).
- `ui/src/data/records.ts` (319) y `ui/src/data/server.ts` (304) pasan del aviso de 300 (P379; P378 la repite y está propuesta para descartar).
