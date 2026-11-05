---
kind: epic
---

# La Bandeja por páginas, con las épicas como cabecera y los tiempos de cada cambio

## Objetivo

Hoy la Bandeja recibe del servidor todos los cambios de una vez, unos 500 en este repositorio porque incluye el archivo, y los pinta todos. Con esta épica, el servidor manda los cambios abiertos y los terminados por páginas, y la Bandeja pide la siguiente al llegar al final. Además, una épica pasa a ser la cabecera de su grupo, con sus cortes (features) dentro, y un cambio estándar suelto se identifica como «Feature» en lugar de «Individual». Cada fila dice cuánto lleva un cambio en curso desde que empezó y en su fase actual, y de uno terminado, cuándo empezó y cuánto tardó.

## Fuera de alcance

- Paginar otras pantallas (Memoria, Sesiones, Historial) o la lista de `specty status`.
- Que la paleta de comandos (⌘K) y los tooltips de referencias encuentren cambios terminados que la Bandeja aún no cargó: ven los cargados.
- Virtualizar las filas (reciclar el DOM al desplazarse): solo se pintan las páginas pedidas.
- El «modo individual» de las aprobaciones (ADR 0004), que es otra cosa y no cambia de nombre.
- La extensión de VS Code y el MCP App, que no muestran la Bandeja.

## Supuestos

- A1: Lo que se pagina son los cambios terminados (hechos o cancelados), que son casi todos. Los abiertos (los que esperan una decisión o están en curso, y los que perdieron su carpeta) llegan siempre completos, porque son pocos y de ellos salen las decisiones, los archivos compartidos y las épicas en curso.
  - impacto: alto
- A2: `GET /api/changes` pasa a dar solo los abiertos. `GET /api/changes/finished` da una página de terminados con `offset`, `limit` (30 por defecto), `q`, `phase` (`all`, `done` o `cancelled`) y `sort` (los cuatro órdenes de la Bandeja), y responde `{ records, total, counts, epics }`: los registros de la página, cuántos terminados coinciden, cuántos hay de cada fase con esa búsqueda y el título de las épicas de sus cortes. `GET /api/changes/<id>` da el registro de cualquier cambio, abierto o terminado, o 404.
  - impacto: alto
- A3: El servidor busca y ordena los terminados con las mismas reglas que la Bandeja: la búsqueda mira título, id y épica sin mayúsculas ni acentos, con una función que pasa a core para que la UI y el servidor no diverjan.
  - impacto: alto
- A4: En cada agrupación, los abiertos van antes que los terminados, y el orden elegido se aplica dentro de cada grupo. Así una página nueva de terminados se añade al final de lo que ya se ve, sin mover las filas de arriba. Sin agrupar, esto cambia: hoy un orden por título mezcla abiertos y terminados.
  - impacto: alto
- A5: Los cambios archivados no cambian: el servidor guarda en memoria lo que ya leyó de cada uno y solo lee los que aparecen nuevos en el archivo de cada worktree.
- A6: Una búsqueda, una fase o un orden nuevos vacían los terminados cargados y piden la primera página de nuevo; la búsqueda espera a que se deje de escribir (250 ms). Un aviso de cambios del servidor vuelve a pedir los abiertos y, de los terminados, tantos como ya había cargados, desde el principio, y la lista no repite un cambio aunque se haya movido de página.
- A7: Las páginas se piden al acercarse al final de la lista (con un `IntersectionObserver`) y al pasar con `j` de la última fila cargada; un botón «Cargar más» al final hace lo mismo donde no hay observador o con el teclado.
- A8: En una sección, los cambios de una épica van bajo su cabecera. Si la épica está en esa sección, la cabecera es su propia fila (fase, tiempos, enlace, lo que espera y su botón) y cuenta para `j`/`k`. Si la épica está en otra sección o no coincide con la búsqueda, la cabecera es su título con su enlace y su fase, sin tiempos ni botón, y no cuenta para `j`/`k`. «Agrupar por épica» sigue dando una sección por épica, con la épica como cabecera dentro.
  - impacto: alto
- A9: Dentro del grupo de su épica, la insignia de un corte dice «Feature · C2 · <título del corte>», con el título que le da la sección Cortes de la épica. Si la épica no está cargada o no lo nombra, «Feature · C2». Fuera del grupo, como en la página del cambio, dice «Feature · C2 · <épica>». Un cambio estándar suelto dice «Feature», y la sección «Specs individuales» de «Agrupar por épica» pasa a «Features».
  - impacto: alto
- A10: Un cambio empieza en su `change.created` y termina en la entrada de la auditoría que lo cerró o lo canceló, como el `createdAt` y el `closedAt` que ya derivan las vistas. Su fase empieza en `phaseSince`.
- A11: Los textos de tiempo son «Empezó hace 2 h 15 min» y «En esta fase: 25 min» para un cambio abierto, y «Empezó el 3 nov, 14:05» y «Tardó 2 h 10 min» para uno terminado, con el año solo si no es el actual. Una duración de un día o más se dice en días y horas («2 d 3 h»), también en las demás pantallas que usan `formatDuration`.

## Criterios de aceptación

- AC1: CUANDO un cambio está en curso o espera una decisión ENTONCES su fila en la Bandeja dice cuánto lleva desde que empezó y cuánto lleva en su fase actual, y los dos avanzan solos con el reloj de la página.
- AC2: CUANDO un cambio está hecho o cancelado ENTONCES su fila dice la fecha y la hora en que empezó y cuánto tardó de principio a fin, y no el tiempo en su fase.
- AC3: CUANDO una sección de la Bandeja tiene una épica y cortes suyos ENTONCES la épica es la cabecera del grupo, con su fase, sus tiempos, su enlace y su botón, y sus cortes van debajo y sangrados; `j`/`k` pasan por la cabecera y después por cada corte.
- AC4: CUANDO una sección tiene cortes de una épica que no está en ella ENTONCES van bajo una cabecera con el título de la épica, su enlace y su fase, sin tiempos ni botón, que `j`/`k` no paran.
- AC5: CUANDO se ve un corte dentro del grupo de su épica ENTONCES su insignia dice «Feature», su id de corte y el título del corte, sin repetir el de la épica; CUANDO se ve un cambio estándar suelto ENTONCES dice «Feature», en la Bandeja y en la cabecera de su página.
- AC6: CUANDO se abre por su enlace la página de un cambio terminado que la Bandeja no ha cargado ENTONCES la página lo muestra, leído del servidor por su id; con un id que no existe dice que no lo encontró, como hoy.
- AC7: CUANDO se abre la Bandeja ENTONCES el servidor manda todos los abiertos y solo la primera página de terminados; CUANDO se llega al final de la lista, o se pasa de la última fila con `j`, ENTONCES la Bandeja pide la página siguiente y la añade al final, hasta que no quedan.
- AC8: CUANDO se busca, se filtra por fase o se cambia el orden ENTONCES los terminados se piden de nuevo desde la primera página con esa búsqueda, esa fase y ese orden, y los contadores de fase, «X de N cambios» y el resumen cuentan todos los que coinciden, no solo los cargados.
- AC9: CUANDO cambia algo en `.specty/` con la Bandeja abierta ENTONCES vuelve a leer los abiertos y los terminados que ya tenía cargados, sin repetir ni perder filas y sin volver al principio de la lista.
- AC10: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- UI, Bandeja: `inbox/inbox-row.ts` (los tiempos; se quita el reloj fijo para una fecha de prueba de `effectiveNow`); `inbox/inbox-view.ts` (bloques de épica con cabecera, abiertos antes que terminados); un componente nuevo para la cabecera y el grupo de una épica, para que `inbox/inbox.ts` no crezca; `components/badge.ts` (las etiquetas «Feature»); `data/views.ts` (el título de cada corte de una épica, de su spec); `data/progress.ts` (`formatDuration` con días).
- UI, datos: `SpectyData` (`data/source.ts`) gana `change(id)` y `finished(page)`; los implementan `data/server.ts`, `data/fixtures.ts` (pagina su muestra en memoria, para el prototipo y los tests) y `data/mcp-app.ts` (sin terminados que paginar). `data/changes-store.ts` guarda los abiertos y las páginas cargadas, y `byId` pide al servidor el cambio que no tiene.
- Core: la función de búsqueda (título, id y épica, sin mayúsculas ni acentos), en `@baquia-dev/specty-core/light`, para la UI y el servidor.
- CLI: `server/records.ts` separa los abiertos de los terminados y guarda en memoria los archivados ya leídos; un módulo nuevo en `server/` filtra, ordena y pagina los terminados; `server/http.ts` sirve `/api/changes/finished` y `/api/changes/<id>`.
- Docs: `docs/ui.md` (Bandeja) y `docs/ARCHITECTURE.md` §15 (las rutas del servidor).

## Cortes

- C1: Los tiempos de cada cambio en la Bandeja
  - ac: AC1, AC2, AC10
- C2: Las épicas como cabecera, con sus features dentro
  - ac: AC3, AC4, AC5, AC10
  - depends: C1
- C3: Un cambio se abre aunque la Bandeja no lo haya cargado
  - ac: AC6
- C4: La Bandeja pide los terminados al servidor por páginas
  - ac: AC7, AC8, AC9, AC10
  - depends: C2, C3

## Riesgos

- R1: Un cambio que se archiva mientras la Bandeja está abierta desplaza los `offset` de las páginas — la recarga pide desde el principio todo lo cargado y la lista quita repetidos por id.
- R2: La paleta de comandos deja de ofrecer «Abrir» para los terminados no cargados — queda fuera de alcance y se anota en la memoria si molesta.
- R3: `inbox/inbox.ts` y `server/http.ts` ya son largos — la cabecera de épica y la paginación del servidor van en módulos propios.
