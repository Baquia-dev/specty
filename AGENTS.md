# Specty

<!-- specty:begin id=project -->
## Proyecto (detectado por Specty)
- Stack: TypeScript (pnpm)
- Paquetes: packages/cli, packages/core, packages/ui
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
- Cada cambio vive en su propia carpeta (una worktree): tras `specty new`, trabaja en la carpeta que indica, no en la principal.
- Completa cada tarea con `specty task done <id>`; no ejecutes `git commit` tú mismo.
- Si necesitas un archivo fuera del alcance de la tarea, pídelo con `specty scope add`.
- Aprobar, aceptar y cerrar lo hace el usuario en su terminal; tú se lo pides y terminas tu turno. Solo si `SIGUIENTE:` te lo pide (modo delegado), los ejecutas tú.
- Si el comando `specty` no existe, usa `npx -y @baquia-dev/specty <comando>`. Nunca uses `npx specty`: es otro paquete.
<!-- specty:end id=flow -->

Herramienta que hace cumplir el desarrollo guiado por especificaciones con cualquier agente de IA. Producto: [PRODUCT.md](PRODUCT.md). Diseño: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Monorepo pnpm con TypeScript estricto, Node ≥ 22: `packages/core` (`@baquia-dev/specty-core`, puro) `packages/cli` (`@baquia-dev/specty`, el comando `specty`) y `packages/ui` (`@baquia-dev/specty-ui`, la UI web en Angular 22, que usa TypeScript 6.0 porque Angular aún no admite la 7; ver [ADR 0009](docs/decisions/0009-angular-para-la-ui.md)).

## Comandos

- Instalar: `pnpm install`
- Todo (lint, tipos, cabeceras y tamaño de archivos, tests con cobertura): `pnpm check`
- Formatear y corregir lint: `pnpm format`
- Construir el CLI: `pnpm --filter @baquia-dev/specty build` (genera `packages/cli/dist/specty.mjs`)
- Catálogo del sistema de diseño: `pnpm --filter @baquia-dev/specty-ui exec ng serve` (abre `/catalog`)
- Un archivo de test: `pnpm --filter @baquia-dev/specty-core exec vitest run test/spec/parse.test.ts`

## Mapa

- `packages/core/src/spec/`: modelo, parser, serializador canónico, hash, delta y mensajes (es/en).
- `packages/core/src/validate/`: reglas semánticas de `docs/formats.md` §2.
- `packages/core/src/flow/`: máquina de estados y permisos por fase.
- `packages/core/src/guard/`: análisis de comandos de shell y decisión del guard.
- `packages/core/src/cards/`: textos que ve el agente (salida de cada comando).
- `packages/ui/src/styles.css`: tokens del sistema de diseño (única fuente de valores); `theme/`: inventario de tokens y preferencias; `catalog/`: catálogo navegable. Los tests van junto a cada fuente (`*.test.ts`).
- `packages/cli/src/commands/`: un archivo por comando; `enforce/`: hooks de git y guard; `install/`: lo que escribe `init`; `server/`: el servidor local de `specty ui`.
- `packages/*/test/fixtures/`: specs de ejemplo; las canónicas deben seguir siéndolo.

## Convenciones

- `packages/core/src` no usa APIs de Node ni del DOM: debe correr en el navegador. Lo comprueban `tsc` (sin tipos de Node) y Biome (`noNodejsModules`).
- Cada archivo fuente empieza con `// SPDX-License-Identifier: Apache-2.0` (lo comprueba `pnpm sources`).
- Archivos cortos, con una responsabilidad: si uno pasa de unas 300 líneas de código (sin líneas en blanco ni comentarios; en los tests, unas 400), propón cómo dividirlo por responsabilidad antes de seguir. Nunca lo partas solo para cumplir el número: un `parte2.ts` o unos helpers sin cohesión son peores que un archivo largo. `pnpm sources` avisa a partir de 300 (tests: 400) y falla a partir de 500 (tests: 600); no mide el código generado, las migraciones, los textos de i18n, los mocks ni los datos de ejemplo (`sample-*`).
- Sin `any` ni casts inseguros; datos `readonly` e inmutables.
- Todo texto visible tiene versión en español y en inglés.
- Nada que conceda permisos sobre el código (aprobar, aceptar, cerrar) puede habilitarse con una variable de entorno: las pruebas inyectan una terminal.
- Los formatos (`spec.md`, `state.json`, `config.yaml`) se definen en `docs/formats.md`; si cambias el código, actualiza ese documento.

## Terminado

`pnpm check` en verde. La cobertura no baja del 90 % en el core ni del 80 % en el CLI y en la UI.
