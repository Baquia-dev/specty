# Specty

Herramienta que hace cumplir el desarrollo guiado por especificaciones con cualquier agente de IA. Producto: [PRODUCT.md](PRODUCT.md). Diseño: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Monorepo pnpm con TypeScript estricto, Node ≥ 22. Paquetes en `packages/*`; hoy existe `packages/core` (`@baquia-dev/specty-core`).

## Comandos

- Instalar: `pnpm install`
- Todo (lint, tipos, cabeceras y tamaño de archivos, tests con cobertura): `pnpm check`
- Formatear y corregir lint: `pnpm format`
- Un archivo de test: `pnpm --filter @baquia-dev/specty-core exec vitest run test/spec/parse.test.ts`

## Mapa

- `packages/core/src/spec/`: modelo, parser, serializador canónico, hash, delta y mensajes (es/en).
- `packages/core/src/validate/`: reglas semánticas de `docs/formats.md` §2.
- `packages/core/src/flow/`: máquina de estados y permisos por fase.
- `packages/core/src/scope/` y `sizing/`: alcance de tareas, tamaño y esfuerzo.
- `packages/core/test/fixtures/`: specs de ejemplo; las canónicas deben seguir siéndolo.

## Convenciones

- `packages/core/src` no usa APIs de Node ni del DOM: debe correr en el navegador. Lo comprueban `tsc` (sin tipos de Node) y Biome (`noNodejsModules`).
- Cada archivo fuente empieza con `// SPDX-License-Identifier: Apache-2.0` y tiene 300 líneas como máximo (lo comprueba `pnpm sources`).
- Sin `any` ni casts inseguros; datos `readonly` e inmutables.
- Todo texto visible tiene versión en español y en inglés (`spec/messages.*.ts`).
- Los formatos (`spec.md`, `state.json`, `config.yaml`) se definen en `docs/formats.md`; si cambias el código, actualiza ese documento.

## Terminado

`pnpm check` en verde. La cobertura del core no baja del 90 %.
