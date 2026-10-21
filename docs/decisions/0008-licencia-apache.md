# 0008 · Licencia Apache-2.0

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El legacy usaba GPL-3.0. Ejecutar una herramienta GPL no impone obligaciones sobre el código del usuario, pero en Specty la GPL frenaría la adopción en empresas por tres razones:

- Los escáneres de licencias y las políticas internas bloquean las dependencias GPL, o exigen una revisión legal, incluso en herramientas de desarrollo.
- Specty escribe archivos en el repositorio del usuario (plantillas, bloques de AGENTS.md, hooks, workflows), y con GPL queda la duda de si esos archivos quedan cubiertos por ella.
- Integrar el core en herramientas o productos que se distribuyen obligaría a publicarlos bajo GPL.

## Decisión

- Todo el monorepo se licencia bajo Apache-2.0 (`LICENSE` y `NOTICE`).
- Las plantillas y todo lo que Specty genera en el repositorio del usuario se licencian bajo MIT-0: se pueden usar, modificar y redistribuir sin atribución. La carpeta de plantillas llevará su propio `LICENSE` cuando exista.
- Cada archivo fuente lleva la cabecera `SPDX-License-Identifier: Apache-2.0`.
- Las contribuciones se aceptan con DCO (`Signed-off-by` en cada commit), sin CLA.

## Consecuencias

- Personas y empresas pueden usar, modificar, integrar y redistribuir Specty, también en productos comerciales, conservando el aviso de licencia y el `NOTICE`.
- La licencia concede de forma explícita las patentes, y quien demande por patentes relacionadas con Specty pierde la licencia.
- La licencia no concede el uso de la marca Specty (sección 6), lo que protege el nombre.
- Cualquiera puede ofrecer una versión cerrada o un servicio basado en Specty. La diferenciación queda en la marca, la calidad y la comunidad.
- El código portado del legacy se puede relicenciar porque Jorge Palacio es el único autor de sus 113 commits. El legacy puede seguir bajo GPL-3.0.
- Sin CLA, relicenciar en el futuro código aportado por terceros requeriría su permiso. Una edición comercial se construiría como código aparte.
- Las dependencias que se conservan (MIT, ISC, BSD-3-Clause) son compatibles.
