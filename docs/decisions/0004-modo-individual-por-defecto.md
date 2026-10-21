# 0004 · Modo individual por defecto; modo equipo opcional

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Specty se dirige a dos públicos con necesidades distintas. Para un desarrollador individual, la ceremonia de un equipo es fricción. Un equipo, en cambio, necesita aprobaciones que no se puedan falsificar en local.

## Decisión

- **Individual** (por defecto): aprobaciones en la UI local o en TTY, una rama por cambio y CI recomendado, pero opcional.
- **Equipo** (`mode: team`): lista de aprobadores, revisión de PR como aprobación verificada por el servidor y `specty ci` como check obligatorio.

## Consecuencias

- Hay dos políticas en `config.yaml`, sobre la misma máquina de estados.
- En modo individual, las garantías son locales y, por tanto, evadibles ([modelo de confianza](../ARCHITECTURE.md#modelo-de-confianza)). Se documenta así, sin prometer más.
- Las funciones de equipo llegan en la fase 4.
