---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C5
---

# `init --mcp` registra el servidor en los agentes, y `doctor` y `uninstall` lo conocen

## Objetivo

`specty mcp` ya existe, pero cada agente tiene que saber que está. `specty init --mcp` lo registra en la configuración MCP de proyecto de cada agente del repositorio. `doctor` comprueba que siga ahí y que ejecute `specty mcp`, y `uninstall` lo quita. Es opcional, porque cada herramienta MCP ocupa contexto en cada turno y la CLI ya hace lo mismo (supuesto A9 de la épica).

## Fuera de alcance

- Escribir en la carpeta del usuario (ADR 0013): Antigravity, que solo lee servidores MCP de allí, recibe un aviso con los pasos.
- Una columna de MCP en la tabla de capacidades de ARCHITECTURE §10.
- Registrar el servidor sin `specty` en el PATH, con la ruta del bundle de esta máquina.
- Aceptar por la persona la confianza o la aprobación que cada agente pide a un servidor MCP de proyecto.

## Supuestos

- A1: La configuración MCP de proyecto de cada agente es la que dicen sus documentaciones, revisadas el 2026-10-28. Claude Code, Cursor, Gemini CLI y Devin usan `mcpServers` en, respectivamente, `.mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json` y `.devin/config.json`. OpenCode usa `mcp` en `opencode.json`, con `type: local` y el comando como lista. Codex usa `[mcp_servers.specty]` en `.codex/config.toml`, que solo lee en un proyecto de confianza. Antigravity solo tiene la de la carpeta del usuario.
  - impacto: alto
- A2: La entrada se llama `specty` y ejecuta `specty mcp`. Se escribe solo si `specty` está en el PATH (la invocación portable de `init`), porque son archivos que suelen versionarse; si no, `init` avisa y no la escribe.
  - impacto: medio
- A3: `init` sin `--mcp` no añade ni quita entradas MCP, ni siquiera las que ya estaban.
- A4: Como registrarlo es opcional, el repositorio lo ha pedido cuando algún agente tiene la entrada `specty`. Solo entonces `doctor` avisa de los agentes a los que les falta. Una entrada `specty` que no ejecuta `specty mcp` es siempre un problema.
  - impacto: medio
- A5: `uninstall` quita la entrada `specty` de todos esos archivos, de cualquier agente, deja lo demás y borra el archivo si se queda vacío.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty init --mcp` con `specty` en el PATH ENTONCES cada agente del repositorio con configuración MCP de proyecto recibe la entrada `specty`, que ejecuta `specty mcp`. Lo demás del archivo no cambia. La salida lo dice, y los archivos entran en el commit de `init`.
- AC2: CUANDO `specty init --mcp` corre sin `specty` en el PATH, o con Antigravity ENTONCES no escribe esa entrada y avisa: que hace falta `specty` en el PATH, o que Antigravity solo lee servidores MCP de la carpeta del usuario y cómo añadirlo allí.
- AC3: CUANDO `specty init` corre sin `--mcp` ENTONCES no escribe ninguna entrada MCP.
- AC4: CUANDO algún agente del repositorio tiene la entrada `specty` ENTONCES `doctor` la confirma en cada agente que la tiene, da un problema en los demás agentes con configuración MCP de proyecto y en una entrada que no ejecuta `specty mcp`, y avisa en Antigravity; sin ninguna entrada, `doctor` no dice nada del servidor MCP.
- AC5: CUANDO la persona ejecuta `specty uninstall` ENTONCES quita la entrada `specty` de cada archivo MCP, conserva lo demás y borra el archivo que se queda vacío.

## Diseño

- `install/mcp.ts` tiene una tabla por agente: el archivo, el formato (`mcpServers`, el `mcp` de OpenCode o la tabla TOML de Codex), cómo leer la entrada, cómo escribirla y cómo quitarla. Los JSON se editan con `rewriteJson` y `removeFromJson`, que respetan los comentarios y el resto. El TOML se edita por su bloque, desde `[mcp_servers.specty]` hasta la tabla siguiente.
- `init --mcp` llama a `installMcp` después de los hooks, con los mismos agentes y la misma `InstallFiles`, así que entra en la copia de seguridad, en el `--dry-run` y en el commit. `doctor` añade las líneas de `mcpDoctor`. `uninstall` llama a `removeMcp`.
- Los textos van en `core/src/cards/mcp.ts`: la línea de `init`, los avisos y las líneas de `doctor`. Las líneas se suman a los `WRITERS` de `cards/doctor.ts` con su tipo, así que `doctor.ts` solo gana sus códigos.

## Archivos

- crear packages/core/src/cards/mcp.ts — los textos del registro MCP en `init` y `doctor`
- modificar packages/core/src/cards/doctor.ts — los códigos de las líneas de MCP
- modificar packages/core/src/cards/index.ts — exportar los textos
- crear packages/core/test/cards/mcp.test.ts — los textos
- crear packages/cli/src/install/mcp.ts — escribir, revisar y quitar la entrada de cada agente
- modificar packages/cli/src/commands/init.ts — la opción `--mcp`
- modificar packages/cli/src/program.ts — registrar `--mcp` en `init`
- modificar packages/cli/src/commands/doctor.ts — las líneas de MCP
- modificar packages/cli/src/commands/uninstall.ts — quitar las entradas
- crear packages/cli/test/mcp-install.test.ts — `init --mcp`, `doctor` y `uninstall` en repositorios reales
- modificar docs/ARCHITECTURE.md — §6: registrar el servidor
- modificar docs/formats.md — los archivos que escribe `init --mcp`

## Tareas

- [ ] T1: Los textos del registro MCP
  - files: packages/core/src/cards/mcp.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/index.ts, packages/core/test/cards/mcp.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/mcp.test.ts test/cards/doctor.test.ts
- [ ] T2: `init --mcp`, `doctor` y `uninstall`
  - files: packages/cli/src/install/mcp.ts, packages/cli/src/commands/init.ts, packages/cli/src/program.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/commands/uninstall.ts, packages/cli/test/mcp-install.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/mcp-install.test.ts test/bootstrap.test.ts test/doctor-enter.test.ts test/uninstall.test.ts
- [ ] T3: Documentar el registro
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-install.test.ts
  - type: docs

## Riesgos

- R1: Un agente cambia dónde lee su configuración MCP. Mitigación: la tabla de `install/mcp.ts` es el único sitio que lo sabe, y A1 dice la fecha de la revisión.
- R2: Editar `.codex/config.toml` como texto podría romper el TOML de la persona. Mitigación: solo se añade o se quita el bloque de `[mcp_servers.specty]`, y la prueba lo hace con un archivo que ya tiene otras claves.
