---
kind: standard
follows:
  - 20261022-sistema-de-diseno-select-propio-en-el-catalogo-y
---

# Paleta y menú: la opción activa se anuncia y el menú se coloca junto a su botón

## Objetivo

Comprobado en el navegador, al cerrar el cambio del select:

- **Paleta de comandos:** al pulsar ↓, el foco sale del buscador y salta a las opciones, de modo que lo que se escribe después ya no filtra, y el lector de pantalla no anuncia la opción activa.
- **Menú (`sp-menu`):** se queda donde estaba al cargar la página, porque no sigue el desplazamiento del contenido; tras desplazar 100 px aparece 140 px por debajo de su botón. Además, si no cabe debajo, no se abre encima y queda fuera de la pantalla.

Este cambio arregla los dos problemas y comparte con el select la forma de colocar su lista.

## Fuera de alcance

- Otros componentes con superposición (tooltip, diálogo, avisos): no se ven afectados, porque se abren y se cierran en lugar de quedar siempre adjuntos.
- Registrar el `main` del armazón como contenedor desplazable del CDK.

## Supuestos

- A1: La paleta mantiene el foco en el buscador mientras se recorre con las flechas, como el select: la opción activa se anuncia por `aria-activedescendant` (`focusMode="activedescendant"` en su listbox).
- A2: El menú sigue moviendo el foco a sus elementos, como pide el patrón de menú; solo cambia su colocación.

## Criterios de aceptación

- AC1: CUANDO la persona recorre la paleta con las flechas ENTONCES el foco se queda en el buscador, puede seguir escribiendo para filtrar y la opción activa se anuncia (`aria-activedescendant`).
- AC2: CUANDO se abre un menú después de desplazar la página ENTONCES aparece junto a su botón.
- AC3: CUANDO un menú no cabe debajo de su botón ENTONCES se abre encima, y mientras está abierto sigue al botón si la página se desplaza.
- AC4: CUANDO se abre el select ENTONCES se coloca como hasta ahora (debajo, o encima si no cabe), ahora con la misma lógica que el menú.

## Diseño

- **Seguir al botón** (`components/overlay-follow.ts`): `followOrigin(open, overlay)`, que se llama en el constructor. Mientras `open()` es verdadero, recoloca la superposición al abrir, cuando cambia el tamaño de su panel (`ResizeObserver`) y con cada desplazamiento (escucha en fase de captura). Al cerrarse deja de escuchar. Es la lógica que hoy tiene el select, en un solo sitio.
- **Menú** (`components/menu.ts`) y **select** (`components/select.ts`): usan `followOrigin`.
- **Paleta** (`components/command-palette.ts`): `focusMode="activedescendant"` en su listbox.

## Archivos

- crear packages/ui/src/components/overlay-follow.ts — colocar una superposición junto a su origen mientras está abierta
- crear packages/ui/src/components/overlay-follow.test.ts — tests de la colocación
- modificar packages/ui/src/components/menu.ts — el menú sigue a su botón
- modificar packages/ui/src/components/menu.test.ts — test del menú
- modificar packages/ui/src/components/select.ts — usar la lógica compartida
- modificar packages/ui/src/components/select.test.ts — el select se recoloca al abrir y al desplazar
- modificar packages/ui/src/components/command-palette.ts — el foco se queda en el buscador
- modificar packages/ui/src/components/command-palette.test.ts — test de la paleta
- modificar docs/ui.md — paleta y superposiciones

## Tareas

- [x] T1: La paleta anuncia la opción activa y el foco se queda en el buscador
  - files: packages/ui/src/components/command-palette.ts, packages/ui/src/components/command-palette.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/command-palette.test.ts
- [x] T2: El menú se coloca junto a su botón
  - files: packages/ui/src/components/overlay-follow.ts, packages/ui/src/components/overlay-follow.test.ts, packages/ui/src/components/menu.ts, packages/ui/src/components/menu.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/overlay-follow.test.ts --include src/components/menu.test.ts
  - notes: Comprobar en el navegador con el menú del catálogo («Superposiciones y teclado») tras desplazar y en una ventana baja.
- [x] T3: El select usa la misma colocación
  - files: packages/ui/src/components/select.ts, packages/ui/src/components/select.test.ts, docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador el select del catálogo y el de la Bandeja, cerca del borde inferior.

## Cierre

### Resumen

- **Paleta de comandos:** mantiene el foco en el buscador mientras las flechas recorren sus resultados, así que se puede seguir escribiendo para filtrar, y anuncia la opción activa.
- **Menú:** se abre junto a su botón aunque la página se haya desplazado, y encima de él cuando no cabe debajo.
- **Colocación compartida:** el menú y el select usan la misma lógica, `followOrigin`.

### Desviaciones

- La revisión 3 de la spec dividió la tarea del menú y el select en dos (T2 y T3), por el aviso de tamaño de Specty, y añadió a T3 el test del select.
- Un archivo provisional se escribió por error en una ruta mal tecleada, fuera del repositorio (`…/Jorge Palacio/Projectos/…`). Se comprobó que la carpeta era nueva y solo lo contenía a él, y se borró.

### Decisiones

- **`followOrigin`:** recibe la condición de apertura y la superposición, y se llama en el constructor. Mientras la superposición está abierta, la recoloca al abrir, cuando cambia el tamaño del panel y con cada desplazamiento. Escucha el desplazamiento en fase de captura, para que cuente el `main` del armazón sin registrarlo en el CDK.
- **Foco en la paleta:** la paleta, como el select, usa `focusMode="activedescendant"`. El menú sigue moviendo el foco a sus elementos, como pide su patrón.

### Pendientes

- Las pestañas Progreso, Aceptación e Historial (fase 2), siguiente paso acordado.
