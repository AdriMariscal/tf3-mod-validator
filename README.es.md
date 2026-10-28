# tf3-mod-validator

[![CI](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml)

*Read in [English](README.md).*

Comprueba mods de Transport Fever 3 **sin abrir el juego**.

- **Hoy:** mod a mod. `mod.json` y `_metadata/modinfo.json` tienen que estar bien formados.
- **Próximamente:** conjuntos de mods. Un grupo de mods tiene que funcionar en cualquier
  combinación: `modId` únicos, que dos mods no traigan el mismo fichero bajo `content/`, sin ciclos de
  dependencias e incompatibilidades simétricas.

Cada comprobación es una regla fija o un límite numérico, así que el mismo mod da siempre el mismo
resultado. Las reglas están escritas en [docs/mod-format.md](docs/mod-format.md).

> Proyecto comunitario no oficial. Transport Fever es una marca de Urban Games, que no ha creado ni
> respalda esta herramienta.

## Requisitos

Node.js 24 o posterior. Sin dependencias en tiempo de ejecución.

## Uso

Todavía no está en npm. Desde un clon de este repositorio:

```bash
pnpm install
node bin/tf3-mod-validator.js ruta/a/mi_mod
```

Se pueden comprobar varias carpetas en una ejecución; cada una se comprueba por separado:

```bash
node bin/tf3-mod-validator.js mods/autor_primero mods/autor_segundo
```

Ejemplo de salida (los mensajes van en inglés):

```text
mods/autor_primero (autor_primero)
  error    MODJSON_PARAM_DEFAULTINDEX  mod.json#/params/0/defaultIndex
           "defaultIndex" must be an integer from 0 to 1, got 2. It is 0-based in JSON: the first value is 0.
  warning  MODINFO_AUTHORS_MISSING  _metadata/modinfo.json
           "authors" is missing or empty.

1 mod checked: 1 error, 1 warning.
```

Cada hallazgo indica su severidad, un código estable, el fichero y un
[JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) al campo exacto.

### Opciones

| Opción | Efecto |
|---|---|
| `--json` | Imprime el informe en JSON (ver abajo). |
| `-h`, `--help` | Muestra la ayuda. |
| `-v`, `--version` | Imprime la versión. |

### Códigos de salida

| Código | Significado |
|---|---|
| `0` | Sin errores. Puede haber avisos. |
| `1` | Al menos un error. |
| `2` | Error de uso (opción incorrecta, carpeta inexistente) o fallo interno. |

### Salida JSON

```json
{
  "schemaVersion": 1,
  "mods": [
    {
      "dir": "mods/autor_primero",
      "modId": "autor_primero",
      "findings": [
        {
          "code": "MODINFO_AUTHORS_MISSING",
          "severity": "warning",
          "file": "_metadata/modinfo.json",
          "pointer": "",
          "message": "\"authors\" is missing or empty."
        }
      ]
    }
  ],
  "summary": { "mods": 1, "errors": 0, "warnings": 1 }
}
```

`modId` es `null` cuando `mod.json` no declara uno válido. `pointer` es `""` cuando el hallazgo se
refiere al fichero entero. `schemaVersion` solo cambia si esta forma cambia de manera incompatible.

## Librería

```js
import { validateMod, checkModJson, checkModInfo, CODES } from 'tf3-mod-validator';

const { modId, findings } = await validateMod('ruta/a/mi_mod');

// Las comprobaciones también funcionan sobre JSON ya parseado:
checkModJson({ modId: 'autor_nombre', revision: 1 }, { folderName: 'autor_nombre' });
checkModInfo({ name: 'Mi mod', tags: ['Misc'] }, { hasDescriptionHtml: false });
```

`validateMod` rechaza con `NotADirectoryError` cuando la ruta no es una carpeta. Cualquier otro
problema, incluido un fichero que falta o que no se puede parsear, es un hallazgo.

## Códigos de hallazgo

Un código no cambia de significado ni de severidad una vez publicado; las comprobaciones nuevas
llevan códigos nuevos. Los errores son cosas que el formato prohíbe. Los avisos (`warning`) son cosas
permitidas que probablemente son un despiste, o reglas que aún no hemos confirmado en el juego.

### mod.json

| Código | Severidad | Significado |
|---|---|---|
| `MODJSON_MISSING` | error | No existe mod.json. |
| `MODJSON_INVALID_JSON` | error | mod.json no es JSON válido. |
| `MODJSON_BOM` | warning | mod.json empieza con una marca de orden de bytes (BOM) UTF-8. |
| `MODJSON_NOT_OBJECT` | error | mod.json no contiene un objeto JSON. |
| `MODJSON_UNKNOWN_FIELD` | warning | mod.json tiene un campo de primer nivel que no está en el formato documentado. |
| `MODJSON_FIELD_TYPE` | error | Un campo de mod.json tiene un tipo JSON incorrecto. |
| `MODJSON_MODID_MISSING` | error | Falta `modId`. |
| `MODJSON_MODID_FORMAT` | error | `modId` no es una cadena no vacía de `a-z`, `0-9` y `_`. |
| `MODJSON_MODID_CONVENTION` | warning | `modId` no sigue la convención `<autor>_<nombre>`. |
| `MODJSON_MODID_FOLDER_MISMATCH` | warning | El nombre de la carpeta del mod no es igual a `modId`. |
| `MODJSON_REVISION_MISSING` | error | Falta `revision`. |
| `MODJSON_REVISION_TYPE` | error | `revision` no es un entero. |
| `MODJSON_REVISION_RANGE` | error | `revision` es negativo. |
| `MODJSON_SEVERITY_VALUE` | error | `severityAdd` o `severityRemove` no es `None`, `Warning` ni `Critical`. |
| `MODJSON_DEP_MOD_MISSING` | error | Una dependencia no tiene objeto `mod`. |
| `MODJSON_DEP_MODID_MISSING` | error | Una dependencia no tiene `mod.modId`. |
| `MODJSON_DEP_MODID_FORMAT` | error | El `mod.modId` de una dependencia no es un modId válido. |
| `MODJSON_DEP_REVISION_INVALID` | error | El `revisionMin` o `revisionMax` de una dependencia no es `-1` ni un entero no negativo. |
| `MODJSON_DEP_REVISION_RANGE` | error | Una dependencia tiene `revisionMin` mayor que `revisionMax`. |
| `MODJSON_DEP_SELF` | error | El mod se declara dependiente de sí mismo. |
| `MODJSON_DEP_DUPLICATE` | error | El mismo modId aparece dos veces en `dependencies`. |
| `MODJSON_DEP_MODINFO_MISSING` | warning | Una dependencia no tiene objeto `modInfo`. |
| `MODJSON_DEP_DISPLAYNAME_MISSING` | warning | El `modInfo` de una dependencia no tiene un `displayName` no vacío. |
| `MODJSON_INCOMPAT_MOD_MISSING` | error | Una incompatibilidad no tiene objeto `mod`. |
| `MODJSON_INCOMPAT_MODID_MISSING` | error | Una incompatibilidad no tiene `mod.modId`. |
| `MODJSON_INCOMPAT_MODID_FORMAT` | error | El `mod.modId` de una incompatibilidad no es un modId válido. |
| `MODJSON_INCOMPAT_REVISION_INVALID` | error | El `revisionMin` o `revisionMax` de una incompatibilidad no es `-1` ni un entero no negativo. |
| `MODJSON_INCOMPAT_REVISION_RANGE` | error | Una incompatibilidad tiene `revisionMin` mayor que `revisionMax`. |
| `MODJSON_INCOMPAT_SELF` | error | El mod se declara incompatible consigo mismo. |
| `MODJSON_INCOMPAT_DUPLICATE` | error | El mismo modId aparece dos veces en `incompatibilities`. |
| `MODJSON_DEP_INCOMPAT_CONFLICT` | error | Un modId es a la vez dependencia e incompatibilidad. |
| `MODJSON_PARAM_KEY_MISSING` | error | Un parámetro no tiene un `key` no vacío. |
| `MODJSON_PARAM_KEY_DUPLICATE` | error | Dos parámetros comparten el mismo `key`. |
| `MODJSON_PARAM_NAME_MISSING` | error | Un parámetro no tiene un `name` no vacío. |
| `MODJSON_PARAM_UITYPE_MISSING` | warning | Un parámetro no tiene `uiType`. |
| `MODJSON_PARAM_UITYPE_VALUE` | error | El `uiType` de un parámetro no es `Button`, `Slider`, `ComboBox`, `IconButton` ni `CheckBox`. |
| `MODJSON_PARAM_VALUES_INVALID` | error | El `values` de un parámetro falta o no es un array de cadenas. |
| `MODJSON_PARAM_VALUES_EMPTY` | error | El `values` de un parámetro es un array vacío. |
| `MODJSON_PARAM_NUMBERS_INVALID` | error | El `numbers` de un parámetro no es un array de números finitos. |
| `MODJSON_PARAM_NUMBERS_LENGTH` | error | El `numbers` de un parámetro no tiene la misma longitud que `values`. |
| `MODJSON_PARAM_DEFAULTINDEX` | error | El `defaultIndex` de un parámetro no es un índice entero, base 0, dentro de `values`. |
| `MODJSON_SCRIPT_FILENAME_FORMAT` | error | El `fileName` de un script falta o no encaja con `<modId>::<fichero>@<función>`. |
| `MODJSON_SCRIPT_FOREIGN_MOD` | warning | El `fileName` de un script apunta a un modId distinto de este mod. |

### modinfo.json

| Código | Severidad | Significado |
|---|---|---|
| `MODINFO_MISSING` | error | No existe _metadata/modinfo.json. |
| `MODINFO_INVALID_JSON` | error | modinfo.json no es JSON válido. |
| `MODINFO_BOM` | warning | modinfo.json empieza con una marca de orden de bytes (BOM) UTF-8. |
| `MODINFO_NOT_OBJECT` | error | modinfo.json no contiene un objeto JSON. |
| `MODINFO_UNKNOWN_FIELD` | warning | modinfo.json tiene un campo de primer nivel que no está en el formato documentado. |
| `MODINFO_FIELD_TYPE` | error | Un campo de modinfo.json tiene un tipo JSON incorrecto. |
| `MODINFO_NAME_MISSING` | error | `name` falta o está vacío. |
| `MODINFO_NAME_LENGTH` | error | `name` tiene más de 32 caracteres. |
| `MODINFO_NAME_LINEBREAK` | error | `name` contiene un salto de línea. |
| `MODINFO_SUMMARY_MISSING` | warning | `summary` falta o está vacío. |
| `MODINFO_SUMMARY_LENGTH` | error | `summary` tiene más de 100 caracteres. |
| `MODINFO_SUMMARY_LINEBREAK` | error | `summary` contiene un salto de línea. |
| `MODINFO_DESCRIPTION_IGNORED` | warning | Hay `description`, pero existe `_metadata/description.html`, así que el juego lo ignora. |
| `MODINFO_LOCALIZATION_UNKNOWN_FIELD` | warning | Una entrada de `localization` tiene un campo distinto de `name`, `summary` y `description`. |
| `MODINFO_AUTHORS_MISSING` | warning | `authors` falta o está vacío. |
| `MODINFO_AUTHOR_NAME_MISSING` | error | Un autor no tiene un `name` no vacío. |
| `MODINFO_TAGS_MISSING` | error | `tags` falta o está vacío; hace falta al menos una etiqueta. |
| `MODINFO_TAG_DUPLICATE` | warning | La misma etiqueta aparece dos veces en `tags`. |
| `MODINFO_DEPENDENCY_FORMAT` | error | Una entrada de `dependencies` no es un id de mod.io escrito como cadena de dígitos. |
| `MODINFO_DEPENDENCY_DUPLICATE` | warning | El mismo id de mod.io aparece dos veces en `dependencies`. |
| `MODINFO_URL_FORMAT` | error | `url` no es una URL absoluta http o https. |

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm test
```

Los tests usan `node:test`. Los fixtures de `test/fixtures/` son mods mínimos escritos desde cero para
este repositorio; no incluyen ficheros del juego ni mods de terceros. Un test falla si algún código
no aparece en los tests o en alguno de los dos README.

## Licencia

Código: [MPL-2.0](LICENSE). Recursos que no son código, si los hay: CC BY-SA 4.0.
