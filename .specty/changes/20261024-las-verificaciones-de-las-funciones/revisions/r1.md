---
kind: standard
follows:
  - 20261024-medir-las-funciones-lineas-y-complejidad
---

# Las verificaciones de las funciones

## Objetivo

`specty check` falla cuando el cambio deja una función por encima de `checks.functions` (50 líneas de código, complejidad 10) y es él quien la creó o la hizo crecer, en cualquier lenguaje de llaves. Una función que ya pasaba del límite y el cambio no agrandó no bloquea, para que la deuda que ya existe no frene un cambio pequeño; con `--all`, la CI ve todas.

## Fuera de alcance

- Usar `max-lines-per-function` y `complexity` de ESLint: ESLint no sabe cómo era la función antes del cambio, así que no puede distinguir la que el cambio agrandó de la que ya era grande; la medida propia es la misma para todos los lenguajes.
- Los archivos de test, donde los bloques `describe` largos son normales.
- Los lenguajes sin llaves (Python, Ruby, Elixir): `functionMetrics` no los mide.

## Supuestos

- A1: Una función del archivo actual es la misma que una del punto de partida (el merge-base con `--changed`, HEAD con `--staged`) si tienen el mismo nombre y el mismo orden entre las de ese nombre; una sin nombre, o sin pareja, es nueva.
  - impacto: alto
- A2: El cambio tocó una función si alguna de sus líneas, de la cabecera a la llave de cierre, es una línea añadida; con `--all` cuentan todas.
- A3: El proveedor de las funciones se aplica cuando algún stack detectado es de un lenguaje de llaves, es decir, cualquiera salvo Python, Ruby y Elixir.

## Criterios de aceptación

- AC1: CUANDO el cambio crea una función de más de `checks.functions.maxLines` líneas de código, o hace crecer por encima del límite una que ya existía ENTONCES `specty check` sale con 1 y muestra `FALLA function-lines` con `ruta:línea` de su cabecera y `` `<nombre>` tiene N líneas de código (máximo M) ``.
- AC2: CUANDO lo mismo pasa con la complejidad ENTONCES muestra `FALLA complexity` con `` `<nombre>` tiene complejidad N (máximo M) ``.
- AC3: CUANDO el cambio toca una función que ya pasaba del límite sin hacerla crecer, o una que no toca pasa del límite ENTONCES no cuenta con `--changed` ni con `--staged`; con `--all`, sí.
- AC4: CUANDO la función no tiene nombre ENTONCES el mensaje habla de «una función»; los archivos de test no se miden; en un repositorio cuyo único stack es Python, ninguna de las dos aparece.
- AC5: CUANDO `checks.functions` cambia los límites ENTONCES se usan esos; cuando el idioma es inglés, los mensajes están en inglés.

## Diseño

- `cli/src/check/functions.ts`: `functionsProvider` con `function-lines` y `complexity`. Las dos miden con `functionMetrics` el texto actual (`read`) y el de partida (`before`), emparejan las funciones por nombre y orden, y se quedan con las tocadas que pasan del límite y crecieron o son nuevas.
- `commands/check.ts` lo pone entre el proveedor de TypeScript y el común.
- Los tests que cuentan las verificaciones de un proyecto con stack (`check-commands`, `check-typescript`) suman las dos nuevas a su resumen.

## Archivos

- crear packages/cli/src/check/functions.ts — el proveedor de las funciones y sus dos verificaciones
- modificar packages/cli/src/commands/check.ts — añadir el proveedor de las funciones
- crear packages/cli/test/check-functions.test.ts — las dos verificaciones de punta a punta
- modificar packages/cli/test/check-commands.test.ts — el resumen suma las dos verificaciones nuevas
- modificar packages/cli/test/check-typescript.test.ts — el resumen suma las dos verificaciones nuevas
- modificar docs/formats.md — `checks.functions` y las dos verificaciones
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [ ] T1: `function-lines` y `complexity`
  - files: packages/cli/src/check/functions.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-functions.test.ts, packages/cli/test/check-commands.test.ts, packages/cli/test/check-typescript.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions.test.ts test/check-commands.test.ts test/check-typescript.test.ts
- [ ] T2: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm check

## Riesgos

- R1: Renombrar una función grande la hace parecer nueva — el mensaje lleva su nombre y su tamaño, y quien la renombra puede dividirla o bajar el nivel; es el mismo caso que crearla.
