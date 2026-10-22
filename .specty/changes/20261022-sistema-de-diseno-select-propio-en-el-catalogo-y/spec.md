---
kind: standard
follows:
  - 20261022-barra-compacta-solo-con-los-botones-y-sugerencia
---

# Sistema de diseño: select propio, en el catálogo y en la Bandeja

## Objetivo

La Bandeja ordena con un `<select>` nativo, cuyo desplegable dibuja el sistema y no sigue el estilo de la UI. Ese select tampoco figura en el catálogo. El sistema de diseño gana un select propio, `sp-select`, con su desplegable en el estilo de los menús, documentado en el catálogo y usado en «Ordenar» de la Bandeja.

## Fuera de alcance

- Selección múltiple, búsqueda dentro del desplegable y grupos de opciones.
- Otros formularios: hoy la Bandeja es el único sitio con un select.

## Supuestos

- A1: El select se construye sobre Angular Aria, como la paleta y los menús: un combobox de solo lectura como disparador y un `listbox` como lista. Así el teclado y el lector de pantalla se comportan como en un select nativo: se abre con clic, Enter, Espacio o Alt+↓; se recorre con las flechas o Inicio/Fin, y escribiendo se salta a una opción; se elige con Enter o clic; Escape o pulsar fuera lo cierran sin cambiar el valor.
- A2: El disparador es como los demás campos (36 px de alto, borde y superficie) con un chevrón que gira al abrir. La lista es un panel flotante como el de los menús (superficie, borde, sombra y esquinas de 12 px), con una marca en la opción elegida y la activa iluminada. Se abre debajo, o encima si no cabe, y es al menos tan ancha como el disparador.
  - impacto: alto
- A3: En la Bandeja, «Ordenar» sigue como etiqueta visible del select, y el orden elegido se guarda como hasta ahora.

## Criterios de aceptación

- AC1: CUANDO la persona abre el select ENTONCES aparece una lista propia con el estilo de la UI, con la opción elegida marcada, y no el desplegable del sistema.
- AC2: CUANDO se mueve con el teclado (flechas, Inicio/Fin, escribir para saltar) y elige con Enter o con clic ENTONCES el valor cambia y la lista se cierra; Escape o pulsar fuera la cierran sin cambiarlo y el foco queda en el disparador.
- AC3: CUANDO un lector de pantalla llega al select ENTONCES anuncia su nombre, el valor elegido y que despliega una lista.
- AC4: CUANDO se abre la página «Componentes» del catálogo ENTONCES el select aparece con un ejemplo y su descripción.
- AC5: CUANDO se ordena la Bandeja ENTONCES se hace con este select, y el orden elegido se aplica y se recuerda como hasta ahora.

## Diseño

- **Select** (`components/select.ts`): `sp-select` con `label` (nombre accesible), `options` (`{ value, label }`) y `value` como `model`. El disparador lleva `ngCombobox` de solo lectura y la lista `ngComboboxPopup` con `ngListbox` y `ngOption`, en una superposición del CDK anclada al disparador, con las posiciones de los menús (`MENU_POSITIONS`).
- **Catálogo** (`catalog/components.ts`): una sección «Select» con un ejemplo vivo y su descripción.
- **Bandeja** (`inbox/inbox-toolbar.ts`): «Ordenar» usa `sp-select` en lugar del `<select>` nativo.

## Archivos

- crear packages/ui/src/components/select.ts — el select propio
- crear packages/ui/src/components/select.test.ts — tests del select
- modificar packages/ui/src/catalog/components.ts — el select en el catálogo
- modificar packages/ui/src/catalog/components.test.ts — test del catálogo
- modificar packages/ui/src/inbox/inbox-toolbar.ts — ordenar con el select propio
- modificar packages/ui/src/inbox/inbox-toolbar.test.ts — test de ordenar
- modificar docs/ui.md — el select en el sistema de diseño

## Tareas

- [x] T1: El select propio
  - files: packages/ui/src/components/select.ts, packages/ui/src/components/select.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/select.test.ts
  - notes: Comprobar en el navegador, en claro y oscuro, el teclado y que la lista se abre encima cuando no cabe debajo.
- [ ] T2: El select en el catálogo
  - files: packages/ui/src/catalog/components.ts, packages/ui/src/catalog/components.test.ts, docs/ui.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/catalog/components.test.ts
- [ ] T3: Ordenar la Bandeja con el select propio
  - files: packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/inbox/inbox-toolbar.test.ts, docs/ui.md
  - ac: AC5
  - verify: pnpm check
  - notes: Comprobar en el navegador a 390 y 1280 px.
