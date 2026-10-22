---
kind: standard
follows:
  - 20261022-sistema-de-diseno-patrones-de-documento-y-estado
---

# Prototipo: Bandeja en filas con buscador, filtros, agrupar y ordenar

## Objetivo

La Bandeja deja las tarjetas altas y se lee como el resto de la app, en filas de documento: cada cambio en una fila con su fase, título, qué espera, cuándo y su acción. Además se puede buscar, filtrar por fase, agrupar (por estado, por fase o sin agrupar) y ordenar, como en la maqueta "Specty · Oscuro mate y diff".

## Fuera de alcance

- El menú de preferencias y la cabecera en móvil.
- Guardar búsquedas o filtros con nombre.
- Pantallas nuevas de progreso, aceptación o cierre.

## Supuestos

- A1: La URL de la Bandeja siempre queda limpia. Agrupar y ordenar son preferencias de vista: se guardan como el tema y el idioma (en el navegador) y siguen igual al recargar o días después. La búsqueda y la fase son filtros del momento: viven en memoria durante la sesión, siguen al ir a un cambio y volver, y al recargar la Bandeja vuelve a mostrarlo todo.
  - impacto: alto
- A2: La búsqueda mira el título y el id, sin distinguir mayúsculas ni tildes.
- A3: Por defecto se agrupa por estado (Esperan tu decisión, En curso, Recientes) y se ordena por lo que más espera; "j" y "k" recorren las filas visibles en ese orden, y "/" lleva al buscador.

## Criterios de aceptación

- AC1: CUANDO se abre la Bandeja ENTONCES los cambios aparecen en filas de documento bajo divisores de sección con su número: fase (color, icono y texto), título, qué espera (o en qué está) con su tamaño, las notas que piden atención (supuestos de alto impacto, solicitud de alcance), cuánto lleva y, si espera a la persona, su acción; la fila elegida con "j"/"k" se resalta y su acción es la principal.
- AC2: CUANDO la persona escribe en el buscador ENTONCES solo quedan los cambios cuyo título o id coinciden, sin importar mayúsculas ni tildes; "/" enfoca el buscador y Escape lo vacía.
- AC3: CUANDO elige una fase en los filtros (cada una con su número) ENTONCES solo quedan los cambios de esa fase; elegirla otra vez vuelve a "Todas".
- AC4: CUANDO elige cómo agrupar (estado, fase o sin agrupar) o cómo ordenar (lo que más espera, lo más reciente, título o tamaño) ENTONCES las secciones y su orden cambian en consecuencia.
- AC5: CUANDO ningún cambio coincide ENTONCES aparece un estado vacío con "Limpiar filtros", y con algún filtro activo se ve cuántos cambios se muestran de cuántos.
- AC6: CUANDO la persona entra a un cambio y vuelve a la Bandeja ENTONCES la búsqueda, la fase, la agrupación y el orden siguen como estaban; CUANDO recarga ENTONCES la agrupación y el orden se conservan y la búsqueda y la fase se vacían; y la URL de la Bandeja no cambia en ningún caso.

## Diseño

- **Vista** (`inbox/inbox-view.ts`, puro): filtra por texto y fase, agrupa y ordena las vistas de cambio, y da secciones con sus filas; también los contadores por fase.
- **Fila** (`inbox/inbox-row.ts`): `sp-inbox-row` con fase, título enlazado, línea de qué espera, notas, cuándo y acción; usa el resalte de las filas del sistema de diseño.
- **Herramientas** (`inbox/inbox-toolbar.ts`): buscador, filtros por fase, agrupar y ordenar.
- **Estado** (`inbox/inbox-state.ts`): un servicio de la app con la búsqueda y la fase en memoria, y la agrupación y el orden guardados en el navegador (con lectura y escritura protegidas, por si el almacenamiento no está disponible).
- **Página** (`inbox/inbox.ts`): cabecera con resumen ("5 decisiones · 2 en curso · 2 recientes"), herramientas, secciones con `sp-section-divider`, estado vacío, error y esqueleto; ancho de página común.

## Archivos

- crear packages/ui/src/inbox/inbox-view.ts — filtrar, agrupar y ordenar
- crear packages/ui/src/inbox/inbox-view.test.ts — tests de la vista
- crear packages/ui/src/inbox/inbox-row.ts — fila de un cambio
- crear packages/ui/src/inbox/inbox-toolbar.ts — buscador, filtros, agrupar y ordenar
- crear packages/ui/src/inbox/inbox-state.ts — búsqueda y fase en memoria; agrupación y orden guardados
- modificar packages/ui/src/inbox/inbox.ts — la Bandeja en filas
- modificar packages/ui/src/inbox/inbox.test.ts — tests de la Bandeja
- modificar docs/ui.md — la Bandeja nueva

## Tareas

- [x] T1: Filtrar, agrupar y ordenar, y recordar la vista
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-view.test.ts, packages/ui/src/inbox/inbox-state.ts
  - ac: AC2, AC3, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-view.test.ts --include src/inbox/inbox-state.test.ts
- [ ] T2: Bandeja en filas, con buscador, filtros, agrupar y ordenar
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro, oscuro y a 390 px: filas, buscador con "/", filtros, agrupar, ordenar, estado vacío; que ir a un cambio y volver conserva la vista, que recargar conserva agrupar y ordenar, y que la URL no cambia.
