---
kind: standard
follows:
  - 20261022-prototipo-bandeja-en-filas-con-buscador-filtros
---

# Armazón y catálogo: cabecera en una línea y menú de preferencias

## Objetivo

En el teléfono la cabecera de la app ocupa tres líneas (unos 145 px) y, sumada a las barras fijas de cada página, deja poco espacio al contenido. La cabecera pasa a una sola línea en cualquier ancho: el tema y el idioma se agrupan en un menú de preferencias y, en pantallas estrechas, el buscador queda en un icono. De paso, el catálogo adopta el ancho de página común y el lenguaje de documento: su menú no se parte y los colores se muestran en filas, no en tarjetas.

## Fuera de alcance

- La página del cambio y la revisión en el teléfono (cabecera amplia, franja de datos, índice «Contenido», filas con marcas): van en el cambio siguiente.
- Nuevas preferencias además del tema y el idioma.
- Las demás páginas del catálogo, salvo su menú y «Colores».

## Supuestos

- A1: El tema y el idioma pasan a un menú de preferencias en todos los anchos, no solo en el teléfono, para que la cabecera sea igual en todas partes. Es un botón con icono de ajustes a la derecha del buscador; el menú muestra «Tema» (Claro, Oscuro, Sistema, con icono y texto) e «Idioma» (Español, English). Elegir aplica al momento y no cierra el menú; se cierra al pulsar fuera o con Escape.
  - impacto: alto
- A2: Por debajo de 640 px el buscador es solo un icono, con «Buscar o ejecutar» como nombre accesible; desde 640 px conserva el texto y ⌘K. La paleta y sus comandos de tema e idioma no cambian.
- A3: Los nombres de idioma se escriben en su propio idioma (Español, English), como es costumbre, en las dos lenguas de la interfaz.
- A4: El menú se abre como popover nativo del navegador, fijo bajo la cabecera a la derecha (la cabecera nunca se desplaza), sin depender del posicionamiento por ancla.

## Criterios de aceptación

- AC1: CUANDO se abre cualquier pantalla, desde 360 px de ancho ENTONCES la cabecera ocupa una sola línea: specty, Bandeja, Catálogo y, a la derecha, buscar o ejecutar y el menú de preferencias.
- AC2: CUANDO la persona abre el menú de preferencias ENTONCES elige el tema (claro, oscuro o del sistema) y el idioma, cada elección se aplica al momento y se recuerda como hasta ahora, y Escape o pulsar fuera cierra el menú.
- AC3: CUANDO la pantalla mide menos de 640 px ENTONCES el buscador es un icono con nombre accesible «Buscar o ejecutar» que abre la paleta; CUANDO es más ancha ENTONCES muestra además el texto y ⌘K.
- AC4: CUANDO se abre el catálogo ENTONCES usa el ancho de página común, ninguna entrada de su menú se parte en dos líneas y, en el teléfono, su menú es una sola línea que se desplaza de lado.
- AC5: CUANDO se abre «Colores» ENTONCES la base y el acento, y las fases, aparecen como filas de documento bajo divisores de sección (muestra, token, uso y valor), sin tarjetas, y los usos del acento sin recuadro.

## Diseño

- **Menú de preferencias** (`app/preferences-menu.ts`): `sp-preferences-menu`, un botón con icono (`popovertarget`) y un panel `popover` con dos grupos de opciones (los mismos `input[type=radio]` de hoy, con texto visible). El panel va `fixed` bajo la cabecera, a la derecha, con superficie, borde y sombra del sistema de diseño.
- **Cabecera** (`app/shell.ts`): una línea sin salto (`flex-nowrap`), con menos separación en el teléfono; el texto del buscador es `sr-only` por debajo de `sm` y ⌘K se oculta; las preferencias se sustituyen por `sp-preferences-menu`.
- **Catálogo** (`catalog/catalog.ts`): el contenedor usa `PAGE`; el menú lateral tiene ancho fijo y entradas sin salto de línea; por debajo de `md` es una fila que se desplaza de lado, como las fases de la Bandeja.
- **Colores** (`catalog/colors.ts`): `sp-section-divider` para «Base y acento», «Usos del acento» y «Fases», con su número; filas sin bordes (muestra, token, uso, valor) que en el teléfono se apilan.

## Archivos

- crear packages/ui/src/app/preferences-menu.ts — menú de tema e idioma
- modificar packages/ui/src/app/shell.ts — cabecera en una línea con el menú y el buscador en icono
- modificar packages/ui/src/app/shell.test.ts — tests de la cabecera y del menú
- modificar packages/ui/src/catalog/catalog.ts — ancho común y menú sin saltos
- modificar packages/ui/src/catalog/colors.ts — colores en filas de documento
- modificar packages/ui/src/catalog/catalog.test.ts — tests del catálogo
- modificar docs/ui.md — armazón y catálogo

## Tareas

- [x] T1: Cabecera en una línea con menú de preferencias
  - files: packages/ui/src/app/preferences-menu.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/shell.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro y oscuro, a 360, 390 y 1280 px: una sola línea, el menú bajo la cabecera, Escape y pulsar fuera lo cierran, y el foco se ve.
- [x] T2: Catálogo con el ancho común y colores en filas
  - files: packages/ui/src/catalog/catalog.ts, packages/ui/src/catalog/colors.ts, packages/ui/src/catalog/catalog.test.ts, docs/ui.md
  - ac: AC4, AC5
  - verify: pnpm check
  - notes: Comprobar en el navegador a 390 y 1280 px, en claro y oscuro.

## Riesgos

- R1: El popover nativo no existe en jsdom — los tests comprueban el marcado (botón con `popovertarget`, panel `popover`, opciones) y las elecciones; el abrir y cerrar se comprueba en el navegador.

## Cierre

### Resumen

La cabecera ocupa una sola línea (57 px) en cualquier ancho desde 360 px: specty, Bandeja y Catálogo y, a la derecha, el buscador (en el teléfono, solo el icono) y un menú de preferencias con el tema y el idioma. El catálogo usa el ancho de página común, con su menú sin saltos de línea (en el teléfono, una línea que se desplaza de lado), y «Colores» muestra los tokens en filas de documento bajo divisores de sección.

### Desviaciones

- S1: `components/tooltip.ts` entró en T1. Al abrir el menú, el tooltip del botón quedaba como una píldora vacía; ahora un tooltip se oculta cuando su texto queda vacío mientras se ve, lo que sirve también a cualquier botón cuyo motivo de bloqueo desaparece bajo el puntero.
- En escritorio el menú del catálogo queda fijo al desplazarse, algo que la spec no pedía pero que sigue el patrón del índice de la revisión.

### Decisiones

- Popover nativo (`popover` y `popovertarget`) en lugar de `sp-menu`: el menú tiene grupos de opciones, no acciones, y el navegador da el cierre con Escape o al pulsar fuera, el orden de tabulación tras el botón y la vuelta del foco. Se abre con `popovertarget` porque abrirlo desde código hace que pulsar el botón con el menú abierto lo cierre y lo vuelva a abrir.
- El panel no lleva ninguna utilidad de `display`: el navegador lo oculta mientras está cerrado y una clase `flex` lo mostraría siempre. Va `fixed` bajo la cabecera, que nunca se desplaza, sin posicionamiento por ancla.
- En el teléfono el buscador es un `sp-icon-button` y desde 640 px un `sp-button` con texto: un solo botón con el texto oculto quedaba rectangular junto al de preferencias.
- El evento `toggle` se lee por su campo `newState`, no con `instanceof ToggleEvent`, porque jsdom no define esa clase.

### Pendientes

- El cambio siguiente: la página del cambio y la revisión en el teléfono (cabecera amplia con el título de cuatro líneas y la franja de datos que se rompe, la redacción de «Esfuerzo recomendado», el índice «Contenido» que tapa el texto y las marcas a la derecha que estrechan los ítems en la revisión y el delta).
- En el teléfono, si la entrada activa del menú del catálogo queda fuera de la vista al entrar directamente (por ejemplo, «Patrones»), no se desplaza hasta ella.
