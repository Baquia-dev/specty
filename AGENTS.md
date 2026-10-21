# Specty

<!-- specty:begin id=project -->
## Proyecto (detectado por Specty)
- Stack: TypeScript (pnpm)
- Paquetes: packages/cli, packages/core
- Comandos:
  - Tests: `pnpm test`
  - Lint: `pnpm lint`
  - Typecheck: `pnpm typecheck`
  - Check: `pnpm check`
<!-- specty:end id=project -->

<!-- specty:begin id=flow -->
## Flujo de trabajo (Specty)
Este repositorio usa Specty. Antes de crear, modificar o borrar código, ejecuta `specty next` y sigue su salida hasta la línea `SIGUIENTE:`.
- Si el usuario pide un cambio y no hay uno activo, `specty next` te indica cómo crear la spec.
- Completa cada tarea con `specty task done <id>`; no ejecutes `git commit` tú mismo.
- Si necesitas un archivo fuera del alcance de la tarea, pídelo con `specty scope add`.
- Aprobar, aceptar y cerrar lo hace el usuario en su terminal; tú se lo pides y terminas tu turno.
- Si el comando `specty` no existe, usa `npx -y @baquia-dev/specty <comando>`. Nunca uses `npx specty`: es otro paquete.
<!-- specty:end id=flow -->

Herramienta que hace cumplir el desarrollo guiado por especificaciones con cualquier agente de IA. Producto: [PRODUCT.md](PRODUCT.md). Diseño: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Monorepo pnpm con TypeScript estricto, Node ≥ 22: `packages/core` (`@baquia-dev/specty-core`, puro) y `packages/cli` (`@baquia-dev/specty`, el comando `specty`).

## Comandos

- Instalar: `pnpm install`
- Todo (lint, tipos, cabeceras y tamaño de archivos, tests con cobertura): `pnpm check`
- Formatear y corregir lint: `pnpm format`
- Construir el CLI: `pnpm --filter @baquia-dev/specty build` (genera `packages/cli/dist/specty.mjs`)
- Un archivo de test: `pnpm --filter @baquia-dev/specty-core exec vitest run test/spec/parse.test.ts`

## Mapa

- `packages/core/src/spec/`: modelo, parser, serializador canónico, hash, delta y mensajes (es/en).
- `packages/core/src/validate/`: reglas semánticas de `docs/formats.md` §2.
- `packages/core/src/flow/`: máquina de estados y permisos por fase.
- `packages/core/src/guard/`: análisis de comandos de shell y decisión del guard.
- `packages/core/src/cards/`: textos que ve el agente (salida de cada comando).
- `packages/cli/src/commands/`: un archivo por comando; `enforce/`: hooks de git y guard; `install/`: lo que escribe `init`.
- `packages/*/test/fixtures/`: specs de ejemplo; las canónicas deben seguir siéndolo.

## Convenciones

- `packages/core/src` no usa APIs de Node ni del DOM: debe correr en el navegador. Lo comprueban `tsc` (sin tipos de Node) y Biome (`noNodejsModules`).
- Cada archivo fuente empieza con `// SPDX-License-Identifier: Apache-2.0` y tiene 300 líneas como máximo (lo comprueba `pnpm sources`).
- Sin `any` ni casts inseguros; datos `readonly` e inmutables.
- Todo texto visible tiene versión en español y en inglés.
- Nada que conceda permisos sobre el código (aprobar, aceptar, cerrar) puede habilitarse con una variable de entorno: las pruebas inyectan una terminal.
- Los formatos (`spec.md`, `state.json`, `config.yaml`) se definen en `docs/formats.md`; si cambias el código, actualiza ese documento.

## Terminado

`pnpm check` en verde. La cobertura no baja del 90 % en el core ni del 80 % en el CLI.
