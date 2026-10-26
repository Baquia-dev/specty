---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C6
---

# OpenCode comprueba el fin de turno, trae la tarjeta tras compactar y no lee lo excluido

## Objetivo

OpenCode tiene el guard, pero le faltan tres cosas que Claude Code tiene:
- **Tarjeta tras compactar:** el plugin de Specty la añade a la conversación en cuanto OpenCode termina de compactar, como mensaje que no pide respuesta.
- **Fin de turno:** cuando la sesión queda inactiva, el plugin ejecuta `specty hook agent-stop opencode`, y si `specty check --changed` falla, le manda el informe al agente para que siga. Como en los demás agentes, lo activa `specty check --install`.
- **Exclusión:** `check --install` añade a `opencode.json` reglas `permission.read` que deniegan leer las rutas de `checks.exclude` y `scope.generated`.

En la tabla de capacidades, las tres pasan a «sí» en OpenCode.

## Fuera de alcance

- La prueba de OpenCode con un modelo simulado, que es C7.
- Que `glob`, `grep` y `list` dejen de ver esas rutas: los permisos de OpenCode solo las filtran para `read`.
- Tocar los permisos de la persona en `opencode.json` más allá de añadir esas denegaciones.

## Supuestos

- A1: Comprobado el 2026-10-26 con OpenCode 1.19.4 y un modelo simulado: el plugin recibe `session.compacted` y `session.idle` con `sessionID` en su hook `event`; un `client.session.prompt` con `noReply: true` tras `session.compacted` queda en la conversación, y el modelo lo ve en la siguiente petición; y un `client.session.prompt` tras `session.idle` hace seguir al agente cuando OpenCode corre como servidor (la interfaz), aunque `opencode run` termina antes de que llegue.
  - impacto: alto
- A2: También comprobado: `permission.read` compara sus patrones con la ruta relativa al proyecto y deniega la lectura que coincide. Un patrón `**/x/**` no coincide con `x/…` en la raíz, así que también se escribe sin `**/` delante.
  - impacto: alto
- A3: En OpenCode 2, según su documentación, la compactación es un hook (`ctx.session.hook("compaction")`), el contexto de cada llamada al modelo es otro (`"context"`, que deja añadir partes al sistema), y `ctx.session.prompt` envía un mensaje a la sesión. Sus nombres de evento no están documentados: se usa `session.idle`, como en la 1, y nada de esto se ha podido probar con OpenCode 2.
- A4: El fin de turno sigue la regla de `stop_hook_active`: un turno que el plugin ya devolvió puede terminar; el plugin lo recuerda por sesión mientras corre.

## Criterios de aceptación

- AC1: CUANDO OpenCode 1 avisa de `session.compacted` en un repositorio con Specty ENTONCES el plugin añade a esa sesión, sin pedir respuesta, lo que imprime `specty next`; y en OpenCode 2, la siguiente llamada al modelo tras la compactación lleva esa tarjeta en el sistema.
- AC2: CUANDO `specty check --install` corre en un repositorio con el plugin de Specty ENTONCES le activa el fin de turno, y `init` lo conserva al volver a escribir el plugin.
- AC3: CUANDO la sesión de OpenCode queda inactiva con el fin de turno activo y `specty check --changed` falla ENTONCES el plugin manda el informe a esa sesión, y si vuelve a quedar inactiva tras ese aviso, la deja terminar.
- AC4: CUANDO `specty check --install` corre en un repositorio que usa OpenCode ENTONCES `opencode.json` (o `opencode.jsonc` si es el que hay) deniega en `permission.read` las rutas de `checks.exclude` y `scope.generated`, y conserva lo que la persona tenía.
- AC5: CUANDO falta en el plugin la tarjeta tras compactar ENTONCES `doctor` lo avisa.
- AC6: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES la tarjeta tras compactar, el fin de turno y la exclusión de OpenCode son «sí».

## Diseño

- El contrato del fin de turno cambia `files` y `hook` por `plan(root, files, timeout)`, que deja en el plan de `check --install` lo que hay que escribir. Claude Code, Codex y Cursor lo hacen con su JSON de siempre (`jsonStop`, en `adapter.ts`, con el prefijo del guard que hoy busca `install-agents.ts`). OpenCode reescribe su plugin con el fin de turno activo.
- El plugin (`install/opencode.ts`) lee la salida del guard, no solo su stderr.
  - Tarjeta: OpenCode 1 la pide al guard con un `SessionStart` (`source: compact`) en `session.compacted`, y OpenCode 2 la marca en `compaction` y la añade en el siguiente `context`.
  - Fin de turno: con `STOP` activo, `session.idle` ejecuta `specty hook agent-stop opencode` con `stop_hook_active` y manda la razón con `prompt`.
- `agents/opencode.ts`: `SessionStart` con `compact` es `compact`, su tarjeta es `textCard`, su fin de turno es el de Claude Code con el `plan` del plugin, y `doctor` mira `session.compacted` en el plugin.
- `check/install-ignores.ts` añade OpenCode: las denegaciones en `permission.read`, al final, porque gana la última regla que coincide.

## Archivos

- modificar packages/cli/src/agents/adapter.ts — el fin de turno planifica su hook (`plan`) y `jsonStop`
- modificar packages/cli/src/agents/cursor.ts — su fin de turno con `jsonStop`
- modificar packages/cli/src/check/install-agents.ts — recorre los `plan` de cada agente
- modificar packages/cli/src/install/opencode.ts — el plugin trae la tarjeta y, si está activo, comprueba el fin de turno
- modificar packages/cli/src/agents/opencode.ts — su tarjeta, su fin de turno y su comprobación en `doctor`
- modificar packages/core/src/cards/doctor.ts — la línea de la tarjeta de OpenCode
- modificar packages/cli/src/check/install-ignores.ts — las denegaciones de lectura de OpenCode
- modificar packages/core/src/capabilities.ts — la tarjeta, el fin de turno y la exclusión de OpenCode pasan a «sí»
- modificar packages/cli/test/opencode.test.ts — la tarjeta, el fin de turno y `doctor` (AC1, AC3, AC5)
- modificar packages/cli/test/check-agent-stop.test.ts — `check --install` activa el fin de turno del plugin y `init` lo conserva (AC2)
- modificar packages/cli/test/check-ignores.test.ts — las denegaciones de OpenCode (AC4)
- modificar packages/cli/test/agents.test.ts — OpenCode reconoce su `SessionStart` y tiene tarjeta
- modificar packages/core/test/capabilities.test.ts — la fila de OpenCode cambia (AC6)
- modificar docs/ARCHITECTURE.md — la tarjeta (§7), el plugin, el fin de turno y la exclusión de OpenCode (§10) y la tabla
- modificar docs/formats.md — lo que `check --install` escribe para OpenCode

## Tareas

- [x] T1: El fin de turno de cada agente planifica su propio hook
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/check/install-agents.ts, packages/cli/test/check-agent-stop.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/check-install.test.ts test/agents.test.ts
  - type: refactor
- [x] T2: El plugin de OpenCode trae la tarjeta tras compactar y comprueba el fin de turno
  - files: packages/cli/src/install/opencode.ts, packages/cli/src/agents/opencode.ts, packages/core/src/cards/doctor.ts, packages/cli/test/opencode.test.ts, packages/cli/test/check-agent-stop.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/check-agent-stop.test.ts test/agents.test.ts
- [ ] T3: OpenCode deja de leer lo excluido
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/test/check-ignores.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-ignores.test.ts test/check-install.test.ts
- [ ] T4: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: OpenCode 2 cambia el nombre del evento de inactividad o la forma de `prompt`, y su fin de turno no actúa. Mitigación: todo el código del plugin para OpenCode 2 va en `try` y nunca bloquea; la tabla anota que se comprobó con OpenCode 1.19.4.
- R2: Un patrón de exclusión con otra sintaxis que la de `.gitignore` deniega de más o de menos. Mitigación: son los mismos patrones que ya van a `.cursorignore` y a `Read(...)` de Claude Code, y `check --install` los enseña en su diff antes de escribirlos.
