---
kind: epic
---

# knip vigila las exportaciones y los tipos que sobran

## Objetivo

`pnpm check` pasa knip con las reglas de exportaciones y de tipos apagadas, porque cuando se añadió había muchas que sobraban. Hoy sobran 43 exportaciones y 21 tipos que ningún otro archivo importa. Casi todas se usan solo en su propio archivo y les sobra el `export`; lo que no se usa en ningún sitio se borra. Cuando no quede ninguna, las dos reglas se encienden en `knip.json`, y desde entonces `pnpm check` falla si un cambio deja una exportación o un tipo sin usar.

## Fuera de alcance

- Las reglas `nsExports`, `nsTypes` y `enumMembers`, que siguen apagadas.
- Cambiar lo que hace un comando o una pantalla: solo se quitan `export` y código que nadie usa.

## Supuestos

- A1: Lo que knip marca no lo importa ningún otro archivo, tampoco los tests, porque knip ya cuenta los tests como puntos de entrada con su plugin de Vitest. Angular solo usa un componente de otro archivo si ese archivo lo importa, así que tampoco hay usos ocultos en las plantillas.
- A2: Cada corte deja su paquete sin nada que knip marque, ejecutando knip con todas las reglas encendidas desde una configuración temporal fuera del repositorio, sin tocar `knip.json` hasta C5.

## Criterios de aceptación

- AC1: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/core`.
- AC2: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/cli`.
- AC3: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/ui`.
- AC4: CUANDO un cambio deja una exportación o un tipo que nadie importa ENTONCES `pnpm check` falla en knip y lo nombra.

## Cortes

- C1: core sin exportaciones ni tipos que sobran
  - ac: AC1
- C2: la CLI sin exportaciones ni tipos que sobran
  - ac: AC2
- C3: los componentes y los datos de la UI sin exportaciones ni tipos que sobran
  - ac: AC3
- C4: las pantallas de la UI sin exportaciones que sobran
  - ac: AC3
- C5: knip vigila las exportaciones y los tipos
  - ac: AC4
  - depends: C1, C2, C3, C4

## Riesgos

- R1: La otra sesión incorpora código nuevo mientras tanto, con exportaciones que sobran. Mitigación: C5 vuelve a ejecutar knip con las reglas encendidas justo antes de activarlas y limpia lo que encuentre.
