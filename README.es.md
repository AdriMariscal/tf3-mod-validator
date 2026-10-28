# tf3-mod-validator

[![CI](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/AdriMariscal/tf3-mod-validator/actions/workflows/ci.yml)

*Read in [English](README.md).*

Comprueba mods de Transport Fever 3 **sin abrir el juego**.

- **Un mod:** `mod.json` y `_metadata/modinfo.json` están bien formados.
- **Un conjunto de mods:** un grupo de mods puede estar activo en cualquier combinación sin que unos
  pisen a otros. Eso supone `modId` únicos, que dos mods no traigan el mismo fichero bajo
  `content/`, ningún ciclo de dependencias, incompatibilidades simétricas, y que no compartan claves
  de datos guardados ni campos de módulos parcheados.

Cada comprobación es una regla fija o un límite numérico, así que el mismo mod da siempre el mismo
resultado. Las reglas están escritas en [docs/mod-format.md](docs/mod-format.md).

> Proyecto comunitario no oficial. Transport Fever es una marca de Urban Games, que no ha creado ni
> respalda esta herramienta.

## Requisitos

Node.js 24 o posterior. Sin dependencias en tiempo de ejecución.

## Instalación

Ejecútalo sin instalar nada:

```bash
npx tf3-mod-validator ruta/a/mi_mod
```

O añádelo a un proyecto, por ejemplo para comprobar tus mods en CI:

```bash
pnpm add --save-dev tf3-mod-validator
```

## Uso

```bash
tf3-mod-validator ruta/a/mi_mod
```

Se pueden comprobar varias carpetas en una ejecución; cada una se comprueba por separado:

```bash
tf3-mod-validator mods/autor_primero mods/autor_segundo
```

### Conjuntos de mods

Añade `--set` para comprobar además las carpetas como un conjunto:

```bash
tf3-mod-validator --set mods/*/
```

Primero se informa de cada mod por separado y después del conjunto (los mensajes van en inglés):

```text
Mod set
  error    MODSET_INCOMPAT_ASYMMETRIC
           "demo_signals" declares "demo_trams" incompatible, but "demo_trams" does not declare "demo_signals" incompatible.
           - mods/demo_signals: mod.json#/incompatibilities/0
           - mods/demo_trams: mod.json
  error    MODSET_DEPENDENCY_CYCLE
           Dependency cycle: "demo_roads" -> "demo_signals" -> "demo_roads".
           - mods/demo_roads: mod.json#/dependencies/0
           - mods/demo_signals: mod.json#/dependencies/0
  error    MODSET_CONTENT_COLLISION
           2 mods ship different files at content/res/models/demo/pole.mdl; the one loaded last silently replaces the others.
           - mods/demo_roads: content/res/models/demo/pole.mdl
           - mods/demo_signals: content/res/models/demo/pole.mdl
  warning  MODSET_SAVEDATA_KEY_CONFLICT
           2 mods save GUI data under the key "demo_roads", so their data mixes.
           - mods/demo_roads: res/scripts/ui.lua:3
           - mods/demo_trams: res/scripts/ui.lua:3

3 mods checked as a set: 3 errors, 2 warnings.
```

Dos mods que se declaran incompatibles entre sí nunca pueden estar activos a la vez, así que el
conjunto nunca informa de choques entre ellos. Una dependencia obligatoria que no está en el conjunto
es un aviso, porque puede ser un mod de otra persona.

### Salida

Ejemplo de salida para un mod (los mensajes van en inglés):

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
| `--set` | Comprueba además las carpetas como un conjunto de mods. |
| `--format <nombre>` | Formato de salida: `text` (por defecto), `json` o `github` (ver abajo). |
| `--json` | Igual que `--format json`. |
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
          "line": null,
          "message": "\"authors\" is missing or empty."
        }
      ]
    }
  ],
  "set": null,
  "summary": { "mods": 1, "errors": 0, "warnings": 1 }
}
```

`modId` es `null` cuando `mod.json` no declara uno válido. `pointer` es `""` cuando el hallazgo se
refiere al fichero entero. `line` tiene valor en los hallazgos de scripts y es `null` en el resto.

Con `--set`, `set` es `{ "findings": [...] }`. Un hallazgo de conjunto tiene `code`, `severity`,
`message` y `locations`: uno o más `{ dir, modId, file, pointer, line }` por cada mod implicado. El
`summary` cuenta los dos tipos de hallazgo.

`schemaVersion` solo cambia si esta forma cambia de manera incompatible. Añadir un campo no es uno de
esos cambios.

### Anotaciones de GitHub Actions

`--format github` imprime un
[comando de workflow](https://docs.github.com/es/actions/reference/workflows-and-actions/workflow-commands)
por hallazgo, así que cada error y cada aviso aparece sobre su fichero en el pull request y en el
resumen de la ejecución. Un hallazgo de conjunto genera una anotación por ubicación. La línea de
resumen va al final.

```yaml
- run: npx tf3-mod-validator --format github --set mods/*/
```

```text
::error file=mods/autor_primero/mod.json,title=MODJSON_MODID_FORMAT::"modId" must be a non-empty string of a-z, 0-9 and _, got "Autor-Primero". (at /modId)
::warning file=mods/autor_primero/res/scripts/ui.lua,line=3,title=SCRIPT_SAVEDATA_KEY::setGuiSaveData uses key "autor_otro"; use the modId "autor_primero" so saved data never mixes with other mods.
1 mod checked: 1 error, 1 warning.
```

Las rutas son relativas a la carpeta actual, que en un workflow es la raíz del repositorio, así que
ejecuta el comando desde ahí. Los hallazgos de JSON no tienen línea: su anotación apunta al fichero
y el mensaje termina con el JSON Pointer.

## Librería

```js
import { validateMod, validateModSet, checkModJson, checkModInfo, CODES } from 'tf3-mod-validator';

const { modId, findings } = await validateMod('ruta/a/mi_mod');
const set = await validateModSet(['mods/autor_primero', 'mods/autor_segundo']);
// set.mods: un resultado por mod, como el de validateMod. set.findings: los hallazgos del conjunto.

// Las comprobaciones también funcionan sobre JSON ya parseado:
checkModJson({ modId: 'autor_nombre', revision: 1 }, { folderName: 'autor_nombre' });
checkModInfo({ name: 'Mi mod', tags: ['Misc'] }, { hasDescriptionHtml: false });
```

Las dos rechazan con `NotADirectoryError` cuando una ruta no es una carpeta. Cualquier otro
problema, incluido un fichero que falta o que no se puede parsear, es un hallazgo.

## Códigos de hallazgo

Un código no cambia de significado ni de severidad una vez publicado; las comprobaciones nuevas
llevan códigos nuevos. Los errores son cosas que el formato prohíbe. Los avisos (`warning`) son cosas
permitidas que probablemente son un despiste, o reglas que aún no hemos confirmado en el juego.

### Cómo se analizan los scripts

`SCRIPT_*` y los códigos de scripts de `MODSET_*` salen de un análisis de texto de los ficheros
`.lua` y `.tl` de cada mod (los `.d.tl` se omiten). Los comentarios se ignoran. El análisis detecta:

- `setGuiSaveData("clave", …)` cuando la clave es una cadena literal;
- `local m = ug_require("ruta")` seguido de `m.campo = …` o `function m.campo(…)`.

No es un parser, así que no ve claves construidas en tiempo de ejecución, `m["campo"] = …` ni alias
de alias. Por eso estos hallazgos son avisos.

Los ficheros y carpetas cuyo nombre empieza por punto (`.DS_Store`, `.git/`) se omiten siempre.

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

### Scripts

| Código | Severidad | Significado |
|---|---|---|
| `SCRIPT_SAVEDATA_KEY` | warning | Un script llama a `setGuiSaveData` con una clave literal distinta del modId. |

### Conjunto de mods

| Código | Severidad | Significado |
|---|---|---|
| `MODSET_MODID_DUPLICATE` | error | Dos o más mods del conjunto comparten modId, así que el juego solo conserva uno. |
| `MODSET_DEPENDENCY_NOT_IN_SET` | warning | Una dependencia obligatoria no forma parte del conjunto. |
| `MODSET_DEPENDENCY_REVISION` | error | Una dependencia obligatoria está en el conjunto, pero su `revision` queda fuera de `revisionMin`..`revisionMax`. |
| `MODSET_DEPENDENCY_CYCLE` | error | Las dependencias entre mods del conjunto forman un ciclo. |
| `MODSET_INCOMPAT_ASYMMETRIC` | error | Un mod declara incompatible a otro mod del conjunto, pero no al revés. |
| `MODSET_DEP_INCOMPAT_CONFLICT` | error | Un mod requiere otro mod del conjunto que lo declara incompatible. |
| `MODSET_CONTENT_COLLISION` | error | Mods que pueden estar activos a la vez traen ficheros distintos en la misma ruta bajo `content/`. |
| `MODSET_CONTENT_IDENTICAL` | warning | Mods que pueden estar activos a la vez traen ficheros idénticos byte a byte en la misma ruta bajo `content/`. |
| `MODSET_CONTENT_CASE_COLLISION` | warning | Mods que pueden estar activos a la vez traen rutas bajo `content/` que solo difieren en mayúsculas y minúsculas. |
| `MODSET_SAVEDATA_KEY_CONFLICT` | warning | Mods que pueden estar activos a la vez llaman a `setGuiSaveData` con la misma clave literal. |
| `MODSET_MODULE_FIELD_CONFLICT` | warning | Mods que pueden estar activos a la vez asignan el mismo campo del mismo módulo de `ug_require`. |

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm test
```

Los tests usan `node:test`. Los fixtures de `test/fixtures/` son mods mínimos escritos desde cero para
este repositorio; no incluyen ficheros del juego ni mods de terceros. Un test falla si algún código
no aparece en los tests o en alguno de los dos README.

## Publicar una versión

1. Sube `version` en `package.json` y añade la entrada en [CHANGELOG.md](CHANGELOG.md).
2. Haz commit, crea el tag y súbelo: `git tag v0.2.0 && git push origin main v0.2.0`.
3. El [workflow de Release](.github/workflows/release.yml) pasa los tests y publica en npm mediante
   trusted publishing, con atestación de provenance. No se guarda ningún token de npm.

## Licencia

Código: [MPL-2.0](LICENSE). Recursos que no son código, si los hay: CC BY-SA 4.0.
