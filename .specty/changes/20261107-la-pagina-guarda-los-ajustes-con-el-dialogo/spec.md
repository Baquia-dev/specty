---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C10
---

# La página guarda los ajustes con el diálogo Revisar y guardar

## Objetivo

Hoy la página «Configuración» de `specty ui` solo muestra los ajustes, aunque el servidor ya sabe comprobarlos y guardarlos (C2). Con este cambio, la persona edita cada ajuste en su fila, lo restablece, y con «Revisar y guardar» ve en un diálogo qué cambia, con los avisos de lo que ejecuta un comando o afecta permisos, antes de guardar. Si el servidor no es suyo o no puede guardar, la página queda en solo lectura y dice por qué. Es el corte C10 de la épica: AC5, AC7, la parte de la página de AC8, AC9 y AC10, y de AC26 sus textos en español y en inglés. Incluye P278: la comprobación `isConfigRecord` pasa a `data/server-answers.ts`.

## Fuera de alcance

- La vista Flujo, el modo Básico, las piezas (C3) y los perfiles (C4).
- Cambiar el modo delegado desde esta página: sigue en su interruptor del encabezado, sin diff ni commit.
- Editar los ajustes «Próximamente», las garantías y los que solo cambian en el archivo (`verify.units`, `checks.generators`, `checks.layers` y `checks.testTime`): muestran su valor, como hoy.
- Añadir a un grupo una clave que no tiene valor en el archivo ni por defecto, como `checks.coverage.error`: se escribe en el archivo.
- El servidor y el core: las rutas, el editor del YAML, el commit y el diff por ajuste ya los hizo C2.
- Esperar el turno de aterrizaje cuando otra sesión lo tiene: el diálogo dice quién lo tiene, y la persona vuelve a guardar.

## Supuestos

- A1: La página se edita solo si la persona puede decidir desde ella (`allowed()` de `data/decisions.ts`, la misma puerta que la Memoria) y `GET /api/config` no trae `blocked`. Si no, queda en solo lectura, sin controles, y dice el motivo: el de `Decisions` (un servidor que arrancó el agente, o una pestaña sin sesión) o el de `blocked` en palabras. La fuente de datos traduce `blocked` y cada rechazo del servidor (409) a un texto en español y en inglés, en `data/server-answers.ts`, como los demás motivos de esa fuente.
  - impacto: alto
- A2: El control de cada ajuste sale de su `kind` en el catálogo, y solo lo tienen los que acepta `settingOf` del core. Una opción se elige entre sus nombres, y un sí o no, con «Sí» y «No». Un número, un texto y un comando van en un campo de texto. Un número con su unidad, y lo que no es un número se envía tal cual, para que el validador diga el error. Una lista va con un elemento por línea, de números en `dev.ports`. Un grupo tiene un campo por cada clave de su valor por defecto o del archivo. Un mapa, o un grupo vacío por defecto (`checks.levels`, `checks.commands`), va con una entrada `nombre: valor` por línea. Un campo de texto vacío quita la clave.
  - impacto: alto
- A3: Cada edición es la de un campo, con su ruta de claves y el texto que escribió la persona, que el control sigue mostrando tal cual. «Restablecer» es una edición sin valor en la ruta del ajuste, que deja los campos con el valor por defecto y quita sus ediciones anteriores. La página cuenta los cambios con `settingChanges` del core sobre la entrada del archivo con las ediciones aplicadas. Con cada edición pide `POST /api/config/check` con todas, y muestra los errores de esa comprobación en lugar de los del archivo.
  - impacto: medio
- A4: El diálogo muestra los cambios de la última comprobación, que son los que va a guardar el servidor. Cada valor es el del archivo o, si falta, el de por defecto, y en un grupo, el del archivo sobre el de por defecto. Lo nuevo y lo anterior se comparan por elementos en una lista, un mapa o un grupo, y por palabras en un texto o un comando, con `WordDiff` y `BeforeLine` de la revisión. «Antes» sale solo si se quitó algo, y un valor único cambiado siempre quita el anterior. Una clave que se quita dice «Vuelve al valor por defecto».
  - impacto: medio
- A5: Un cambio que ejecuta un comando avisa de que Specty lo ejecutará en la máquina de la persona. Uno que afecta permisos avisa de que cambia lo que el agente puede hacer sin pedírselo. Si alguno afecta permisos, el diálogo lleva una casilla de confirmación aparte, y «Guardar» no se puede pulsar hasta marcarla. El pie dice que se guarda con un commit propio en la carpeta de `specty ui` y que los cambios en curso lo reciben al incorporar main (R3 de la épica).
  - impacto: medio
- A6: Al guardar bien, el diálogo se cierra, un aviso dice el commit y las ediciones se vacían. La página vuelve a leer la configuración, como tras cualquier acción de la persona. Si el servidor lo rechaza, el diálogo sigue abierto con el motivo y, si son errores del validador, cada uno sale también junto a su control.
  - impacto: bajo
- A7: Las acciones «Descartar» y «Revisar y guardar», con el número de cambios, van en el encabezado y en una barra compacta. La barra aparece al salir el encabezado de la vista, como la de un cambio, y solo cuando la página se puede editar. Los textos de la página siguen en el propio componente, en español y en inglés, como en C1 y en la Memoria.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre «Configuración» en un `specty ui` que arrancó ella y que puede guardar ENTONCES cada ajuste que se guarda desde la UI muestra un control con el valor del archivo o el de por defecto, según A2. Los «Próximamente», las garantías, el modo delegado y los que solo cambian en el archivo muestran su valor, sin control.
- AC2: CUANDO cambia ajustes ENTONCES cada uno lleva la marca «Sin guardar», el encabezado dice cuántos cambios hay sin guardar y «Revisar y guardar» lleva ese número. «Descartar» devuelve los valores del archivo.
- AC3: CUANDO un valor no es válido, por ejemplo `size.M` mayor o igual que `size.L` o un texto donde va un número ENTONCES su ajuste muestra el error del validador del core junto a su control, y «Revisar y guardar» no se puede pulsar y dice por qué.
- AC4: CUANDO pulsa «Revisar y guardar» ENTONCES un diálogo dice cuántos cambios hay en `.specty/config.yaml` y lista cada uno con su nombre, su clave y el valor nuevo, con lo añadido resaltado. Solo si se quitó algo, una línea «Antes» muestra el valor anterior con lo quitado tachado. Un cambio que ejecuta un comando o afecta permisos lleva su marca y su aviso.
- AC5: CUANDO algún cambio del diálogo afecta permisos ENTONCES «Guardar» no se puede pulsar hasta que la persona marca la confirmación aparte; sin cambios de permisos, no hay confirmación.
- AC6: CUANDO pulsa «Guardar» ENTONCES la página envía al servidor solo las ediciones, el diálogo se cierra, un aviso dice el commit y la página vuelve a leer la configuración, sin cambios sin guardar.
- AC7: CUANDO pulsa «Restablecer» en un ajuste que está en el archivo y guarda ENTONCES su control muestra el valor por defecto, el diálogo dice que vuelve al valor por defecto y la edición enviada quita su clave.
- AC8: CUANDO `specty ui` no lo arrancó una persona desde su terminal ENTONCES la página no tiene controles, ni «Restablecer», ni «Revisar y guardar», y dice que es de solo lectura y por qué.
- AC9: CUANDO el servidor dice que no se puede guardar, porque su carpeta tiene un cambio en curso o `config.yaml` tiene cambios sin commit o no es YAML ENTONCES la página es de solo lectura y da el motivo en palabras. Si el guardado se rechaza por esos motivos, porque otra sesión tiene el turno de aterrizaje, porque nada cambia o porque git falla, el diálogo sigue abierto y dice por qué.
- AC10: CUANDO la página comprueba o guarda unas ediciones ENTONCES la fuente de datos del servidor las envía como `{ edits }` a `POST /api/config/check` o a `POST /api/config`, con el token CSRF. Da los errores y los cambios, o el commit, y una respuesta con otra forma da el error de datos inesperados.
- AC11: CUANDO la UI está en inglés ENTONCES los controles, las marcas, las acciones, el diálogo, sus avisos y los motivos salen en inglés.

## Diseño

- Datos (`data/source.ts`): `ConfigRecord` gana `blocked?: Bilingual`. `SpectyData` gana `checkConfig(edits)`, que da `ConfigCheck` (`{ issues, changes }`), y `saveConfig(edits)`, que da `ConfigSaved` (`{ commit, changes }`). Las dos fallan como solo lectura en una fuente que no las implementa. `ConfigEdit` y `SettingChange` vienen de `@baquia-dev/specty-core/light`.
- Servidor (`data/server.ts`): `checkConfig` y `saveConfig` envían `{ edits }` con el token CSRF por un `send` común con `post`. Un 409 de `saveConfig` da `ActionError` con `configRefusal` y un 200 vuelve a leer, como `post`. `config()` cambia `blocked` por sus palabras.
- Respuestas (`data/server-answers.ts`): `isConfigRecord` (P278), `isConfigCheck`, `isConfigSaved` y `configRefusal(body)`, que pone en palabras cada motivo: `change` con su id, `uncommitted`, `yaml`, `invalid`, `unchanged`, `turn` con su comando y su carpeta, y `git` con su detalle.
- Edición (`settings/settings-edit.ts`, puro): `fieldsOf(setting, record)` da los campos de un ajuste (A2). `fieldText` da el texto de un campo, y `draftOf` y `resetDraft` dan la edición de un texto o de «Restablecer». `withDraft` y `editsOf` llevan las ediciones por ruta, `applyEdits` las aplica a la entrada del archivo, y `changeLines` da cada cambio como lo muestra el diálogo (A4). Los elementos de un valor en palabras salen de `valueItems` de `settings-view.ts`, sin recortar, que `words` también usa.
- Fila (`settings/setting-row.ts`): `sp-setting-row` es la fila que hoy está en la plantilla de la página: nombre, marcas (con «Sin guardar»), descripción, clave, valor por defecto con «Restablecer», errores y, a la derecha, el valor o los controles. Usa `sp-select` para una opción, `sp-segmented` para un sí o no, y campos nativos con su unidad.
- Página (`settings/settings-page.ts`): lleva las ediciones, la comprobación (`resource` con las ediciones como parámetro), el número de cambios, el motivo de solo lectura, las acciones del encabezado y la barra compacta (`IntersectionObserver` sobre el encabezado, como en `change-page.ts`). «Revisar y guardar» abre el diálogo con los cambios de la comprobación y las ediciones.
- Diálogo (`settings/save-dialog.ts`): `sp-save-dialog` sobre `sp-dialog`, con cada cambio (`WordDiff` y `BeforeLine` de `review/spec-sections.ts`), sus avisos, la casilla de permisos, el pie y el motivo de un rechazo (`role="alert"`). Al guardar bien, se cierra con lo guardado, y la página vacía las ediciones y avisa con el commit.
- Tests: `data/server-config.test.ts` (las rutas, el CSRF, las respuestas y los motivos en palabras), `settings/settings-edit.test.ts` (campos, textos, ediciones y líneas del diálogo), `settings/settings-controls.test.ts` (los controles, «Sin guardar», los errores, «Restablecer» y la solo lectura) y `settings/settings-save.test.ts` (el diálogo, la confirmación, el guardado, los rechazos y el inglés). En `settings/settings-page.test.ts`, la fuente de los tests de C1 pasa a ser de solo lectura, porque comprueban el valor que se lee y que no hay controles.

## Archivos

- modificar packages/ui/src/data/source.ts — `blocked`, `checkConfig` y `saveConfig` en la fuente de datos
- modificar packages/ui/src/data/server.ts — comprobar y guardar contra el servidor, y `blocked` en palabras
- modificar packages/ui/src/data/server-answers.ts — `isConfigRecord` (P278), las respuestas de comprobar y guardar, y sus motivos en palabras
- crear packages/ui/src/data/server-config.test.ts — comprobar, guardar y los motivos de la fuente del servidor
- modificar packages/ui/src/settings/settings-view.ts — `valueItems`, los elementos de un valor sin recortar
- crear packages/ui/src/settings/settings-edit.ts — campos, textos, ediciones y cambios en palabras
- crear packages/ui/src/settings/settings-edit.test.ts — el modelo de edición
- crear packages/ui/src/settings/setting-row.ts — la fila de un ajuste con sus controles y «Restablecer»
- modificar packages/ui/src/settings/settings-page.ts — ediciones, comprobación, acciones, barra compacta y solo lectura
- modificar packages/ui/src/settings/settings-page.test.ts — la fuente de los tests de C1, de solo lectura
- crear packages/ui/src/settings/settings-controls.test.ts — controles, «Sin guardar», errores, «Restablecer» y solo lectura
- crear packages/ui/src/settings/save-dialog.ts — el diálogo «Revisar y guardar»
- crear packages/ui/src/settings/settings-save.test.ts — el diálogo, la confirmación, el guardado y sus rechazos
- modificar docs/ui.md — la pantalla Configuración con edición y su diálogo

## Tareas

- [x] T1: La fuente de datos del servidor comprueba y guarda la configuración, con sus motivos en palabras
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/server-config.test.ts
  - ac: AC9, AC10
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server-config.test.ts && pnpm lint
- [x] T2: El modelo de edición da los campos de cada ajuste, sus ediciones y cada cambio en palabras
  - files: packages/ui/src/settings/settings-edit.ts, packages/ui/src/settings/settings-edit.test.ts, packages/ui/src/settings/settings-view.ts
  - ac: AC1, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-edit.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [x] T3: Cada ajuste tiene su control, «Restablecer» y su error, y la página dice por qué es de solo lectura
  - files: packages/ui/src/settings/setting-row.ts, packages/ui/src/settings/settings-page.ts, packages/ui/src/settings/settings-page.test.ts, packages/ui/src/settings/settings-controls.test.ts
  - ac: AC1, AC2, AC3, AC7, AC8, AC9
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-controls.test.ts --include src/settings/settings-page.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [x] T4: «Revisar y guardar» abre el diálogo con cada cambio, sus avisos y la confirmación, y guarda
  - files: packages/ui/src/settings/save-dialog.ts, packages/ui/src/settings/settings-page.ts, packages/ui/src/settings/settings-save.test.ts, docs/ui.md
  - ac: AC4, AC5, AC6, AC7, AC9, AC11
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-save.test.ts && pnpm typecheck && pnpm lint && pnpm sources && pnpm knip

## Riesgos

- R1: `settings-page.ts` ya pasa de 300 líneas y gana la edición. Mitigación: la fila con sus controles va en `setting-row.ts`, el diálogo en `save-dialog.ts` y la lógica pura en `settings-edit.ts`; la página solo une las piezas.
- R2: El número de cambios de la página y los del diálogo podrían no coincidir. Mitigación: los dos salen de `settingChanges` del core, y el diálogo usa los de la comprobación, que son los que guarda el servidor.
- R3: Una comprobación por cada tecla. Mitigación: el servidor es local y no escribe nada al comprobar, y `resource` descarta la respuesta de una comprobación ya superada por otra.
- R4: C6, C7 y C11 corren a la vez y añaden ajustes, quizá con tests en `settings-page.test.ts`. Mitigación: los tests de este corte van en archivos nuevos, y en ese archivo solo cambia su fuente de datos.
