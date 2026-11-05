---
kind: standard
---

# El guard pide specty enter y --subagent a los subagentes de Claude Code

## Objetivo

Desde C1, un subagente de Claude Code entra con `specty enter` en la carpeta de un cambio y queda atado a ella, pero nada le impide usar `EnterWorktree`, que podría mover a la sesión que lo lanzó, ni ejecutar `specty new` sin `--subagent`, que ataría a esa sesión al cambio nuevo. Con este cambio, el guard bloquea las dos cosas a un subagente y le dice qué hacer: entrar con `specty enter <id>` o repetir `new` con `--subagent`. Son las redes de seguridad que faltan antes de repartir en serio los cortes de una épica entre subagentes (P81).

## Fuera de alcance

- `ExitWorktree` desde un subagente: no pasa por el guard.
- Reescribir la acción del subagente en lugar de bloquearla: en Claude Code, reescribir exige responder «allow», que saltaría los permisos de la persona (C1).
- Las demás herramientas: sus eventos no traen `agent_id`, y sus subagentes van en sus propios cortes de la épica (C6, C7 y C8).
- Comprobarlo otra vez con Claude Code real: el guard decide con los campos del evento que C1 ya comprobó (su AC7).
- La tarjeta de la épica que reparte los cortes (C2).

## Supuestos

- A1: Solo los eventos de un subagente de Claude Code traen `agent_id`; los de la sesión principal y los de las demás herramientas no lo traen (comprobado con Claude Code real en C1).
  - impacto: alto
- A2: `EnterWorktree` llamado desde un subagente cambiaría la carpeta de la sesión que lo lanzó (no está documentado). Bloquearlo no depende de ello: el subagente entra igual con `specty enter`.
- A3: La carpeta de un cambio es la que le preparó `specty new`, con el id del cambio como nombre (`.worktrees/<id>`, o la de antes de ADR 0018), así que un `path` que no es una de esas carpetas no nombra ningún cambio.
- A4: En los comandos de un subagente, `CLAUDE_CODE_SESSION_ID` es el de la sesión principal (comprobado en C1), así que `specty new` sin `--subagent` ataría a esa sesión al cambio nuevo.
- A5: `--subagent` vale en cualquier posición tras `new`, como lo lee commander; dentro de un argumento entre comillas, como el título o `--request`, no cuenta.

## Criterios de aceptación

- AC1: CUANDO un subagente de Claude Code usa `EnterWorktree` con `name` ENTONCES el guard lo bloquea sin atar a nadie a ninguna carpeta, y su SIGUIENTE pide `specty enter <name>`.
- AC2: CUANDO un subagente de Claude Code usa `EnterWorktree` con `path` ENTONCES el guard lo bloquea, y su SIGUIENTE pide `specty enter` con el id del cambio cuya carpeta nombra ese `path`, o con `<id>` por rellenar si no nombra la de ningún cambio.
- AC3: CUANDO un subagente de Claude Code ejecuta un comando con un `specty new` sin `--subagent` ENTONCES el guard lo bloquea y su SIGUIENTE pide volver a ejecutarlo con `--subagent`; si cada `specty new` del comando lo lleva, el comando pasa.
- AC4: CUANDO la sesión principal de Claude Code, cuyos eventos no traen `agent_id`, usa `EnterWorktree` o ejecuta `specty new` sin `--subagent` ENTONCES el guard la juzga como antes: entra en la carpeta y queda atada a ella, y el comando pasa.
- AC5: CUANDO se analiza un comando de shell ENTONCES su análisis trae un elemento por cada `specty new`, en orden, que dice si lleva `--subagent`, y ninguno para los demás comandos.

## Diseño

- `SpectyCalls` gana `news`: un `{ subagent }` por cada `specty new`, que dice si sus argumentos llevan `--subagent` (`guard/specty-calls.ts`). `analyzeShell` los junta en orden, como `enters` y `resolves`.
- Los textos, en es y en, van junto a `nativeEnterDenial` en `core/src/guard/worktrees.ts`: `subagentEnterDenial(id, lang, command)`, con `<id>` cuando el evento no nombra ningún cambio, y `subagentNewDenial(lang, command)`. Se exportan en `core/src/index.ts`.
- `cli/src/enforce/subagents.ts` tiene `subagentDenial`: lo que el guard le pide a un subagente, solo para un evento con `agent_id` (`subagentOf`). Con `EnterWorktree`, deniega con el id de su `name`, o con el del cambio cuya carpeta preparada es su `path` (`namedWorktree` con el nombre de esa carpeta). Con un comando de shell que tiene un `specty new` sin `--subagent`, deniega con el otro texto. La regla es `session`.
- `guard.ts` lo consulta en `beforeAction` antes de resolver y juzgar la acción: lo que deniega sale tal cual, sin atar a nadie, sin frentes y sin foto del árbol.
- Documentos: ARCHITECTURE §10 («Subagentes») y la fila de `new` en §6.

## Archivos

- modificar packages/core/src/guard/specty-calls.ts — `news`: cada `specty new` y si lleva `--subagent`
- modificar packages/core/src/guard/shell.ts — `news` en el análisis vacío y al juntar los segmentos
- modificar packages/core/test/guard/shell.test.ts — los casos de `news`
- modificar packages/core/src/guard/worktrees.ts — los textos de las dos denegaciones, en es y en
- modificar packages/core/src/index.ts — exporta esos textos
- crear packages/cli/src/enforce/subagents.ts — lo que el guard le pide a un subagente
- modificar packages/cli/src/enforce/guard.ts — lo consulta antes de juzgar la acción
- modificar packages/cli/test/subagents.test.ts — el guard ante `EnterWorktree` y `specty new` de un subagente y de la sesión principal

## Tareas

- [x] T1: El análisis de un comando dice cada `specty new` y si lleva `--subagent`
  - files: packages/core/src/guard/specty-calls.ts, packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
- [x] T2: El guard pide `specty enter` y `--subagent` a un subagente de Claude Code
  - files: packages/core/src/guard/worktrees.ts, packages/core/src/index.ts, packages/cli/src/enforce/subagents.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/subagents.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/subagents.test.ts && pnpm typecheck

## Riesgos

- R1: Otros cortes de la épica tocan a la vez `guard.ts` o el párrafo «Subagentes» de ARCHITECTURE §10. Mitigación: este cambio solo añade un módulo y una llamada en `beforeAction`, y los conflictos al incorporar main van a `specty integrate`.

## Cierre

### Resumen

- El guard bloquea `EnterWorktree` a un subagente de Claude Code, porque llevaría a la carpeta a la sesión que lo lanzó. Su SIGUIENTE pide `specty enter <id>`: el id es su `name`, o el del cambio cuya carpeta preparada nombra su `path`, y si no nombra ninguno queda `<id>` por rellenar.
- También le bloquea un comando con un `specty new` sin `--subagent`, que ataría a la sesión principal al cambio nuevo, y su SIGUIENTE pide repetirlo con `--subagent`.
- `analyzeShell` dice cada `specty new` y si lleva `--subagent` (`news`). `enforce/subagents.ts` lo consulta antes de juzgar la acción, solo para eventos con `agent_id`: la sesión principal y las demás herramientas se juzgan como antes.
- ARCHITECTURE §10 («Subagentes») y la fila de `new` en §6 lo cuentan.

### Desviaciones (respecto al plan)

- Ninguna en el código ni en las tareas. La verificación completa de `accept` avisó de que los tests ejecutan el 73 % de las líneas que añade el cambio: los textos nuevos de `core/src/guard/worktrees.ts` solo los ejecutan los tests del CLI, que no cuentan en la cobertura de core (P90).

### Decisiones

- El guard bloquea la acción del subagente y no la reescribe, como en C1: reescribir exige responder «allow», que saltaría los permisos de la persona.
- La red de `new` vale para cualquier evento con `agent_id`, no solo para los de Claude Code: hoy solo los envía Claude Code, y para otra herramienta que lo enviara, `--subagent` también sería lo seguro.
- Si `EnterWorktree` trae `name` y `path`, el SIGUIENTE usa el `name`.
- Al crear el cambio, el freno de duplicados señaló tres cambios abiertos: los cortes de OpenCode (C7) y de Cursor (C8) y la complejidad del CLI y de core. Son otro trabajo, y la petición de la persona era seguir con cada P, así que se creó con `--distinct-from`.

### Pendientes

- P90: los textos `subagentEnterDenial` y `subagentNewDenial` no tienen test en core, y su versión en inglés no la prueba ningún test.
