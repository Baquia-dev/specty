---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C2
---

# verify tiene su propio módulo del esquema

## Objetivo

`packages/core/src/schema/config.ts` pasa del límite de 300 líneas de código desde que `verify` creció con `units`, y `specty check` avisa de él. Con este cambio, la sección `verify` de `.specty/config.yaml` (su tipo resuelto, el de una unidad, sus valores por defecto, su esquema y cómo se resuelve) pasa a `schema/verify.ts`, como ya tienen `checks`, `git`, `memory` y `dev`. Lo que la configuración acepta y cómo se resuelve no cambia. Es el corte C2 de la épica `20261105-pendientes-de-las-unidades` (AC3 de la épica).

## Fuera de alcance

- Cambiar el formato de `verify` o lo que se resuelve de él: `docs/formats.md` no cambia.
- Sacar a su módulo otras secciones de `config.ts` (`scope`, `lines`, `split`, `team`, `ui`, `review`…).
- Cambiar los nombres de la API pública de core: `VerifyUnit` sigue saliendo del índice.

## Supuestos

- A1: `schema/verify.ts` sigue la forma de `schema/dev.ts` y `schema/memory.ts`: exporta la interfaz de la sección resuelta (`VerifyConfig`), la de una unidad (`VerifyUnit`), sus valores por defecto (`DEFAULT_VERIFY`), su esquema de zod (`VerifySchema`, con el de las unidades dentro) y `resolveVerify`, que le aplica los valores por defecto. `ResolvedConfig["verify"]` pasa a ser `VerifyConfig`, el mismo tipo con otro nombre.
- A2: `packages/core/src/index.ts` exporta `VerifyUnit` desde `schema/verify.ts` en lugar de `schema/config.ts`; ningún otro paquete importa de `schema/config.ts` directamente, así que nada más cambia fuera de core.
- A3: Los tests que ya existen de la sección (`test/schema/units.test.ts` y `test/schema/schema.test.ts`) son el contrato de este refactor y no cambian.

## Criterios de aceptación

- AC1: CUANDO se lee `.specty/config.yaml` ENTONCES `verify` se valida y se resuelve igual que antes desde su propio módulo del esquema, los tests que ya existían pasan sin cambios, y `schema/config.ts` queda por debajo de 300 líneas de código (`max-lines` de `specty check` no avisa de él).
  - test: manual

## Diseño

- `schema/verify.ts` (nuevo): `VerifyUnit`, `VerifyConfig` (lo que hoy es el tipo en línea de `ResolvedConfig["verify"]`, con sus comentarios), `DEFAULT_VERIFY` (`{ timeoutSec: 600, slots: 2 }`), `UnitsSchema` (privado, con el `superRefine` de los nombres repetidos), `VerifySchema` y `resolveVerify(verify)`, que es el `verifyOf` de hoy sobre la sección.
- `schema/config.ts`: `verify: VerifyConfig` en `ResolvedConfig`, `verify: DEFAULT_VERIFY` en `DEFAULT_CONFIG`, `verify: VerifySchema.optional()` en `ConfigSchema` y `verify: resolveVerify(input.verify)` en `withDefaults`; desaparecen `VerifyUnit`, `UnitsSchema` y `verifyOf`. `reviewOf` sigue usando el `timeoutSec` de `verify` como límite por defecto de la revisión.

## Archivos

- crear packages/core/src/schema/verify.ts — la sección `verify`: tipos, valores por defecto, esquema y resolución
- modificar packages/core/src/schema/config.ts — usa el módulo de `verify` y queda por debajo de 300 líneas de código
- modificar packages/core/src/index.ts — exportar `VerifyUnit` desde su módulo

## Tareas

- [ ] T1: La sección verify, en su propio módulo del esquema
  - files: packages/core/src/schema/verify.ts, packages/core/src/schema/config.ts, packages/core/src/index.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/templates.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor
