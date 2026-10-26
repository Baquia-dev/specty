---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C5
---

# Cursor trae la tarjeta tras compactar y deja hacer commits a Specty en su sandbox

## Objetivo

En Cursor faltan dos cosas que Claude Code tiene. La primera es la tarjeta de la tarea tras compactar. Cursor solo avisa antes de compactar (`preCompact`) y no deja añadir nada en ese momento, así que la tarjeta llega por un camino indirecto: el guard la deja pendiente y la añade al resultado del siguiente comando de shell, en `additional_context`. La segunda son los permisos. El sandbox de Cursor solo deja escribir en su espacio de trabajo, y en la carpeta de un cambio la carpeta común de git queda fuera, así que los commits de `task done` fallan. `init` escribe `.cursor/sandbox.json` con esa carpeta y la de las worktrees en `additionalReadwritePaths`. En la tabla de capacidades, la tarjeta de Cursor pasa a «indirecto» y sus permisos a «sí».

## Fuera de alcance

- La lista de comandos permitidos de Cursor, que vive en la carpeta del usuario (ADR 0013).
- La red dentro del sandbox: `pnpm install` al crear una worktree sigue como hoy.
- Entregar la tarjeta tras herramientas que no sean comandos de shell, porque haría correr el guard tras cada lectura.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), `preCompact` de Cursor solo observa: recibe `conversation_id`, como todos sus hooks, y solo admite `user_message`, que ve la persona. Ningún evento posterior a la compactación puede añadir contexto, salvo `postToolUse` con su `additional_context` tras el resultado de una herramienta.
  - impacto: alto
- A2: Cursor lee `.cursor/sandbox.json` del espacio de trabajo y une sus `additionalReadwritePaths`, con rutas absolutas, a las de la carpeta del usuario. Con la carpeta común de git y la de las worktrees en esa lista, un commit en la carpeta de un cambio funciona dentro del sandbox.
  - impacto: alto
- A3: `.cursor/sandbox.json` lleva rutas de la máquina, así que va excluido de git y `new` lo copia a cada worktree, como los hooks locales. Si la persona ya lo versiona, `init` no lo toca y avisa de qué añadir.
- A4: La tarjeta pendiente se guarda en la carpeta de git, una por conversación (`specty/pending/<conversación>.card`), se entrega una sola vez y caduca en un día, como las fotos de `shell/`.

## Criterios de aceptación

- AC1: CUANDO Cursor va a compactar una conversación y después termina un comando de shell en ella ENTONCES el `additional_context` de ese comando trae lo que imprime `specty next`, junto al aviso del comando si lo hay, y el siguiente comando ya no la trae.
- AC2: CUANDO llega `preCompact` ENTONCES el guard responde `{}` sin bloquear nada, también fuera de un repositorio con Specty.
- AC3: CUANDO `specty init` instala el guard de Cursor ENTONCES `.cursor/hooks.json` incluye `preCompact`, y `doctor` avisa si falta.
- AC4: CUANDO `specty init` instala el guard de Cursor ENTONCES `.cursor/sandbox.json` tiene la carpeta común de git y la de las worktrees en `additionalReadwritePaths`, conserva lo que la persona tenía, git no lo ve, `doctor` avisa si faltan y `uninstall` las quita.
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES la tarjeta tras compactar de Cursor es «indirecto», con cómo se hace, y sus permisos son «sí».

## Diseño

- `enforce/pending.ts`: lo que espera al siguiente evento de una conversación (`leavePending`, `takePending`), en `specty/pending/`, con la misma caducidad que las fotos de `shell/`. Servirá también a Antigravity, Windsurf y Gemini CLI.
- `actions.ts`: `conversationOf(event)` lee `session_id` o `conversation_id`, con el mismo filtro de nombre de archivo que `toolUseId`.
- El contrato gana el tipo de evento `compacting` (la herramienta va a compactar y no deja añadir nada), y `reply` recibe la tarjeta pendiente en la fase `after`. El guard, ante `compacting`, deja la tarjeta pendiente y responde «permitir tras un comando»; ante `after`, junta el veredicto del comando con la tarjeta, si había.
- `agents/cursor.ts`: `preCompact` sin matcher, su respuesta tras un comando une el aviso y la tarjeta, y la instalación, `doctor` y `uninstall` del sandbox. La carpeta común de git es la de `config` (`gitPath("config")`), que comparten todas las worktrees.
- Textos nuevos en core: las líneas de `init` y de `doctor` del sandbox y de `preCompact`.

## Archivos

- crear packages/cli/src/enforce/pending.ts — lo que espera al siguiente evento de una conversación
- modificar packages/cli/src/enforce/actions.ts — `conversationOf`
- modificar packages/cli/src/enforce/guard.ts — deja la tarjeta ante `compacting` y la entrega tras el siguiente comando
- modificar packages/cli/src/agents/adapter.ts — el evento `compacting` y la tarjeta en la respuesta de después
- modificar packages/cli/src/agents/cursor.ts — `preCompact`, la tarjeta en `additional_context` y el sandbox
- modificar packages/cli/src/install/agents.ts — la ruta de `.cursor/sandbox.json`, que `new` copia a cada worktree
- modificar packages/core/src/cards/doctor.ts — las líneas de `preCompact` y del sandbox
- modificar packages/core/src/cards/install.ts — las líneas de `init` del sandbox
- modificar packages/core/src/cards/index.ts — exporta esas líneas
- modificar packages/core/src/capabilities.ts — la tarjeta de Cursor, «indirecto», y sus permisos, «sí»
- modificar packages/cli/test/cursor.test.ts — la tarjeta tras compactar, `preCompact` y el sandbox (AC1 a AC4)
- modificar packages/cli/test/agents.test.ts — Cursor reconoce `preCompact` y une aviso y tarjeta
- modificar packages/core/test/capabilities.test.ts — la fila de Cursor cambia (AC5)
- modificar docs/ARCHITECTURE.md — la tarjeta indirecta (§7), los hooks y el sandbox de Cursor (§10) y la tabla
- modificar docs/formats.md — `specty/pending/` en la carpeta de git (§1)

## Tareas

- [x] T1: La tarjeta de Cursor llega con el siguiente comando tras compactar
  - files: packages/cli/src/enforce/pending.ts, packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/agents/cursor.ts, packages/core/src/cards/doctor.ts, packages/cli/test/cursor.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts test/agents.test.ts test/enforce.test.ts
- [x] T2: El sandbox de Cursor deja escribir a Specty en la carpeta de git y en la de las worktrees
  - files: packages/cli/src/agents/cursor.ts, packages/cli/src/install/agents.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/cursor.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts test/uninstall.test.ts test/install.test.ts
- [x] T3: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Si el agente no ejecuta ningún comando de shell tras compactar, la tarjeta no llega. Mitigación: AGENTS.md ya le pide `specty next` al empezar a trabajar, que es un comando; y la tabla dice «indirecto» con cómo se hace.
- R2: Dar al sandbox la carpeta común de git deja que cualquier comando escriba allí, como en la carpeta principal. Mitigación: el guard sigue bloqueando `git commit` y `--no-verify` antes de que se ejecuten, y los hooks de git rechazan un commit sin recibo.
- R3: Nada de esto se puede probar con Cursor de verdad, porque su modelo va por su servidor. Mitigación: las pruebas usan los eventos con la forma que documenta Cursor, como las que ya tiene.
