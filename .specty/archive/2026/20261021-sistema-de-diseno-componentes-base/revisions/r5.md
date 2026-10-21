---
kind: standard
follows:
  - 20261021-sistema-de-diseno-tokens-y-catalogo
---

# Sistema de diseño: componentes base

## Objetivo

Añadir a `packages/ui` los componentes base de la dirección Tinta: botón, insignias (incluida la de fase), Kbd, tooltip, tarjeta, campo y esqueleto de carga. Los usarán el prototipo y las pantallas, y el catálogo los muestra en una página nueva, Componentes, con sus variantes y estados.

## Fuera de alcance

- Superposiciones (diálogo, menú, avisos), pestañas, plegables, paleta ⌘K y registro de atajos: cambio siguiente.
- Variante de botón "peligro" y su token de color: llegará con la primera acción destructiva (cancelar un cambio).
- Pantallas del producto y capa de datos.

## Supuestos

- A1: Decidido por la persona en la revisión 1: un botón deshabilitado usa `disabled` y `aria-disabled` a la vez. Se ve deshabilitado, no se puede enfocar ni activar, y explica el motivo en un tooltip. Así cumple el principio 5 de ui.md ("si está deshabilitada, dice por qué").
- A2: Decidido por la persona en la revisión 1: los componentes interactivos son componentes, no directivas. Se interpreta como componentes de elemento con prefijo `sp` (`<sp-button>`, `<sp-icon-button>`, `<sp-tooltip>`, `<sp-field>`) que dibujan dentro el elemento nativo (`<button>`, `<input>`, `<textarea>`), para conservar su semántica y su teclado.
  - impacto: alto
- A3: El tooltip se hace sin el CDK: aparece encima del elemento, o debajo si no cabe, y basta para textos cortos. El posicionamiento con colisiones llegará con el CDK en el cambio siguiente.
- A4: Kbd escribe `mod` como `⌘` en macOS y como `Ctrl` en el resto.
- A5: Los tests van junto a cada fuente (`*.test.ts`), como en el cambio anterior.

## Criterios de aceptación

- AC1: CUANDO se usa `sp-button` ENTONCES dibuja un `<button>` nativo con las variantes primaria, secundaria y fantasma, los tamaños `sm` y `md` y los tokens de Tinta, y emite su acción al activarlo con clic, Enter o Espacio; al pulsarlo con el puntero (clic o mantener presionado) muestra una onda (ripple) desde el punto de contacto, que crece mientras se mantiene y se desvanece al soltar, en 200 ms como máximo y sin animación si el sistema pide movimiento reducido; `sp-icon-button` exige una etiqueta accesible, y sin ella la plantilla no compila.
- AC2: CUANDO un botón está deshabilitado con un motivo ENTONCES su `<button>` lleva `disabled` y `aria-disabled="true"`, se ve deshabilitado, no se puede enfocar ni activar, y al pasar el cursor sobre él aparece un tooltip con el motivo, que además queda como su descripción accesible (`aria-describedby`).
- AC3: CUANDO el puntero o el foco llegan al contenido de un `sp-tooltip` ENTONCES el tooltip aparece asociado por `aria-describedby` a su elemento enfocable, se mantiene mientras el puntero esté sobre el contenido o sobre el propio tooltip, y Escape lo cierra (WCAG 1.4.13).
- AC4: CUANDO se muestra una insignia de fase ENTONCES lleva el icono, el nombre de la fase en el idioma actual y sus colores, para las ocho fases; la insignia neutra sirve para tamaños y conteos.
- AC5: CUANDO se muestra un atajo con Kbd ENTONCES cada tecla aparece por separado, con `mod` adaptado a la plataforma, y el lector de pantalla lee el atajo completo.
- AC6: CUANDO un componente tiene el foco del teclado (botón, campo, enlace de navegación…) o una tarjeta está seleccionada ENTONCES el indicador se dibuja sobre el borde original del componente, nunca por fuera, con el color de foco: un negro mate agrisado en claro y un blanco mate agrisado en oscuro, ni blanco ni negro puros, invertido sobre el acento (botón primario), que contrasta al menos 3:1 con el fondo, la superficie y el borde, y su versión invertida con el acento, en claro y en oscuro; la tarjeta seleccionada además lo anuncia con `aria-current`.
- AC7: CUANDO se usa `sp-field` con etiqueta, ayuda o error ENTONCES dibuja un `<input>` o un `<textarea>` nativo con su valor enlazable en dos sentidos; la etiqueta se asocia al control, la ayuda y el error quedan en `aria-describedby`, el control lleva `aria-invalid` si hay error, y el error se muestra con icono y texto, no solo con color.
- AC8: CUANDO algo está cargando ENTONCES el esqueleto ocupa el tamaño indicado, se anuncia una sola vez como "cargando" y no se anima si el sistema pide movimiento reducido.
- AC9: CUANDO se abre la página Componentes del catálogo ENTONCES muestra cada componente con sus variantes y estados (normal, foco, deshabilitado con motivo, error, seleccionado, cargando), en el tema y el idioma elegidos.

## Diseño

- `components/` en `packages/ui/src`, un archivo por componente, standalone y `OnPush`, con estilos de Tailwind sobre los tokens y textos con `Preferences.t()`.
- **Botón** (`button.ts`):
  - `<sp-button>` dibuja un `<button>` nativo y tiene las entradas `variant`, `size`, `type` (`button` o `submit`) y `disabledReason`, y la salida `pressed`.
  - No hay un `disabled` sin motivo: con `disabledReason`, el `<button>` lleva `disabled` y `aria-disabled="true"`.
  - Los navegadores no envían eventos de puntero a un `<button disabled>`. Por eso el botón va envuelto en un `sp-tooltip`, cuyo elemento anfitrión sí recibe el puntero y muestra el motivo.
  - `<sp-icon-button>` tiene `label` e `icon` como entradas obligatorias; `label` se usa como `aria-label` y como tooltip.
- **Tooltip** (`tooltip.ts`):
  - `<sp-tooltip text="…">` envuelve su contenido proyectado y dibuja el tooltip con un id estable y `role="tooltip"`.
  - Pone `aria-describedby` en el primer elemento enfocable del contenido, o en el `<button>` aunque esté deshabilitado.
  - Aparece al entrar el puntero o el foco en el anfitrión, y se cierra con Escape, al salir o al perder el foco. Usa la duración `--duration-fast`.
- **Insignias** (`badge.ts`): `sp-badge`, neutra, y `sp-phase-badge [phase]`. El mapa de iconos por fase se mueve aquí desde `catalog/colors.ts`, y la página Colores pasa a usar `sp-phase-badge`.
- **Kbd** (`kbd.ts`): `sp-kbd keys="mod+k"`. Cada tecla va en un `<kbd>`, y el conjunto lleva `aria-label` con el atajo legible ("Comando K" o "Control K").
- **Tarjeta** (`card.ts`): `sp-card`, una superficie con borde y radio `xl`, con la entrada `selected`, que añade el anillo y `aria-current="true"`.
- **Campo** (`field.ts`): `<sp-field>` con las entradas `label`, `hint`, `error`, `multiline` y `placeholder`, y `value` como `model()` para el enlace en dos sentidos. Dibuja la etiqueta y un `<input>` o un `<textarea>` nativo, con el id y las descripciones ya enlazados. Más adelante puede implementar la interfaz de controles de los formularios de signals sin cambiar su API.
- **Esqueleto** (`skeleton.ts`): `sp-skeleton` con `width`, `height` y `lines`. Es `aria-hidden`, y un único texto oculto anuncia "Cargando…". El brillo usa `--duration-base` y se desactiva con `motion-reduce`.
- **Catálogo**: página `catalog/components.ts` en `/catalog/components` y enlace en la navegación.
- **Ajuste en aceptación** (petición de la persona; refina AC1 y AC6):
  - **Foco:** `--color-focus` pasa de la tinta pura a tonos mate agrisados: en claro, negro mate `#3F3F46` (10:1 frente al fondo, 8,2:1 frente al borde); en oscuro, blanco mate `#D4D4D8` (13:1 frente al fondo, 10:1 frente al borde). Así se acerca al acento sin su dureza.
    - Sobre el acento (botón primario), esos tonos apenas contrastan (1,7:1 y 1,3:1). Por eso el token nuevo `--color-focus-on-accent` invierte el foco, como hace el texto del botón: `#D4D4D8` en claro (12:1) y `#3F3F46` en oscuro (9,5:1).
    - El `:focus-visible` global dibuja el contorno hacia dentro (`outline-offset: -2px`), así queda sobre el borde del componente.
    - Los enlaces dentro de un texto mantienen la separación, para no tapar las letras.
    - La tarjeta seleccionada usa el mismo contorno hacia dentro.
    - Los pares de contraste añaden el foco frente al borde y el foco invertido frente al acento.
  - **Ripple:** al hacer `pointerdown` en el `<button>` se añade una onda (`currentColor` al 20 %) en el punto de contacto, que crece con `--duration-base` mientras se mantiene y se desvanece con `--duration-fast` al soltar, salir o cancelar. Usa la Web Animations API y no se crea si `prefers-reduced-motion: reduce`. Un botón deshabilitado no recibe el puntero, así que no hace onda.

## Archivos

- crear packages/ui/src/components/button.ts — componentes sp-button y sp-icon-button, con motivo de deshabilitado
- crear packages/ui/src/components/tooltip.ts — componente sp-tooltip accesible
- crear packages/ui/src/components/kbd.ts — atajos de teclado por plataforma
- crear packages/ui/src/components/badge.ts — insignia neutra e insignia de fase
- crear packages/ui/src/components/card.ts — tarjeta seleccionable
- crear packages/ui/src/components/skeleton.ts — esqueleto de carga
- crear packages/ui/src/components/field.ts — componente sp-field con etiqueta, ayuda, error y control nativo
- crear packages/ui/src/catalog/components.ts — página Componentes
- modificar packages/ui/src/catalog/catalog.ts — ruta y enlace de Componentes
- modificar packages/ui/src/catalog/colors.ts — usar sp-phase-badge y su mapa de iconos
- modificar packages/ui/src/styles.css — foco mate agrisado, invertido sobre el acento y dibujado hacia dentro
- modificar packages/ui/src/theme/tokens.ts — token del foco sobre el acento y sus pares de contraste

## Tareas

- [x] T1: Botón, tooltip y Kbd
  - files: packages/ui/src/components/button.ts, packages/ui/src/components/tooltip.ts, packages/ui/src/components/kbd.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Insignias, tarjeta y esqueleto
  - files: packages/ui/src/components/badge.ts, packages/ui/src/components/card.ts, packages/ui/src/components/skeleton.ts, packages/ui/src/catalog/colors.ts
  - ac: AC4, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T3: Campo y página Componentes del catálogo
  - files: packages/ui/src/components/field.ts, packages/ui/src/catalog/components.ts, packages/ui/src/catalog/catalog.ts
  - ac: AC7, AC9
  - verify: pnpm check
- [x] T4: Foco sobre el borde del componente, con un color suave
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.ts, packages/ui/src/components/card.ts, packages/ui/src/catalog/colors.ts, packages/ui/src/catalog/catalog.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-ui test
  - notes: Ajuste pedido en aceptación. Actualiza la descripción del foco de Tinta en docs/ui.md.
- [x] T5: Ripple al pulsar los botones
  - files: packages/ui/src/components/button.ts
  - ac: AC1
  - verify: pnpm check
  - notes: Ajuste pedido en aceptación.

## Riesgos

- R1: Un botón con `disabled` no se puede enfocar, así que quien usa solo el teclado no llega al tooltip con el motivo. Los lectores de pantalla sí lo leen en modo lectura, por `aria-describedby`. Mitigación: donde el motivo importa para continuar (la barra de acción de la revisión, según ui.md), la pantalla también lo muestra como texto visible junto al botón.
- R4: Si la acción se enlaza con `(click)` en `<sp-button>`, también se dispararía al hacer clic en el anfitrión. Mitigación: la acción se expone como la salida `pressed`, emitida solo desde el `<button>` nativo, y un test comprueba que no se emite deshabilitado.
- R2: Sin el CDK, el tooltip puede salirse del viewport en los bordes. Mitigación: aceptable para el catálogo; el cambio siguiente lo pasa al overlay del CDK.
- R3: La página Componentes puede superar las 300 líneas. Mitigación: secciones con datos y bucles, o dividirla si hace falta pidiendo el archivo con `specty scope add`.

## Cierre

### Resumen

- Componentes base en `packages/ui/src/components/`, todos componentes de elemento sobre controles nativos:
  - `sp-button` (primario, secundario y fantasma; `sm` y `md`; salida `pressed`) y `sp-icon-button` (etiqueta obligatoria);
  - `sp-tooltip`, `sp-kbd`, `sp-badge`, `sp-phase-badge`, `sp-card`, `sp-field` y `sp-skeleton`.
- Botón deshabilitado: solo puede deshabilitarse con un motivo. Lleva `disabled` y `aria-disabled`, y el motivo aparece en un tooltip y como su descripción.
- Foco: se dibuja hacia dentro, sobre el borde del componente, en negro mate `#3F3F46` (claro) o blanco mate `#D4D4D8` (oscuro), invertido sobre el acento.
- Ripple: los botones muestran una onda al pulsar, de 200 ms como máximo y desactivada con movimiento reducido.
- Página `/catalog/components` con todas las variantes y estados.
- 39 tests con 100 % de líneas; el bundle inicial transfiere 82 kB.

### Desviaciones

- Revisión 2: la persona decidió que el botón deshabilitado use `disabled` además de `aria-disabled` (no enfocable), y que los interactivos sean componentes y no directivas.
- Ajuste en aceptación (revisiones 3 y 4, T4 y T5):
  - foco sobre el borde original y en tonos mate en lugar de tinta pura, con el token nuevo `--color-focus-on-accent`;
  - ripple en los botones.

  Tocó `styles.css` y `tokens.ts` del cambio anterior.
- El esqueleto usa el pulso de Tailwind, un bucle de unos 2 s, en lugar de `--duration-base`: un bucle de 200 ms parpadearía. Se desactiva con movimiento reducido.

### Decisiones

- Las acciones de los botones se exponen como `(pressed)`, emitida solo por el `<button>` nativo, y no como `(click)` sobre el anfitrión.
- El tooltip envuelve su contenido: su anfitrión recibe el puntero aunque el botón esté deshabilitado.
- El foco sobre superficies con acento se invierte, igual que su texto, para mantener al menos 3:1.

### Pendientes

- Quien navega solo con teclado no llega al motivo de un botón deshabilitado (R1). Las pantallas deben mostrarlo también como texto donde importe, empezando por la barra de acción de la revisión.
- El tooltip no evita los bordes del viewport (R2): pasará al overlay del CDK en el cambio siguiente.
- Siguiente cambio de la fase 2: "Sistema de diseño: superposiciones y teclado", con `--follows` a este.
