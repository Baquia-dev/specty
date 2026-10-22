---
kind: standard
follows:
  - 20261022-prototipo-delta-de-la-revision
---

# Armazón común: área de contenido posicionada y margen inferior

## Objetivo

El armazón común de la UI resuelve dos cosas que hoy arregla cada página por su cuenta. El área de contenido que se desplaza queda posicionada, así que ningún elemento absoluto (como el texto para lectores de pantalla) puede salirse de ella y hacer que la página entera se desplace. Y todas las páginas terminan con el mismo margen inferior, para que el contenido nunca quede pegado al borde de la ventana.

## Fuera de alcance

- Quitar el `relative` que la revisión y el delta ya llevan: sigue protegiéndolos cuando se muestran sin este armazón (por ejemplo, en una webview del editor).
- Cambios en la cabecera, el desplazamiento o el foco al navegar.

## Supuestos

- A1: El margen inferior común es de 4 rem (el de la página del cambio), y la Bandeja y el catálogo dejan de poner el suyo.
- A2: El margen va en el propio contenedor que se desplaza (`main`): los navegadores actuales lo cuentan dentro de lo que se puede desplazar, y la barra fija de la revisión no cambia porque se mide por su ancho.

## Criterios de aceptación

- AC1: CUANDO cualquier página tiene un elemento con posición absoluta (por ejemplo, el texto oculto para lectores de pantalla) ENTONCES queda dentro del área de contenido y solo esa área se desplaza, nunca la página entera.
- AC2: CUANDO se llega al final de cualquier página (Bandeja, catálogo, cambio) ENTONCES el contenido termina con el mismo margen inferior, puesto por el armazón y no por cada página.

## Archivos

- modificar packages/ui/src/app/shell.ts — área de contenido posicionada y con margen inferior
- modificar packages/ui/src/app/shell.test.ts — tests del armazón
- modificar packages/ui/src/inbox/inbox.ts — sin margen inferior propio
- modificar packages/ui/src/catalog/catalog.ts — sin margen inferior propio
- modificar packages/ui/src/change/change-page.ts — sin margen inferior propio
- modificar packages/ui/src/change/change-page.test.ts — el margen ya no es de la página

## Tareas

- [x] T1: El armazón posiciona el área de contenido y pone el margen inferior
  - files: packages/ui/src/app/shell.ts, packages/ui/src/app/shell.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Las páginas dejan de poner su propio margen inferior
  - files: packages/ui/src/inbox/inbox.ts, packages/ui/src/catalog/catalog.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts
  - ac: AC2
  - verify: pnpm check
  - notes: Comprobar en el navegador que `html` no se desplaza (scrollHeight igual a clientHeight) en la Bandeja, el catálogo, un cambio y su delta, y que el final de cada página deja el mismo margen.

## Cierre

### Resumen

- El `main` del armazón es `relative` y lleva `pb-16`: el contenido absoluto ya no puede salirse del área que se desplaza, y todas las páginas terminan con el mismo margen inferior.
- La Bandeja, el catálogo y la página del cambio dejan de poner su propio margen inferior.
- Comprobado en Chrome sin interfaz en la Bandeja, el catálogo, un cambio y su delta: `html` no se desplaza y quedan 64 px al final. 160 tests en la UI.

### Desviaciones

- La tarea única se dividió en dos (armazón; páginas) por el aviso de Specty sobre el número de archivos por tarea (revisión 2 de la spec).
- El test del armazón comprueba la Bandeja y el catálogo, no la página del cambio: su router no enlaza los parámetros de ruta como inputs. La página del cambio lo comprueba en su propio test, y la Bandeja también en el suyo (test implícito).

### Decisiones

- El margen va en el propio `main`, no en un envoltorio: los navegadores lo cuentan dentro de lo desplazable y la barra fija de la revisión, que se mide por su ancho, no cambia.
- Se mantiene el `relative` de la revisión y del delta, para cuando se muestren sin este armazón (por ejemplo, en una webview del editor).

### Pendientes

- Pulir el diff del delta: separar la puntuación, aligerar los ítems añadidos y quitar la línea "impacto: alto" repetida.
- Siguiente pantalla de la fase 2: progreso.
- Mejoras de Specty anotadas: esfuerzo ajustado por el modelo, recomendar revisar la spec con un modelo más capaz y el guard que lee el cuerpo de los heredoc como comandos.
