---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C1
---

# La página Configuración muestra todos los ajustes, en solo lectura

## Objetivo

Hoy ninguna pantalla de `specty ui` enseña `.specty/config.yaml`: para saber cómo está configurado Specty hay que abrir el archivo y conocer sus claves. Con este cambio, la UI tiene la página «Configuración» (`/settings`), con su enlace en el encabezado, que muestra como un documento cada ajuste agrupado por sección, con su nombre y lo que hace en el idioma de la UI, su clave, su valor y, si difiere, su valor por defecto, con marcas para lo que afecta permisos, ejecuta un comando, vive en el clon o aún no tiene efecto, y con un buscador y filtros. Es la vista General en Avanzado de la épica, en solo lectura (sus AC1 a AC4 y AC26); si el archivo no es válido, cada error sale junto a su ajuste.

## Fuera de alcance

- Cambiar o guardar ajustes desde la página, el diálogo «Revisar y guardar» y la puerta de las acciones de la persona (C2).
- La vista Flujo, el modo Básico, las piezas y las garantías con candado (C3), y los perfiles (C4).
- Claves nuevas de `config.yaml` (C5 a C9): la marca «Nuevo» y su filtro existen, pero ningún ajuste la lleva aún.
- Una configuración de ejemplo en el prototipo (`data/fixtures.ts`): su fuente no la da, y la página lo dice.
- Traducir los valores más allá de las opciones de cada elección: rutas, comandos y nombres se ven como están en el archivo.

## Supuestos

- A1: La página lee `GET /api/config`, una lectura nueva que da el archivo como lo lee YAML (`input`), lo que usa Specty con todos los valores por defecto si es válido (`config`), los valores por defecto (`defaults`: `DEFAULT_CONFIG`, con el glosario por defecto del idioma del archivo) y los errores de `resolveConfig` con su clave (`issues`), y vuelve a leer el archivo en cada petición. Va en `server/api.ts`, como `memoryView`; las rutas `POST` y el guardado llegan con C2, que la llevará a `server/config.ts`.
  - impacto: alto
- A2: El catálogo de ajustes (`core/src/settings/catalog.ts`, en la entrada ligera) agrupa en un solo ajuste las claves que la propuesta A muestra juntas (`size`, `split`, `lines.tests` y los grupos de `checks`), deja fuera `version` y no lleva el valor por defecto, que da el servidor desde `DEFAULT_CONFIG`, para no repetirlo fuera de zod; un test del core comprueba que cada clave del schema cae en exactamente un ajuste y que las opciones de cada elección son las del schema.
  - impacto: medio
- A3: «Modificado» compara el valor que usa Specty con el de por defecto como JSON, así que unas rutas añadidas a `lines.exclude` o `checks.exclude` cuentan y una clave escrita con su valor por defecto no; el modo delegado, que vive en el clon, sale de `GET /api/delegation`, con «No» por defecto.
  - impacto: medio
- A4: Afectan permisos `policy.tests`, el modo delegado, `governed`, `ignored`, `sensitive`, las tres claves de `scope` y `checks.levels` (puede apagar verificaciones); ejecutan un comando `verify.default`, `verify.full`, `verify.quick`, `verify.units`, `git.setup`, `git.afterLanding`, `review.command`, `checks.commands` y `checks.generators`; son «Próximamente» `team.approvers`, `team.requirePrReview`, `ui.port`, `ui.requireUserPresence` y `effort`, porque nada los lee todavía.
  - impacto: medio
- A5: Con un archivo no válido no hay valores que use Specty: cada ajuste muestra el valor del archivo si lo tiene, y si no el de por defecto; un error va con el ajuste cuya clave es la del error o la contiene (con el resto de su ruta delante del mensaje), y los demás, como una clave desconocida o un YAML roto, salen arriba, con el aviso de que el archivo no es válido.
  - impacto: medio
- A6: Mientras no se pueda guardar, la página dice siempre que es de solo lectura y que los ajustes se cambian en `.specty/config.yaml`; la puerta de la Memoria (servidor arrancado por la persona) llega con el guardado, en C2. Los nombres, descripciones, secciones y opciones de los ajustes están en `core/src/cards/settings.ts`, y las palabras de la página, como en «Memoria», en la propia página.
  - impacto: bajo
- A7: Un valor se muestra según su forma: una opción con su nombre, sí o no, un número con su unidad, el texto y los comandos tal cual, y una lista, un mapa o un grupo como elementos (`clave: valor` en los mapas y grupos); de una lista larga, los seis primeros y cuántos más hay.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre «Configuración» desde el encabezado de la UI ENTONCES ve cada ajuste de `config.yaml`, y el modo delegado, agrupados por sección y en este orden: Flujo, Verificación, Git, Revisión independiente, Alcance, Tamaño y cortes, Líneas de código, Verificaciones de calidad, Equipo, Memoria, Desarrollo, Interfaz, Esfuerzo por herramienta y Glosario. Cada uno tiene su nombre, su descripción, su clave y el valor que usa Specty, y el que difiere del de por defecto lleva la marca «Modificado» y la línea «Por defecto: …».
- AC2: CUANDO un ajuste afecta permisos, ejecuta un comando, vive en el clon o todavía no tiene efecto ENTONCES lleva la marca «Afecta permisos», «Ejecuta un comando», «Este clon» o «Próximamente», y ningún ajuste tiene controles para cambiarlo.
- AC3: CUANDO la persona escribe en el buscador o elige un filtro (Todos, Modificados, Afectan permisos, Ejecutan comandos o Nuevos, cada uno con cuántos ajustes tiene) ENTONCES ve solo los ajustes que coinciden por nombre, descripción o clave, sin tildes ni mayúsculas, en sus secciones, y si no coincide ninguno la página lo dice.
- AC4: CUANDO `.specty/config.yaml` no es válido ENTONCES la página avisa de que no lo es y muestra cada error del validador junto a su ajuste, arriba los que no son de ninguno, y de cada ajuste el valor del archivo o, si no lo tiene, el de por defecto; `GET /api/config` da esos errores con el archivo leído de nuevo en cada petición.
- AC5: CUANDO la UI está en inglés ENTONCES el título, las secciones, los nombres, las descripciones, las opciones, las marcas y los filtros salen en inglés, y cada ajuste del catálogo tiene su nombre y su descripción en español y en inglés.

## Diseño

- Core, `settings/catalog.ts`: `SETTING_SECTIONS` (las 14 secciones en orden) y `SETTINGS`, un ajuste por clave en el orden de la página: `key` (con puntos; el del modo delegado es `specty delegate`), `section`, `kind` (`choice`, `toggle`, `number`, `text`, `command`, `list`, `map` o `group`), `options` de una elección, `unit` (`s` o `min`) y las marcas `permissions`, `command`, `clone`, `soon` y `new`. Solo importa de `i18n.ts` y `branches.ts`, sin zod.
- Core, `cards/settings.ts`: `settingText(key, lang)` da `{ name, description }`, `sectionName(section, lang)` y `optionName(key, option, lang)`, que sin texto propio da la opción tal cual. `light.ts` exporta todo esto.
- CLI, `server/api.ts`: `configView` en `VIEWS` para `/api/config`: lee `session.paths.config`, lo pasa por `parse` de `yaml` (un YAML roto da un error en la ruta vacía y ningún `input`) y por `resolveConfig`, y responde `{ input, config?, defaults, issues }`.
- UI, `data/source.ts`: `ConfigRecord` y `config()`, sin nada por defecto; `data/server.ts` lo pide a `GET /api/config` y comprueba su forma.
- UI, `settings/settings-view.ts` (puro, como `memory/memory-view.ts`): las filas de cada ajuste con su nombre, descripción, valor y valor por defecto en texto, si está modificado, sus errores y los errores sueltos; el filtro y la búsqueda (`fold` de la entrada ligera) y las secciones que quedan.
- UI, `settings/settings-page.ts` (`sp-settings-page`, ruta `/settings`, «Specty · Configuración»): encabezado con título, resumen (`.specty/config.yaml` · N ajustes · N modificados) y la línea de solo lectura; el aviso de archivo no válido con los errores sueltos; la barra con el buscador y un `sp-segmented` de filtros con su cuenta; y cada sección con `sp-section-divider` y sus filas sangradas sin líneas, con nombre, marcas, descripción, clave en mono y la línea «Por defecto», el valor a la derecha y los errores debajo. Marcas en píldora con el tono de una fase: Modificado (implementación), Afecta permisos (revisión), Ejecuta un comando (aceptación), Este clon (hecho), Próximamente (borrador) y Nuevo (tests). Lo que miran los tests: `[data-section]`, `[data-setting]`, `[data-name]`, `[data-description]`, `[data-key]`, `[data-value]` con un `[data-item]` por elemento, `[data-default]`, `[data-mark]` con la marca, `[data-issue]`, `[data-invalid]`, `[data-loose-issue]`, `[data-read-only]`, `[data-summary]` y `[data-no-match]`.
- UI, `app/routes.ts` y `app/shell.ts`: la ruta y el enlace «Configuración» tras «Sesiones».
- Tests: `core/test/settings/catalog.test.ts` (AC1, AC2, AC5), `cli/test/server/config.test.ts` (AC1, AC4), `ui/src/settings/settings-page.test.ts` (AC1 a AC5, con una fuente de ejemplo que da la configuración) y `ui/src/app/shell.test.ts` (el enlace).

## Archivos

- crear packages/core/src/settings/catalog.ts — el catálogo de ajustes, sus secciones y sus marcas
- crear packages/core/src/cards/settings.ts — nombres, descripciones, secciones y opciones en español y en inglés
- modificar packages/core/src/light.ts — exporta el catálogo y sus textos al hilo principal de la UI
- crear packages/core/test/settings/catalog.test.ts — el catálogo cubre el schema, sus marcas y sus textos
- modificar packages/cli/src/server/api.ts — `GET /api/config`
- crear packages/cli/test/server/config.test.ts — la lectura de la configuración, válida y no válida
- modificar docs/ARCHITECTURE.md — `GET /api/config` y la página «Configuración»
- modificar packages/ui/src/data/source.ts — `ConfigRecord` y `config()`
- modificar packages/ui/src/data/server.ts — `config()` del servidor
- crear packages/ui/src/settings/settings-view.ts — filas, valores en texto, filtro y búsqueda
- crear packages/ui/src/settings/settings-page.ts — la página «Configuración»
- crear packages/ui/src/settings/settings-page.test.ts — la página en español y en inglés, válida y no válida
- modificar packages/ui/src/app/routes.ts — la ruta `/settings`
- modificar packages/ui/src/app/shell.ts — el enlace «Configuración» del encabezado
- modificar packages/ui/src/app/shell.test.ts — la lista de enlaces del encabezado
- modificar docs/ui.md — la pantalla «Ajustes» pasa a ser «Configuración», en solo lectura

## Tareas

- [ ] T1: El catálogo de ajustes y sus textos, en la entrada ligera del core
  - files: packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/src/light.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts test/light.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: `GET /api/config` da el archivo, lo que usa Specty, los valores por defecto y los errores
  - files: packages/cli/src/server/api.ts, packages/cli/test/server/config.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/config.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [ ] T3: La página «Configuración», con su enlace, buscador y filtros
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/settings/settings-view.ts, packages/ui/src/settings/settings-page.ts, packages/ui/src/settings/settings-page.test.ts, packages/ui/src/app/routes.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/shell.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts --include src/app/shell.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El corte queda en el límite de tamaño (L) con tres paquetes. Mitigación: lo de guardar, el ejemplo del prototipo y la vista Flujo quedan fuera, y la lectura del servidor va en `api.ts` hasta que C2 añada sus rutas.
- R2: Los textos de 54 ajustes pueden pasar de 300 líneas en un archivo. Mitigación: descripciones de una línea, un objeto por ajuste con su par español e inglés, y si aun así pasa, se avisa en el cierre para partirlo por secciones.
