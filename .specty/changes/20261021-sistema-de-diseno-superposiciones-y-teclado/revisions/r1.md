---
kind: standard
follows:
  - 20261021-sistema-de-diseno-componentes-base
---

# Sistema de diseño: superposiciones y teclado

## Objetivo

Completar el sistema de diseño con las piezas que flotan sobre la página o responden al teclado: diálogo, menú, avisos, pestañas, plegable, paleta de comandos (⌘K) y un registro de atajos (`j`/`k`, `?`). El tooltip pasa al overlay del CDK para no salirse de la pantalla. Con esto, el prototipo de la fase 2 puede construirse solo con componentes del sistema, y "Teclado primero" (principio 6 de ui.md) queda resuelto en un único lugar.

## Fuera de alcance

- Comandos y atajos de las pantallas del producto: aquí solo se registran los del catálogo.
- Avisos que llegan del servidor (SSE): llegarán con la UI en vivo.
- Selector de formulario, autocompletado de campos, popover genérico y arrastrar y soltar.
- Variante "peligro" del botón.

## Supuestos

- A1: Atajos globales: `mod+k` abre la paleta, `?` abre la lista de atajos, `j`/`k` mueven la selección en las listas que los registran y Escape cierra lo que esté abierto. `mod` es `⌘` en macOS y `Ctrl` en el resto.
  - impacto: alto
- A2: Avisos: abajo a la derecha, como máximo 3 visibles. Se van solos a los 5 s, salvo con el puntero o el foco encima. Los de error se quedan hasta cerrarlos.
  - impacto: alto
- A3: Las piezas interactivas son componentes (decisión del cambio anterior): `<sp-tabs>`, `<sp-tab-panel>`, `<sp-collapsible>`, `<sp-menu>`, `<sp-dialog>`, `<sp-toaster>` y `<sp-command-palette>`. Por dentro usan Angular Aria (pestañas, menú, combobox y listbox) y el CDK (diálogo y overlay). Donde Aria no encaje con la proyección de contenido, se implementa el patrón de WAI-ARIA con los mismos criterios de teclado.
- A4: Se añaden `@angular/aria`, `@angular/cdk` y `@angular/forms` (dependencia del CDK) en 22.2.3, publicadas hace más de una semana. El CDK carga solo los estilos estructurales del overlay, así que `styles.css` no cambia.
- A5: El fondo de los diálogos es negro al 40 % en ambos temas. Las entradas y salidas de diálogos, menús y avisos duran como mucho 200 ms, y nada si el sistema pide movimiento reducido.

## Criterios de aceptación

- AC1: CUANDO se abre un diálogo ENTONCES se anuncia con su título (`role="dialog"`, `aria-modal`, `aria-labelledby`), el foco entra en él y no sale mientras está abierto, el fondo queda oscurecido e inerte, Escape o su botón de cerrar lo cierran, y el foco vuelve al elemento que lo abrió.
- AC2: CUANDO un tooltip no cabe en su posición preferida ENTONCES se recoloca sin salirse de la pantalla, y sigue cumpliendo lo del cambio anterior (`aria-describedby`, se mantiene con el puntero encima y Escape lo cierra).
- AC3: CUANDO se usan pestañas ENTONCES las flechas izquierda y derecha se mueven entre ellas, Inicio y Fin van a los extremos, solo la pestaña activa está en el orden de tabulación, cada panel se asocia a su pestaña, y la pestaña activa se enlaza en dos sentidos.
- AC4: CUANDO se pliega o despliega un plegable ENTONCES su botón refleja `aria-expanded`, el contenido plegado no es alcanzable ni con el teclado ni con un lector de pantalla, y la transición dura como mucho 200 ms (nada con movimiento reducido).
- AC5: CUANDO se abre un menú con su botón (clic, Enter, Espacio o flecha abajo) ENTONCES el foco va al primer ítem, las flechas los recorren, escribir una letra salta al ítem que empieza por ella, Escape cierra y devuelve el foco al botón, elegir un ítem emite su id y cierra, y el menú se coloca sin salirse de la pantalla.
- AC6: CUANDO se muestra un aviso ENTONCES se anuncia en una región viva (cortés; los errores, asertiva), lleva icono y texto según su tipo (información, éxito, aviso o error), se puede cerrar con su botón, y cumple A2 en duración, posición y número máximo.
- AC7: CUANDO la persona pulsa un atajo registrado ENTONCES se ejecuta su acción, salvo si está escribiendo en un campo (excepto `mod+k` y Escape); el atajo deja de existir al destruirse el componente que lo registró, y `?` muestra en un diálogo todos los atajos activos con `sp-kbd`.
- AC8: CUANDO se pulsa `mod+k` ENTONCES se abre la paleta con su campo enfocado; escribir filtra los comandos sin distinguir tildes ni mayúsculas, las flechas recorren los resultados, Enter ejecuta el comando elegido y cierra, cada comando muestra su atajo si lo tiene, y si no hay resultados lo dice.
- AC9: CUANDO se abre la página Superposiciones y teclado del catálogo ENTONCES muestra cada pieza en uso; además, en todo el catálogo `mod+k` ofrece ir a cada página y cambiar tema e idioma, y en la página de ejemplo `j`/`k` mueven la selección por una lista de tarjetas.

## Diseño

- **Diálogo** (`dialog.ts`):
  - Servicio `Dialogs` sobre el `Dialog` del CDK, con `open(componente, datos)`.
  - `<sp-dialog>` es el marco: título, descripción opcional, contenido y acciones proyectadas, y un `sp-icon-button` para cerrar.
  - El CDK aporta la trampa de foco, Escape, el fondo y la devolución del foco.
- **Tooltip** (`tooltip.ts`): conserva su API. El texto se pinta en un overlay conectado del CDK con posiciones de respaldo (arriba, abajo, derecha, izquierda) y se reposiciona al desplazarse. Su id sigue enlazado por `aria-describedby`.
- **Pestañas** (`tabs.ts`):
  - `<sp-tabs [(selected)]>` con `<sp-tab-panel id label>` proyectados. `sp-tabs` lee sus paneles con `contentChildren` y dibuja la lista de pestañas.
  - Aria `Tabs` va como `hostDirective` cuando encaje; si no, se aplica el patrón de WAI-ARIA (A3).
- **Plegable** (`collapsible.ts`): `<sp-collapsible label [(open)]>`, con un `<button aria-expanded aria-controls>` y una región. El contenido plegado queda `inert` y oculto, y la altura se anima con `grid-template-rows` y `--duration-base`.
- **Menú** (`menu.ts`): `<sp-menu [items] label icon (selected)>`, con Aria `MenuTrigger`, `Menu` y `MenuItem` en su propia plantilla y la ventana en un overlay conectado del CDK.
- **Avisos** (`toast.ts`): servicio `Toasts` (`show({ kind, text, action? })`) y `<sp-toaster>`, colocado una vez en la raíz. Tiene dos regiones vivas, `polite` y `assertive`, y cada aviso un temporizador que se pausa con el puntero o el foco.
- **Atajos** (`keyboard/shortcuts.ts`):
  - Servicio `Shortcuts` con `register(keys, descripción, acción)`, que se libera solo con el `DestroyRef` de quien registra.
  - Un único `keydown` en `document` normaliza la tecla (`mod`, `shift`, `alt`) e ignora los campos de texto, salvo `mod+k` y Escape.
  - Registra `?`, que abre el diálogo de atajos.
- **Paleta** (`command-palette.ts`):
  - Servicio `Commands` con `register({ id, label: { es, en }, keys?, run })` y `<sp-command-palette>` en un diálogo.
  - Por dentro, Aria `Combobox` (`alwaysExpanded`) y `Listbox`.
  - El filtro usa `fold` de core (sin tildes ni mayúsculas), y cada opción muestra su `sp-kbd`.
- **Catálogo**:
  - Página `catalog/overlays.ts` en `/catalog/overlays`.
  - El armazón (`catalog.ts`) coloca `sp-toaster`, registra `mod+k` y los comandos de navegación, tema e idioma, y añade el enlace.
  - Los `j`/`k` de ejemplo usan `sp-card` con `selected`.

## Archivos

- modificar packages/ui/package.json — @angular/aria, @angular/cdk y @angular/forms
- crear packages/ui/src/components/dialog.ts — servicio Dialogs y marco sp-dialog
- modificar packages/ui/src/components/tooltip.ts — texto en un overlay conectado del CDK
- crear packages/ui/src/components/tabs.ts — sp-tabs y sp-tab-panel
- crear packages/ui/src/components/collapsible.ts — sp-collapsible
- crear packages/ui/src/components/menu.ts — sp-menu
- crear packages/ui/src/components/toast.ts — servicio Toasts y sp-toaster
- crear packages/ui/src/keyboard/shortcuts.ts — registro de atajos y diálogo de ayuda
- crear packages/ui/src/components/command-palette.ts — servicio Commands y sp-command-palette
- crear packages/ui/src/catalog/overlays.ts — página Superposiciones y teclado
- modificar packages/ui/src/catalog/catalog.ts — toaster, paleta, comandos del catálogo y enlace

## Tareas

- [ ] T1: Diálogo y tooltip sobre el CDK
  - files: packages/ui/package.json, packages/ui/src/components/dialog.ts, packages/ui/src/components/tooltip.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T2: Pestañas, plegable y menú
  - files: packages/ui/src/components/tabs.ts, packages/ui/src/components/collapsible.ts, packages/ui/src/components/menu.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T3: Avisos, atajos y paleta de comandos
  - files: packages/ui/src/components/toast.ts, packages/ui/src/keyboard/shortcuts.ts, packages/ui/src/components/command-palette.ts
  - ac: AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T4: Página Superposiciones y teclado, y ⌘K en el catálogo
  - files: packages/ui/src/catalog/overlays.ts, packages/ui/src/catalog/catalog.ts
  - ac: AC9
  - verify: pnpm check

## Riesgos

- R1: Angular Aria es reciente y su API puede cambiar entre versiones menores. Mitigación: versión fijada, uso encerrado dentro de nuestros componentes y tests de teclado sobre el resultado, no sobre Aria.
- R2: jsdom no calcula posiciones, así que los tests no pueden comprobar que un overlay no se sale de la pantalla. Mitigación: se comprueban las posiciones de respaldo configuradas y se revisa en el navegador antes de aceptar.
- R3: Si `hostDirectives` de Aria no funciona con paneles proyectados, las pestañas siguen el patrón de WAI-ARIA propio (A3), con más código. Mitigación: se decide en T2 con un test de teclado que ya valga para las dos variantes.
- R4: El CDK y Aria aumentan el bundle (hoy, 82 kB transferidos). Mitigación: se comprueba el presupuesto con `ng build` en T4.
