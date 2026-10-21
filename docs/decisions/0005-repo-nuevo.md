# 0005 · Repo nuevo con portado selectivo del legacy

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El legacy tiene unas 27k líneas, 38 comandos y 21 adaptadores, y mezcla mecanismos útiles con una superficie excesiva. Su gobernanza depende de OpenSpec y de un estado global.

Solo cuatro módulos tienen bajo acoplamiento:

- `detect`: ~1,7k líneas; depende solo de sus tipos.
- `governance/hook-managers`: ~0,8k; depende de `core/git`.
- `adapters`: ~1,5k.
- El servidor HTTP + SSE de `ui`: ~250.

## Decisión

Repo nuevo, organizado como monorepo. Se portan esos cuatro módulos, adaptados al nuevo diseño. Lo demás se reescribe o se elimina (ver [ARCHITECTURE §17](../ARCHITECTURE.md#17-portado-desde-el-legacy)).

## Consecuencias

- El legacy queda en mantenimiento, solo con correcciones, hasta que exista una ruta de migración (`specty import`).
- El nombre, la organización y el paquete npm se decidieron en [ADR 0007](0007-nombre-y-organizacion.md); la licencia, en [ADR 0008](0008-licencia-apache.md).
