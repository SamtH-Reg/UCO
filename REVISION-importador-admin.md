# Revisión del importador · `admin.html` → Importar datos

Revisión hecha corriendo el **código real** del importador (`procesarArchivo` + `ejecutarImport`)
en un navegador aislado, con el cliente Supabase simulado: no se escribió nada en la base.
Cada caso usa un archivo de prueba y muestra qué filas mapeó, qué insertó y qué mensaje dio.

## Cómo funciona hoy

1. **Tabla destino** (`#importTabla`: Empleados / Producción) y, solo para empleados,
   **turno** (`#importTurno`: Día / Tarde / Noche — obligatorio).
2. Se arrastra el archivo (`.xlsx` / `.xls` / `.csv`) → SheetJS lee **la primera hoja**
   (`XLSX.read(..., {type:'array', cellDates:false})` + `sheet_to_json({defval:'', raw:false})`,
   es decir valores ya formateados como texto).
3. **Mapeo de encabezados** (`COLUMNAS_TABLA`): minúsculas + `trim`, con alias
   (`centro costo`/`centrocosto`/`tipo_contrato` → `centro_costo`/`contrato`; en producción
   `función`, `línea especial`, etc.). Lo que no reconoce se pasa a `snake_case`.
   Al importar se **descartan** las columnas que no están en la lista blanca
   (empleados: `codigo, nombre, centro_costo, contrato, activo, turno`).
   `activo` queda en `true` si no viene.
4. **Centros de costo excluidos** (`CC_EXCLUIDOS`: 1109, 1115, 1116, 1114, 1113, 1117, 1112,
   buscados como subcadena): esas filas **no** entran a `empleados`, van a `unidades_excluidas`.
5. **Limpieza**: descarta filas sin `codigo`, elimina duplicados **dentro del archivo**
   (por código, se queda con la primera), consulta Supabase en bloques de 200 para saber qué
   códigos ya existen y **solo inserta los nuevos**, en bloques de 50.
6. Resumen por toast (nuevos / ya existían / duplicados / excluidos) y recarga de vistas.

El turno **no se lee del archivo**: `r.turno = turnoImport` lo asigna siempre el desplegable.

## Qué probamos (archivos reales, cliente Supabase simulado)

| Archivo | Filas | Resultado |
|---|---|---|
| `empleados_ok.csv` (codigo, nombre, centro_costo, contrato) | 2 | 1 → `empleados`, 1 → `unidades_excluidas` (CC 1112) ✅ |
| `empleados_tilde.csv` (encabezado `código`) | 1 | **0 importadas** ❌ y el mensaje dice «Todos los registros del archivo ya existen (0 omitidos)» |
| `empleados_turno.csv` (columna `turno` = NOCHE / TARDE) | 2 | 2 → `empleados`, pero con `turno:"Día"` (el del desplegable) ❌ |
| `empleados_dups.csv` (código repetido) | 3 | 2 → `empleados` (primera aparición), avisa «1 filas duplicadas en el archivo» ✅ |
| `empleados_falso_cc.csv` (CC `2113 …`) | 1 | 1 → `empleados` ✅ |
| `produccion.csv` | 2 | 2 → `produccion` (sin deduplicar) ⚠️ |

Codificación, con el CSV que exporta Google Sheets (UTF-8 **sin BOM**):

| Lectura | Encabezado | Nombre | Centro de costo |
|---|---|---|---|
| Hoy (`XLSX.read` sin codepage) | `cÃ³digo` ❌ | `JOSÃ MUÃOZ ÃVILA` ❌ | `1110 -PRODUCCIÃN (FS)` ❌ |
| Con `codepage:65001` | `código` ✅ | `JOSÉ MUÑOZ ÁVILA` ✅ | `1110 -PRODUCCIÓN (FS)` ✅ |
| Con BOM (Excel) | `código` ✅ | `JOSÉ MUÑOZ ÁVILA` ✅ | `1110 -PRODUCCIÓN (FS)` ✅ |

Estado actual de la base: 0 filas con texto manglado y 39 empleados con tildes correctas
(los `.xlsx` no pasan por el codepage), así que **hoy no hay daño**: es un riesgo latente
para cuando se suelte un CSV de Sheets.

## Hallazgos, por prioridad

1. **Un encabezado con tilde o mal escrito importa 0 filas y el mensaje culpa a otra cosa.**
   `código` (con tilde) no calza con `CODIGO` de la lista blanca → la columna se pierde →
   todas las filas quedan sin código → se descartan → toast «Todos los registros del archivo ya
   existen». No hay ninguna validación de los «Encabezados requeridos» que la página muestra.
   *Arreglo:* validar al leer el archivo que estén las columnas claves y avisar
   («falta la columna `codigo`; encabezados encontrados: …»).
2. **CSV UTF-8 sin BOM = tildes rotas** (tabla de arriba), y de paso rompe el mapeo si el
   encabezado lleva tilde. *Arreglo:* detectar BOM / decodificar con `TextDecoder('utf-8',{fatal:true})`
   y, si no es UTF-8 válido, usar Windows-1252; pasar `codepage:65001` a SheetJS.
3. **Nunca actualiza empleados existentes** (solo inserta los que no están). Re-importar la
   planilla **no** refresca nombre, centro de costo, contrato ni turno de quien ya existe: hay que
   editarlo a mano. *Arreglo:* opción «actualizar los que ya existen» (upsert por `codigo`).
4. **Producción no deduplica nada**: no compara contra la base (el chequeo de códigos existentes
   solo corre para empleados) ni dentro del archivo → re-importar el mismo archivo duplica todo.
5. **El turno del archivo se ignora** (por diseño: manda el desplegable). Un archivo con columna
   `turno` NOCHE/TARDE se importa como «Día» si el desplegable quedó en Día. Además ese desplegable
   escribe `Día/Noche/Tarde`, mientras los permisos guardan `DIA/NOCHE/TARDE` (el front de permisos
   ya unifica al mostrar).
6. Menor: `_ccExcluido` busca el código como **subcadena** (`indexOf`) sobre todo el texto del
   centro de costo; un código que contenga esos dígitos se excluiría sin serlo.
7. Menor: la vista previa es la única forma de notar el problema 1 (muestra las columnas ya
   mapeadas); conviene que avise en rojo cuando falta una columna clave.

## Verificación

- Scripts: `scratch/revisar_importador.py` (los 6 casos) y `scratch/revisar_codepage.py`
  (codificación). Salida completa: `scratch/salida_importador.txt`.
- Datos de la base consultados por MCP: `empleados` por turno (Día 372/238 activos, Noche 161/0,
  Tarde 30/0, Amanecida 10/0) → el contador del menú es correcto: solo Día tiene activos.

---

## Estado: reparado (mismo día)

Lo verificado arriba se corrigió en `admin.html` y se volvió a probar con los mismos archivos
(salida completa en `scratch/salida_admin.txt`):

| Hallazgo | Arreglo | Verificación |
|---|---|---|
| 1. Encabezado mal escrito → 0 filas y mensaje engañoso | Se declaran las columnas esperadas por tabla (`IMPORT_ESPERADAS`); si falta la clave se muestra un aviso rojo y **se bloquea** la importación con un toast claro; si faltan otras, se avisa en amarillo. Además `código`/`cod` ahora calzan con la columna `codigo` | Archivo con encabezado `CLAVE` → aviso ⛔ y 0 insert; archivo sin `nombre`/`contrato` → aviso ⚠️; archivo con `código` → importa bien |
| 2. CSV UTF-8 sin BOM = tildes rotas | `_detectaCodificacion()`: BOM o UTF-8 estricto → UTF-8; si no, Windows-1252. Los CSV se leen como texto ya decodificado y la codificación detectada se informa en la vista previa | `MUÑOZ ÁVILA JOSÉ` y `1110 -PRODUCCIÓN (FS)` entran correctos; la vista previa dice «Codificación: UTF-8» |
| 3. Nunca actualizaba los existentes | Casilla nueva **«Actualizar los que ya existen»** (solo empleados): refresca nombre, centro de costo y contrato de los que vienen en el archivo, sin borrar datos con celdas vacías, y el turno lo sigue mandando el desplegable | M1001 con nombre/CC/contrato nuevos + turno Noche → `update` con esos campos y resumen «1 actualizados» |
| 4. Producción no deduplicaba | Se compara por **firma de los 9 campos** contra la tabla (paginando) y también dentro del archivo | Archivo con una fila ya existente + una nueva → «1 nuevos importados · 1 ya existían (omitidos)» |

Además: cambiar la tabla destino con un archivo ya cargado ahora limpia la vista previa (el mapeo
depende de la tabla).

### Función nueva: buscar un listado dentro de los inactivos

En **Inactivos** hay un panel para pegar un listado (una persona por línea, puede estar incompleto):
se busca por código (exacto o solo los dígitos) o por palabras del nombre en cualquier orden,
ignorando tildes y palabras cortas como «DE»/«LA». Devuelve:

- las **coincidencias** en una tabla con casilla por persona (marcar/desmarcar todas),
- las líneas **sin coincidencia** (para ver de inmediato a quién falta cargar),
- el botón **✅ Activar seleccionados**, que reactiva con `activo:true` y el turno elegido
  («El turno de cada uno» por defecto) y limpia licencias previas.

Probado con 5 inactivos y un listado de 6 líneas: 4 coincidencias, 1 sin coincidencia, y al
activar quedaron 4 reactivados con su turno y el contador de inactivos bajó a 1.
