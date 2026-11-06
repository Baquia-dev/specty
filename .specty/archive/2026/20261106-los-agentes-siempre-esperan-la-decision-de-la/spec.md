---
kind: epic
---

# Los agentes siempre esperan la decisión de la persona con specty wait

## Objetivo

Hoy cada agente decide cómo esperar la decisión de la persona. Unos ejecutan `specty wait` en primer plano y su terminal lo corta a los pocos minutos; otros terminan el turno, esperan con `sleep` o no lo repiten cuando se agota. Con esta épica, `specty wait` es la regla para todos los agentes, en los textos, en el guard y en el fin de turno, y deja una marca mientras espera. El aviso de la UI cuando nadie retoma una decisión de la persona es el cambio `20261106-la-ui-avisa-cuando-ningun-agente-espera-su`, que va después de esta épica y lee esa marca.

## Fuera de alcance

- El aviso de la UI cuando nadie retoma una decisión: es el cambio `20261106-la-ui-avisa-cuando-ningun-agente-espera-su`.
- Despertar al agente o escribir en su conversación desde la UI o desde Specty.
- Que el agente espere en modo delegado lo que `SIGUIENTE:` le pide ejecutar a él mismo.
- Los subagentes de una épica: devuelven el turno a la sesión principal, que es la que espera.
- Cambiar la salida de la terminal de la persona al aprobar, aceptar o cerrar.
- La verificación completa que lanza «Verificar» en la UI: no le pasa el turno al agente.

## Supuestos

- A1: Claude Code puede dejar `specty wait` en segundo plano (`run_in_background: true`) sin límite de tiempo y avisa al agente cuando termina, sin gastar llamadas al modelo mientras espera. Las demás herramientas (Codex, Cursor, OpenCode, Gemini CLI, Antigravity y Devin) cortan un comando largo en primer plano a los pocos minutos. Para ellas, `wait` dura por defecto menos que ese límite y el agente lo repite al agotarse, aunque cada vuelta sea una llamada al modelo (decisión de la persona). El límite de cada herramienta se comprueba con su documentación y su versión instalada en el corte que la toca.
  - impacto: alto
- A2: Un cambio espera a la persona cuando su fase es de la persona o tiene solicitudes de alcance pendientes, como lo calcula hoy `wait` (`isWaitingForHuman`). La red de fin de turno y el freno del guard usan esa misma regla.
  - impacto: alto
- A3: La red de fin de turno devuelve al agente una vez por turno (`stop_hook_active` en Claude Code y Codex, la cuenta por conversación en las demás), como la de `check --changed`. Así no hay bucles, y un agente que insiste puede terminar.
  - impacto: medio
- A4: `init` instala el fin de turno de cada agente que lo tiene aunque la persona no haya ejecutado `check --install`. El `check --changed` al final del turno sigue siendo solo de quien lo activó con `check --install`, y `doctor` avisa si falta el hook en una instalación antigua.
  - impacto: alto
- A5: Mientras el cambio de su carpeta espera a la persona, el guard rechaza los comandos de shell que esperan con `sleep` y pide `specty wait`. No frena `status` ni `next`, que dicen al agente que espere.
  - impacto: medio
- A6: La marca de `specty wait` (`.git/common/specty/waits/<id>.json`) sirve a la red de fin de turno (hay un `wait` vivo) y después a la UI (qué pasó con el último `wait`). Es la del supuesto A2 del cambio `20261106-la-ui-avisa-cuando-ningun-agente-espera-su`: `pid`, `tool`, `since`, `intervalMs`, la hora del archivo renovada en cada vuelta y `ended: { at, reason }` con `decided` o `timeout`. Una marca sin `ended` cuyo proceso ya no existe, o sin renovar en más de max(30 s, 3 × intervalo), cuenta como cortada (`stopped`).
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO una salida de Specty deja el cambio esperando a la persona (aprobar la spec o los tests, decidir el alcance, aceptar, cerrar o repetir una incorporación) ENTONCES su `SIGUIENTE:` pide ejecutar `specty wait` con la misma frase en todas y dice cómo en la herramienta del agente: en Claude Code, en segundo plano; en las demás, en primer plano, repitiéndolo cada vez que se agote.
- AC2: CUANDO `specty wait` agota su tiempo ENTONCES su salida pide volver a ejecutarlo ya y recordar a la persona la decisión pendiente, sin dejarlo a criterio del agente. CUANDO un agente lo ejecuta sin `--timeout` ENTONCES espera una hora, que todas las herramientas medidas aguantan en segundo plano o consultándolo, y en Gemini CLI, que corta un comando que pasa 300 s sin escribir nada, escribe una línea de latido al menos cada 60 s.
- AC3: CUANDO `init` escribe las reglas de AGENTS.md ENTONCES dicen que, si el cambio espera a la persona, el agente ejecuta siempre `specty wait` (en Claude Code, en segundo plano), lo repite si se agota y no espera terminando el turno, con `sleep` ni consultando `status`.
- AC4: CUANDO el agente de Claude Code ejecuta `specty wait` en primer plano ENTONCES el guard no lo deja correr así: lo pasa a segundo plano o lo rechaza y le pide ejecutarlo en segundo plano (`run_in_background: true`).
- AC5: CUANDO el cambio de la carpeta espera a la persona y el agente ejecuta un comando de shell con `sleep` ENTONCES el guard lo rechaza y le pide `specty wait`.
- AC6: CUANDO el agente termina su turno, el cambio de su carpeta espera a la persona y ningún `specty wait` de ese cambio está vivo ENTONCES su fin de turno lo devuelve a trabajar una vez con la regla. CUANDO hay un `wait` vivo, como el de Claude Code en segundo plano ENTONCES el turno termina.
- AC7: CUANDO la persona ejecuta `init` ENTONCES cada agente con fin de turno lo tiene instalado, sin `check --install`, y `check --changed` al final del turno solo corre donde `check --install` lo activó, también en las instalaciones que ya existían.
- AC10: CUANDO falta el fin de turno de un agente en una instalación anterior ENTONCES `doctor` lo dice y cómo arreglarlo.
- AC8: CUANDO `specty wait` espera a la persona ENTONCES deja una marca viva del cambio, que termina como `decided` o `timeout`, y que cuenta como cortada si su proceso muere o deja de renovarla.
- AC9: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- **C1, la regla en los textos** (core `cards/` y `agents-md.ts`): un solo texto en core para «ejecuta `specty wait`», con la forma de cada herramienta según `ctx.tool` (una tabla en `cards/wait.ts`), que usan todas las tarjetas que hoy lo piden a mano (`next`, `flow`, `acceptance`, `work`, `integration`, `testing`, `epic`). La tarjeta de tiempo agotado pide repetirlo ya y recordar a la persona la decisión.
- **C3, la marca y el aguante de `wait`** (CLI `store/waits.ts`, `commands/wait.ts`, `commands/agent-commands.ts`; core `cards/wait.ts` para la línea de latido): la marca de A6 y, en Gemini CLI, una línea de latido al menos cada 60 s. `--timeout` deja de tener un valor por defecto en commander para que `wait` tome el suyo.
- **C2, el guard** (CLI `enforce/`, `agents/`, `install/`, `check/install-agents.ts`, core `guard/`): El guard de Claude Code no deja correr `specty wait` en primer plano: lo reescribe con `run_in_background: true` si la respuesta de la herramienta lo permite sin saltarse los permisos de la persona, y si no lo rechaza pidiendo ese parámetro. Una regla del guard rechaza `sleep` mientras el cambio espera a la persona.
- **C4, el fin de turno** (CLI `enforce/agent-stop.ts`): `hook agent-stop` comprueba la regla de `wait` con `readWait` antes del `check --changed`, y dice lo mismo que `next` (en modo delegado, decidir él).
- **C5, la instalación** (CLI `agents/`, `install/`, `check/install-agents.ts`): `init` escribe `hook agent-stop <agente> --no-check` con el `stop.plan` de cada agente, y `check --install` quita la marca. Las instalaciones que ya existen siguen con su check. En OpenCode, `STOP` queda siempre puesto y `CHECK` lo enciende `check --install`.
- **C6, `doctor`**: avisa si falta el hook en los archivos de un agente instalado.

## Cortes

- C1: `specty wait` es la regla en todos los textos
  - ac: AC1, AC2, AC3, AC9
- C2: El guard no deja esperar en primer plano ni con `sleep`
  - ac: AC4, AC5, AC9
  - depends: C1, C3
- C3: `specty wait` deja su marca y aguanta en cada herramienta
  - ac: AC2, AC8, AC9
  - depends: C1
- C4: El fin de turno devuelve al agente a esperar con `specty wait`
  - ac: AC6, AC9
  - depends: C1, C3
- C5: `init` instala el fin de turno de cada agente sin `check --install`
  - ac: AC7, AC9
  - depends: C4
- C6: `doctor` avisa si falta el fin de turno de un agente
  - ac: AC10, AC9
  - depends: C5

## Riesgos

- R1: Las esperas cortas en bucle gastan una llamada al modelo por vuelta en las herramientas sin segundo plano. Cada `wait` dura lo más cerca posible del límite de su herramienta, y Claude Code no gasta nada.
- R2: El freno de `sleep` puede frenar un uso legítimo mientras el cambio espera a la persona. En esa espera el código está bloqueado y no hay nada que esperar con `sleep`, y la negativa dice qué usar.
- R3: Instalar el fin de turno sin `check --install` cambia lo que `init` escribe en proyectos que ya usan Specty. `doctor` lo dice, y el `check --changed` del fin de turno sigue apagado para quien no lo activó.
- R4: Un límite de una herramienta mal medido deja que su terminal corte `wait`. La red de fin de turno lo devuelve a esperar igual y, cuando la conversación se cierra, avisa la UI (el cambio que sigue a esta épica).

## Cierre

### Resumen

`specty wait` es ahora la regla para todos los agentes, en seis cortes cerrados en main:

- C1 (94877ac): todas las salidas que dejan el cambio esperando a la persona, y la regla de AGENTS.md, piden `specty wait` con la misma frase (`waitStep` en `cards/wait.ts`) y la forma de cada herramienta. La tarjeta de tiempo agotado pide repetirlo ya.
- C3 (ddaa472): `wait` deja su marca en `.git/common/specty/waits/<id>.json` (`readWait` en `store/waits.ts`), espera una hora por defecto y en Gemini CLI escribe un latido.
- C2 (d732c63): el guard rechaza en Claude Code un `wait` sin `run_in_background: true` y, mientras el cambio espera a la persona, cualquier `sleep`.
- C4 (23afc82): el fin de turno devuelve al agente una vez si el cambio espera a la persona y no hay un `wait` vivo.
- C5 (798f2e7): `init` instala ese fin de turno en todos los agentes con `--no-check`, y `check --install` vuelve a encender el `check --changed`.
- C6 (8020b7e): `doctor` avisa cuando falta.

### Desviaciones

- C1 salió XL al redactarse y se dividió en C1 (los textos) y C3 (la marca y el latido), en la revisión 2 de la épica.
- C2 salió XL y se dividió en C2 (el guard), C4 (el fin de turno), C5 (la instalación) y C6 (`doctor`), en la revisión 3. AC7 se partió en AC7 y AC10.
- La medida de las herramientas cambió A1: todas aguantan una hora en segundo plano o consultándolo, así que no hicieron falta esperas cortas en bucle. Solo Gemini CLI necesita el latido, porque corta un comando que pasa 300 s sin escribir.
- AC4 rechaza en vez de reescribir: en Claude Code, `updatedInput` solo vale con «allow», que se salta los permisos de la persona.
- El aviso de la UI cuando nadie retoma una decisión se quedó en su propio cambio, `20261106-la-ui-avisa-cuando-ningun-agente-espera-su`, que va después de esta épica, en lugar de ser un corte.

### Decisiones

- La persona eligió una épica y, para las herramientas sin segundo plano, esperas cortas en bucle aunque gasten llamadas al modelo.
- La marca de `wait` es un archivo por cambio, con la hora renovada en cada vuelta, como la cola del turno de verificación.
- El fin de turno instalado por `init` lleva `--no-check`, para no encender el `check --changed` a quien no lo pidió y no romper las instalaciones anteriores.

### Pendientes

- Ninguno nuevo.
