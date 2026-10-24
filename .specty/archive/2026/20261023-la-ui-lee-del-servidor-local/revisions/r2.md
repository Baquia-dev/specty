---
kind: standard
---

# La UI lee del servidor local

## Objetivo

Cuando la sirve `specty ui`, la UI muestra los cambios reales de todas las worktrees y se actualiza sola cuando cambian, en lugar de los datos de ejemplo del prototipo. Lo hace con una nueva fuente de datos sobre el contrato `SpectyData` que ya tiene, así que las pantallas no cambian; fuera del servidor (`ng serve`, el catálogo) sigue con los datos de ejemplo.

## Fuera de alcance

- Acciones desde la UI: el servidor todavía solo lee, y la nueva fuente las rechaza como de solo lectura.
- Mostrar en la Bandeja la carpeta de cada cambio o los archivos que comparten.
- Los diffs y la verificación en vivo, que el servidor aún no da.

## Supuestos

- A1: La UI sabe que la sirve `specty ui` por la marca `<meta name="specty-data" content="server">` que el servidor pone en su `index.html`, y entonces usa la nueva fuente; sin la marca, los datos de ejemplo.
  - impacto: alto
- A2: La fuente pide `GET /api/changes` y escucha `changes` en `GET /api/events` con `EventSource`; la cookie de sesión va sola, porque la página y la API comparten origen.
- A3: Elegir la fuente antes de arrancar Angular, con una importación dinámica, deja los datos de ejemplo fuera de la carga inicial cuando no se usan, y la fuente del servidor fuera cuando no hay servidor.
- A4: La respuesta del servidor se comprueba solo por encima (una lista con `spec`, `state` y `phaseSince` en cada elemento): el worker ya lee cada spec con el parser de core.

## Criterios de aceptación

- AC1: CUANDO la UI arranca con la marca del servidor ENTONCES lee los cambios de `/api/changes` y vuelve a leerlos cada vez que `/api/events` emite `changes`; sin la marca, usa los datos de ejemplo.
- AC2: CUANDO la API no responde bien (sin sesión, con un error o con datos inesperados) ENTONCES la Bandeja muestra el error en el idioma de la persona, y sin sesión le pide abrir el enlace que imprime `specty ui`.

## Diseño

- `data/server.ts`: `ServerData`, que extiende `SpectyData` con `fetch` y `EventSource`, sin acciones.
- `main.ts`: elige `ServerData` o `FixtureData` según la marca e importa solo la elegida.
- `inbox/inbox.ts`: el mensaje del error de carga usa el texto bilingüe de `ActionError`, como las demás pantallas.

## Archivos

- crear packages/ui/src/data/server.ts — la fuente de datos del servidor local
- crear packages/ui/src/data/server.test.ts — sus tests
- modificar packages/ui/src/main.ts — elegir la fuente por la marca
- modificar packages/ui/src/inbox/inbox.ts — el error de carga en el idioma de la persona
- modificar docs/ARCHITECTURE.md — §15: la UI ya lee del servidor

## Tareas

- [x] T1: La fuente de datos del servidor local
  - files: packages/ui/src/data/server.ts, packages/ui/src/data/server.test.ts, packages/ui/src/inbox/inbox.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts --include src/inbox/inbox.test.ts
- [x] T2: La UI elige su fuente al arrancar
  - files: packages/ui/src/main.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm check

## Riesgos

- R1: La marca no llega si alguien sirve la UI de otra forma — entonces la UI usa los datos de ejemplo, como hoy.

## Cierre

### Resumen

Servida por `specty ui`, la UI lee los cambios reales de todas las worktrees con `ServerData` (`/api/changes`) y los vuelve a leer con cada evento `changes`; fuera del servidor sigue con los datos de ejemplo, que ahora solo se cargan entonces, así que la carga inicial bajó de 665 a 632 kB. Sin sesión, la Bandeja pide abrir el enlace que imprime `specty ui`, y sus errores de carga salen en el idioma de la persona. Probado contra este repositorio: la página llega marcada, el script se sirve y la UI deriva las vistas de sus 72 cambios reales sin fallos.

### Desviaciones

- La lógica de elegir la fuente quedó en `data/server.ts` (`dataSource`), con sus tests, y `main.ts` solo la llama: así T2, que no tenía tests, no deja lógica sin probar.

### Decisiones

- La respuesta del servidor se comprueba por encima (lista con `spec`, `state` y `phaseSince`) y no con el parser de core, que no debe llegar a la carga inicial.
- El presupuesto de 500 kB sin comprimir de `angular.json` ya se superaba antes (665 kB); este cambio lo reduce, y en transferencia la carga inicial son 130 kB, dentro de los 300 KB gzip de `ui.md`.

### Pendientes

- Incluir la UI construida en el paquete de npm del CLI.
- Las acciones desde la UI, cuando el servidor las tenga.
