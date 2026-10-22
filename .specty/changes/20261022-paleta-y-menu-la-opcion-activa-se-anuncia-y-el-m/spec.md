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
- [ ] T3: El select usa la misma colocación
  - files: packages/ui/src/components/select.ts, packages/ui/src/components/select.test.ts, docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador el select del catálogo y el de la Bandeja, cerca del borde inferior.
