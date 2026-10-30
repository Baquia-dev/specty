---
kind: standard
---

# Tooltip con estilo de viñeta y jerarquía en siglas de la UI

## Objetivo

Mejorar la presentación y usabilidad de los tooltips de siglas (`A`, `AC`, `T`, `R`, `S`, `C`) en la UI de Specty, presentando el tooltip flotante con estilo de viñeta y jerarquía visual clara (tipo e identificador destacados frente al contenido descriptivo) y dotando al elemento detonador de un efecto visual al pasar el ratón encima con cursor de información.

## Fuera de alcance

- Alterar los textos o traducciones de las siglas ya definidas en el modelo.
- Modificar el comportamiento de cierre por escape o el retardo de gracia del overlay.

## Supuestos

- A1: El cursor de información se representa mediante el valor estándar `help` en CSS (que los sistemas operativos muestran como flecha con indicador de ayuda/información contextual).
- A2: La jerarquía visual en el tooltip separa el encabezado (tipo completo e identificador con viñeta o bullet indicador) de la descripción asociada, preservando la compatibilidad textual (`textContent`) esperada por las pruebas existentes.

## Criterios de aceptación

- AC1: CUANDO la persona pasa el puntero sobre una sigla o elemento referenciado (`[data-item-ref]` o nodo de sigla resuelto) ENTONCES el elemento muestra un cursor de información (`cursor: help`) y un efecto visual interactivo de resalte sobre su fondo o borde.
- AC2: CUANDO se despliega el tooltip flotante ENTONCES su contenedor presenta estilo de viñeta con bordes redondeados, sombra y padding refinados, incorporando una viñeta o indicador visual junto a la cabecera.
- AC3: CUANDO el ítem referenciado tiene contenido asociado ENTONCES el tooltip muestra una clara jerarquía visual distinguiendo el tipo e identificador en el encabezado respecto al texto descriptivo a continuación.

## Diseño

- En `packages/ui/src/styles.css`:
  - Reglas para `[data-item-ref]` y `[data-item-active]` que definen `cursor: help;`, bordes redondeados suaves (`rounded-xs` / `var(--radius-sm)`), transición suave y resalte de fondo en `:hover` / activo con contraste adecuado tanto en tema claro como oscuro.
- En `packages/ui/src/components/item-tooltip.ts`:
  - En la directiva `ItemTooltips`, al detectar hover (`showTarget`) se aplica el atributo `data-item-active` al elemento origen (`target.origin`), removiéndolo al cerrar (`hide`), asegurando el efecto y cursor tanto en referencias explícitas como en siglas inferidas.
  - La burbuja del tooltip (`ItemTooltipBubble` / `ensureOverlay`) estructura el contenido en dos niveles: un encabezado con bullet/viñeta (`aria-hidden="true"`) y texto en seminegrita para `<Tipo> <ID>`, seguido de un bloque con peso normal y tipografía diferenciada para el contenido cuando existe texto asociado.
  - Se garantiza que `bubble.textContent?.trim()` continúe devolviendo `<Tipo> <ID>: <contenido>` (o `<Tipo> <ID>`), manteniendo compatibilidad total con todas las suites de pruebas.

## Archivos

- modificar packages/ui/src/styles.css — reglas de cursor de información y efecto hover en elementos con siglas
- modificar packages/ui/src/components/item-tooltip.ts — jerarquía visual en el tooltip con estilo de viñeta y gestión del estado activo en el detonador
- modificar packages/ui/src/components/item-tooltip.test.ts — pruebas del cursor de información, efecto activo y estructura visual jerárquica del tooltip

## Tareas

- [x] T1: Efecto interactivo y cursor de información en elementos detonadores de siglas
  - files: packages/ui/src/styles.css, packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts
- [x] T2: Estilo de viñeta y jerarquía visual en la burbuja del tooltip flotante
  - files: packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts

## Cierre

### Resumen

Se mejoraron los tooltips contextuales de siglas (`A`, `AC`, `T`, `R`, `S`, `C`) dotando al contenedor flotante de un estilo de viñeta con viñeta indicadora (`data-item-bullet`), encabezado en seminegrita (`data-item-header`) y cuerpo descriptivo diferenciado (`data-item-body`), y añadiendo el cursor de información (`cursor: help`) y resalte visual interactivo en hover y estado activo (`data-item-active`) para todos los elementos con siglas.

### Desviaciones

- Ninguna respecto al plan original.

### Decisiones

- Se utilizó el cursor estándar `help` en `styles.css` y `ItemText` para denotar ayuda e información contextual al pasar el ratón.
- La estructura del DOM en la burbuja del tooltip preserva el `textContent` concatenado (`<Tipo> <ID>: <contenido>`), manteniendo compatibilidad total con todas las suites de pruebas existentes.

### Pendientes

- Ninguno.
