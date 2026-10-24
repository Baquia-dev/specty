---
kind: standard
follows:
  - 20261024-las-verificaciones-de-las-funciones
---

# Capas de Clean Architecture con dependency-cruiser

## Objetivo

La configuración define las capas del proyecto (`checks.layers`: las rutas de cada una, a qué capas puede importar y qué paquetes no) y, en un proyecto TypeScript o JavaScript, `specty check` falla con cada import que las cruza, como un dominio que importa infraestructura, UI o un framework. dependency-cruiser resuelve los imports, con los alias de `tsconfig`. La regla de qué puede importar a qué vive en el core, para que el escáner de imports de Dart del corte 5 use la misma.

## Fuera de alcance

- Instalar dependency-cruiser en el proyecto: sin él, la verificación no corre y dice cómo añadirlo; la instalación con confirmación es del corte 6.
- eslint-plugin-boundaries: la persona eligió dependency-cruiser.
- Unas capas por defecto: sin `checks.layers`, la verificación no aparece, porque las rutas de cada capa son del proyecto.
- El escáner de imports de Dart (corte 5) y los ciclos entre módulos.

## Supuestos

- A1: Con `--no-config --ts-pre-compilation-deps --ts-config tsconfig.json --do-not-follow node_modules --output-type json --output-to <archivo>`, dependency-cruiser 18 da por módulo `source` y por dependencia `module` (el especificador), `resolved` (la ruta en el repositorio, o `node_modules/…` para un paquete), `dependencyTypes` (`local`, `npm…`, `core`), `coreModule` y `couldNotResolve`, y sale con 0; lo comprobé con la 18.7.0. Sin `--ts-pre-compilation-deps`, los imports que TypeScript elimina por no usarse no aparecen.
  - impacto: alto
- A2: Un archivo pertenece a la primera capa cuyas `paths` (globs) lo contienen; una capa siempre puede importarse a sí misma y a lo que no está en ninguna capa, y a otra capa solo si la nombra en `may`.
  - impacto: alto
- A3: El nombre de un paquete sale de su especificador (`@angular/core/testing` es `@angular/core`, `lodash/fp` es `lodash`), y un módulo del núcleo de Node se nombra `node:fs`; `forbiddenPackages` usa globs sobre esos nombres.
- A4: La línea de un import es la primera del archivo que contiene su especificador entre comillas; como las demás verificaciones de marcas, con `--changed` y `--staged` solo cuentan los imports de líneas añadidas.

## Criterios de aceptación

- AC1: CUANDO `checks.layers` define capas y un archivo de una importa uno de otra que no está en su `may` ENTONCES `specty check` sale con 1 y muestra `FALLA layers` con `ruta:línea` del import y `` `<capa>` no puede importar `<otra>` (<ruta importada>) ``.
- AC2: CUANDO una capa importa un paquete que casa con sus `forbiddenPackages` ENTONCES muestra `` `<capa>` no puede importar el paquete `<paquete>` ``; un paquete permitido, un import dentro de la misma capa o hacia algo sin capa no cuentan.
- AC3: CUANDO no hay `checks.layers` ENTONCES `layers` no aparece; CUANDO hay capas pero dependency-cruiser no está instalado ENTONCES no corre y `--verbose` dice cómo añadirlo; CUANDO dependency-cruiser falla ENTONCES no corre y muestra su error.
- AC4: CUANDO `may` nombra una capa que no existe ENTONCES la configuración no se acepta.
- AC5: CUANDO se ejecuta con `--changed` ENTONCES dependency-cruiser recibe solo los archivos TypeScript o JavaScript de la ejecución que están en alguna capa, y con `--all`, las carpetas de las capas; el idioma inglés da los mensajes en inglés.

## Diseño

- `core/src/schema/checks.ts`: `checks.layers` es un mapa de nombre a `{ paths, may, forbiddenPackages }`, con `may` validado contra los nombres.
- `core/src/checks/layers.ts`, puro: `layerOf(ruta, capas)`, `packageName(especificador)` y `layerViolations(imports, capas)`, que reciben imports ya resueltos (`{ from, specifier, target }` o `{ from, specifier, package }`).
- `cli/src/check/layers.ts`: `layersProvider(config)` se aplica a un stack TypeScript o JavaScript con capas; su verificación ejecuta el `depcruise` del proyecto, convierte su JSON en imports y los pasa al core.
- `commands/check.ts` lo arma en cada ejecución, junto al del proyecto.

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.layers` y su validación
- crear packages/core/src/checks/layers.ts — qué capa importa qué
- modificar packages/core/src/index.ts — exportar las capas
- crear packages/core/test/checks/layers.test.ts — las reglas de las capas y de los paquetes
- crear packages/cli/src/check/layers.ts — el proveedor de capas con dependency-cruiser
- modificar packages/cli/src/commands/check.ts — añadir el proveedor de capas
- crear packages/cli/test/check-layers.test.ts — la verificación de punta a punta con un dependency-cruiser falso
- modificar docs/formats.md — `checks.layers` y la verificación
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: Las capas en la configuración y su regla en el core
  - files: packages/core/src/schema/checks.ts, packages/core/src/checks/layers.ts, packages/core/src/index.ts, packages/core/test/checks/layers.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/layers.test.ts
- [x] T2: La verificación `layers` con dependency-cruiser
  - files: packages/cli/src/check/layers.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-layers.test.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-layers.test.ts
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm check

## Riesgos

- R1: Una versión futura de dependency-cruiser cambia su JSON — la lectura es defensiva y un informe que no entiende deja la verificación sin correr, nunca en verde; el test fija la forma que comprobé.
- R2: `--staged` le pasa a dependency-cruiser los archivos del disco, no los preparados — los imports suelen ser los mismos, y la verificación de `--changed` antes del commit los mira igual.

## Cierre

### Resumen

`checks.layers` define las capas del proyecto: sus rutas, a qué capas puede importar cada una y qué paquetes no. En TypeScript y JavaScript, `layers` falla con cada import añadido que las cruza, con su línea. El dependency-cruiser del proyecto resuelve los imports, alias de `tsconfig` incluidos, y la regla de qué capa importa qué vive en el core (`layerViolations`), lista para el escáner de Dart. Lo probé con dependency-cruiser 18.7.0 real en un proyecto de prueba: detectó un dominio que importa infraestructura directamente y por alias, `zod` y `node:fs`.

### Desviaciones

- dependency-cruiser no aplica reglas propias (`forbidden`): solo resuelve, y Specty decide con las capas de su configuración, para que Dart use la misma regla.
- La prueba real encontró dos cosas que el test fija ahora. dependency-cruiser llama `fs` a `node:fs`, así que la línea se busca de las dos formas. Y sin `--ts-pre-compilation-deps`, un import que no se usa no aparece.
- Los hallazgos se ordenan por archivo y línea, y no en el orden en que dependency-cruiser da las dependencias.

### Decisiones

- `--max-depth` no se usa: su documentación lo desaconseja y solo vale con un archivo.
- Una capa siempre puede importarse a sí misma y a lo que no está en ninguna capa; los imports que no se resuelven no cuentan.
- La verificación solo aparece con capas configuradas y un stack TypeScript o JavaScript.

### Pendientes

- Del proveedor de TypeScript queda la regeneración del cliente de Prisma; luego, el proveedor de Flutter y Dart (corte 5), con su escáner de imports para `layers`.
