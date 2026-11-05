---
kind: standard
epic: 20261105-bandeja-por-paginas
slice: C5
---

# La Bandeja carga los terminados por páginas al bajar

## Objetivo

Desde C4, el servidor local da los cambios terminados por páginas en `GET /api/changes/finished`, pero la Bandeja aún los pinta todos de una vez, desde `/api/changes`. Con este corte, la Bandeja muestra todos los abiertos y solo la primera página de terminados, pide la siguiente al acercarse al final, con «Cargar más» o con `j` en la última fila, y sus contadores cuentan todos los que coinciden según el servidor. Así, cuando C6 deje de dar los terminados en `/api/changes`, la Bandeja no cambia.

## Fuera de alcance

- Que `GET /api/changes` deje de dar los terminados: es el corte C6.
- Cambiar el servidor: `GET /api/changes/finished` queda como lo dejó C4.
- Que la paleta de comandos y los tooltips de referencias pidan páginas: ven los cambios cargados, como dice la épica.
- Virtualizar las filas: solo se pintan las páginas pedidas.
- Que el número junto al título de cada sección cuente los terminados sin cargar: sigue contando sus filas.
- Un aviso propio para una página que falla: sale el aviso de la Bandeja con «Reintentar».

## Supuestos

- A1: `SpectyData` gana `finished(request)`, con `FinishedRequest` (`offset`, `limit`, `query`, `phase`, `sort` y `lang`), que devuelve una `FinishedPage` con la forma de la respuesta de C4 (`records`, `total`, `counts` con `done` y `cancelled`, `finished` y `epics`). Por defecto, la página se calcula en memoria sobre los hechos y cancelados de `changes()`, buscados, filtrados, contados y ordenados con `matchesQuery` y `sortChanges`, como el servidor. Sus vistas se derivan en un chunk que se carga al usarlo, como `inThread`, así que el hilo principal no carga el parser. `fixtures.ts` y `mcp-app.ts` no cambian.
  - impacto: alto
- A2: El store separa los abiertos (los de `changes()` que no están hechos ni cancelados, también los que perdieron su carpeta) de los terminados de las páginas cargadas, que guarda `data/finished-pages.ts`. La Bandeja toma los terminados solo de las páginas, aunque `changes()` aún los dé todos, así que C6 no cambia nada en ella. `ChangesStore.all`, que leen la paleta, los tooltips y la página de un cambio, da los de `changes()` y los de las páginas, una vez cada uno.
  - impacto: alto
- A3: Una página que llega después de una petición más nueva (otra búsqueda, fase u orden, o una recarga) se descarta. La página siguiente empieza donde acabó la anterior, sumando los registros recibidos, y no por el número de filas sin repetir; una página sin registros termina la lista. Cada cambio sale una vez, por su id. Un corte terminado toma el título de su épica de la épica cargada (abierta o de una página) o, si no está, de los `epics` de la página; el título que le da la épica, solo de la épica cargada.
- A4: Mientras llega la primera página de una búsqueda, una fase o un orden nuevos, la Bandeja muestra los terminados ya cargados filtrados y ordenados con los valores nuevos, y los cambia por la página cuando llega, así la lista no se vacía de golpe. Los abiertos se filtran al momento, como hoy; solo la petición de la búsqueda espera 250 ms a que se deje de escribir, y la fase y el orden piden al momento.
- A5: En los filtros por fase, las fases abiertas cuentan los abiertos, como hoy; «Terminado» y «Cancelado», los `counts` de la página; y «Todas», la suma. «X de N cambios» es X = los abiertos que pasan los filtros más el `total` de la página, y N = los abiertos más los `finished`. En el resumen, «recientes» son los `finished`.
- A6: El final de la lista es un bloque «Cargar más» después de la última sección, que se ve mientras quedan terminados. Un `IntersectionObserver` lo vigila con un margen, para pedir la página antes de llegar; el botón hace lo mismo, y donde no hay observador es la única forma. Con `j` en la última fila cargada se pide la página siguiente y, cuando llega, la fila elegida pasa a la siguiente.
- A7: La espera de la búsqueda y cada petición de página son tareas pendientes de Angular (`PendingTasks`), así la app solo está estable cuando terminan, y los tests las esperan con `whenStable`. Un error en una página sale en el aviso de la Bandeja; «Reintentar» vuelve a leer los abiertos y las páginas cargadas.

## Criterios de aceptación

- AC1: CUANDO se abre la Bandeja ENTONCES muestra todos los cambios abiertos y solo la primera página de terminados (30), aunque `changes()` dé más; en cada agrupación, los abiertos van antes que los terminados, cada parte en el orden elegido.
- AC2: CUANDO el final de la lista entra en la vista, se pulsa «Cargar más» o se pulsa `j` en la última fila cargada ENTONCES la Bandeja pide la página siguiente y la añade al final, sin repetir un cambio que pasó de una página a otra. Con `j`, la fila elegida pasa a la primera nueva; cuando no quedan terminados, «Cargar más» desaparece.
- AC3: CUANDO se busca, se filtra por fase o se cambia el orden ENTONCES la Bandeja pide de nuevo los terminados desde la primera página con esa búsqueda, esa fase y ese orden (la búsqueda, 250 ms después de dejar de escribir) y deja los de antes. Los contadores de fase, «X de N cambios» y el resumen cuentan todos los terminados que coinciden según la fuente, no solo los cargados.
- AC4: CUANDO la fuente avisa de un cambio con la Bandeja abierta ENTONCES vuelve a leer los abiertos y, desde la primera página, tantos terminados como tenía cargados, sin repetir ninguno y sin perder la fila elegida.
- AC5: CUANDO la Bandeja pide una página al servidor local ENTONCES `ServerData` la pide a `GET /api/changes/finished` con `offset`, `limit`, `q`, `phase`, `sort` y `lang`, y explica una sesión que falta, un error o una respuesta inesperada.
- AC6: CUANDO la fuente no pagina (el prototipo, el MCP App o un test) ENTONCES `SpectyData.finished` da la página de sus terminados en memoria, buscada, filtrada, contada y ordenada como el servidor, con el título de la épica de sus cortes.
- AC7: CUANDO sale «Cargar más» ENTONCES sale en español y en inglés.

## Diseño

- `data/source.ts`: `FinishedRequest`, `FinishedPage` y `SpectyData.finished(request)`, con la página en memoria por defecto (A1): `deriveViews` llega con `import("./views")`.
- `data/server.ts`: `ServerData.finished` con `GET /api/changes/finished?offset&limit&q&phase&sort&lang`; `data/server-answers.ts`, `isFinishedPage`, la comprobación ligera de la respuesta.
- `data/finished-pages.ts` (nuevo): la clase `FinishedPages`, sin inyección propia, que crea `ChangesStore` con la fuente, el `DERIVER` y `PendingTasks`. Lleva `ask(query)`, que con otra consulta pide la primera página y con la misma no hace nada; `more()`, la siguiente; y `reload()`, desde la primera tantas como había. Expone las señales `views`, `total`, `counts`, `finished`, `epics`, `loading`, `error`, `ready` (llegó alguna página) y `complete`. Un contador de peticiones descarta las respuestas viejas (A3).
- `data/changes-store.ts`: `pages`; `open`; `finished`, las vistas de las páginas con su épica (A3); `all`, con los de `changes()` y los de las páginas, una vez cada uno. Al avisar la fuente, recarga también las páginas. `withEpicTitle` pasa a dar también el título del corte y lo usan `byId` y `finished`.
- `inbox/inbox-view.ts`: `inboxSections` ordena los abiertos y los terminados por separado y pone los abiertos delante (A4 de la épica).
- `inbox/inbox-more.ts` (nuevo): el componente `sp-inbox-more`, el bloque «Cargar más» con su `IntersectionObserver`; la búsqueda que espera 250 ms y pide las páginas con los filtros de la Bandeja; las cuentas por fase con las de la página; y `j` tras la última fila.
- `inbox/inbox.ts`: lista `store.open()` y `store.finished()`; los contadores, «X de N» y el resumen de A5; espera a la primera página para dejar los esqueletos; `sp-inbox-more` al final; `j` en la última fila; «Reintentar» recarga también las páginas.
- Docs: `docs/ui.md` (la Bandeja por páginas).

## Archivos

- modificar packages/ui/src/data/source.ts — `finished(request)` en `SpectyData`, con su petición, su página y la página en memoria por defecto
- modificar packages/ui/src/data/server.ts — `ServerData.finished` con `GET /api/changes/finished`
- modificar packages/ui/src/data/server-answers.ts — la comprobación de una página de terminados
- crear packages/ui/src/data/finished-source.test.ts — los tests de `finished`, en `ServerData` y por defecto
- crear packages/ui/src/data/finished-pages.ts — las páginas de terminados cargadas: pedir, seguir, recargar y descartar respuestas viejas
- modificar packages/ui/src/data/changes-store.ts — los abiertos aparte, los terminados de las páginas con su épica y `all` con los dos
- crear packages/ui/src/data/finished-pages.test.ts — los tests de las páginas en el store
- modificar packages/ui/src/inbox/inbox-view.ts — los abiertos antes que los terminados en cada agrupación
- modificar packages/ui/src/inbox/inbox-view.test.ts — el test de los abiertos antes que los terminados
- crear packages/ui/src/inbox/inbox-more.ts — «Cargar más» con su observador, la búsqueda con espera, las cuentas con las de la página y `j` tras la última fila
- modificar packages/ui/src/inbox/inbox.ts — la Bandeja con los abiertos y las páginas, sus cuentas y el final de la lista
- crear packages/ui/src/inbox/inbox-more.test.ts — los tests de la Bandeja por páginas
- modificar docs/ui.md — la Bandeja por páginas

## Tareas

- [ ] T1: La fuente de datos da los terminados por páginas
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/finished-source.test.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/finished-source.test.ts --include src/data/server.test.ts && pnpm lint
- [ ] T2: El store guarda las páginas de terminados aparte de los abiertos
  - files: packages/ui/src/data/finished-pages.ts, packages/ui/src/data/changes-store.ts, packages/ui/src/data/finished-pages.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/finished-pages.test.ts --include src/data/changes-store.test.ts --include src/data/fixtures.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [ ] T3: La Bandeja carga los terminados por páginas al bajar
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-more.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-view.test.ts, packages/ui/src/inbox/inbox-more.test.ts
  - ac: AC1, AC2, AC3, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui test && pnpm typecheck && pnpm lint && pnpm knip
- [ ] T4: ui.md cuenta la Bandeja por páginas
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "Cargar más" docs/ui.md
  - type: docs

## Riesgos

- R1: Un cambio que se archiva con la Bandeja abierta desplaza las páginas — la recarga pide desde la primera todas las cargadas y la lista quita los repetidos por id (A3, AC4).
- R2: `inbox/inbox.ts` ya es largo (221 líneas) — la paginación va en `inbox/inbox-more.ts` y `data/finished-pages.ts`; en inbox.ts solo queda el enganche.
- R3: Los tests de la Bandeja que ya existen esperan con `whenStable` y no saben de la espera de 250 ms — la espera y las peticiones son tareas pendientes (A7), así `whenStable` las espera.
