---
kind: standard
follows:
  - 20261022-armazon-y-catalogo-cabecera-en-una-linea-y-menu
---

# Cambio y revisión en el teléfono: cabecera, franja de datos, índice y filas

## Objetivo

En el teléfono, la página del cambio y su revisión se rompen:

- el título ocupa cuatro líneas;
- la franja de datos queda con líneas descolocadas y la etiqueta «Esfuerzo recomendado» partida;
- el índice «Contenido» se queda fijo encima del texto;
- las marcas de la derecha («Modificado», «Por decidir») estrechan cada ítem a una columna de pocas palabras;
- «Comentar» no se ve en pantallas táctiles.

Este cambio deja la página legible en cualquier ancho y aclara el esfuerzo.

## Fuera de alcance

- La barra compacta del cambio, que ya se adapta al teléfono.
- La salida del CLI sobre el esfuerzo: su redacción cambia en el cambio pendiente sobre el esfuerzo recomendado por el modelo.
- Un degradado en el borde de las líneas que se desplazan de lado (fases de la Bandeja, menú del catálogo).
- Las pestañas Progreso, Aceptación e Historial.

## Supuestos

- A1: Por debajo de 640 px, cada ítem de la revisión y del delta ocupa dos líneas: arriba, su id y, a la derecha, sus marcas y acciones; debajo, el texto a todo el ancho. Desde 640 px sigue como hoy: id, texto y marcas en columnas.
  - impacto: alto
- A2: «Esfuerzo recomendado» pasa a «Esfuerzo», con dos líneas, «Implementar medio» y «Revisar alto». En borrador, la segunda línea dice «Planificar alto». Una vez escrita la spec, el nivel de planificación sirve para ajustarla y para decidir el alcance; por eso se llama «Revisar».
  - impacto: alto
- A3: En pantallas táctiles (puntero grueso), «Comentar» se ve siempre en cada ítem, porque no hay puntero que lo revele.
- A4: El índice «Contenido» se fija solo desde 768 px, donde queda al lado del documento; en pantallas más estrechas va encima y se desplaza con él.
- A5: La franja de datos usa dos columnas en el teléfono y tres desde 640 px, sin líneas verticales; desde 1024 px, una sola fila con líneas finas entre datos.

## Criterios de aceptación

- AC1: CUANDO se abre un cambio en una pantalla de menos de 640 px ENTONCES el título usa un tamaño menor (28 px en lugar de 38 px) y la línea de fase no deja un «·» suelto: el tiempo pasa a su propia línea.
- AC2: CUANDO la franja de datos no cabe en una fila ENTONCES se muestra en una rejilla de dos o tres columnas sin líneas verticales; CUANDO cabe (desde 1024 px) ENTONCES va en una sola fila con líneas finas entre los datos.
- AC3: CUANDO el cambio tiene esfuerzo recomendado ENTONCES la franja muestra «Esfuerzo» con «Implementar» y «Revisar» («Planificar» en borrador), cada uno con su nivel, y la etiqueta no se parte.
- AC4: CUANDO la revisión se ve en una pantalla de menos de 768 px ENTONCES el índice «Contenido» va encima del documento y se desplaza con él, sin taparlo.
- AC5: CUANDO un ítem de la revisión o del delta se ve en una pantalla de menos de 640 px ENTONCES su id y sus marcas o acciones comparten la primera línea y el texto ocupa todo el ancho debajo.
- AC6: CUANDO la pantalla es táctil ENTONCES «Comentar» se ve siempre en cada ítem.

## Diseño

- **Filas** (`components/document.ts`): `ROW` cambia sus columnas en el teléfono a `minmax(0,1fr) auto`; su segundo hijo, el contenido, ocupa las dos columnas en la segunda línea. Todas las filas de la revisión y del delta tienen la forma «id, contenido, marcas o acciones», así que basta con cambiar `ROW`. `REVEAL` añade `pointer-coarse:opacity-100`.
- **Índice** (`review/spec-review.ts`): `sticky` pasa a `md:sticky`.
- **Cabecera** (`change/change-page.ts`):
  - el título a 1.75 rem por debajo de `sm`;
  - el «·» solo desde `sm` y el tiempo a lo ancho en el teléfono;
  - la franja en rejilla `grid-cols-2 sm:grid-cols-3` que desde `lg` pasa a una fila (`grid-flow-col auto-cols-fr`) con `border-l` entre los datos;
  - el esfuerzo como dos pares etiqueta-nivel.

## Archivos

- modificar packages/ui/src/components/document.ts — filas en dos líneas en el teléfono y «Comentar» visible en pantallas táctiles
- modificar packages/ui/src/components/document.test.ts — tests de las filas
- modificar packages/ui/src/review/spec-review.ts — índice fijo solo desde 768 px
- modificar packages/ui/src/review/spec-review.test.ts — test del índice
- modificar packages/ui/src/change/change-page.ts — cabecera, franja de datos y esfuerzo
- modificar packages/ui/src/change/change-page.test.ts — tests de la cabecera
- modificar docs/ui.md — la página del cambio en el teléfono

## Tareas

- [x] T1: Filas e índice de la revisión en el teléfono
  - files: packages/ui/src/components/document.ts, packages/ui/src/components/document.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review.test.ts, docs/ui.md
  - ac: AC4, AC5, AC6
  - verify: pnpm check
  - notes: Comprobar en el navegador a 390 y 1280 px, en claro y oscuro: la revisión completa y el delta, el índice al desplazarse, y la página «Patrones» del catálogo, que también usa estas filas.
- [ ] T2: Cabecera del cambio, franja de datos y esfuerzo
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador a 390, 768 y 1280 px un cambio en revisión, uno en implementación y uno en borrador.
