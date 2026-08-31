# ReparaRadar

Comparador y recopilador de catálogos argentinos de insumos, herramientas y repuestos para reparación de celulares.

## Qué hace

- Consulta los catálogos configurados.
- Intenta primero la WooCommerce Store API pública.
- Si la API no está disponible, usa un extractor HTML controlado.
- Normaliza precio, stock, imagen, SKU, categoría y URL.
- Elimina duplicados por tienda + identificador estable.
- Genera `catalogo.json` de forma atómica.
- Genera `reportes/ultima_ejecucion.json`.
- Tiene una web local para buscar y filtrar productos.

## Inicio rápido en Windows

Requiere Python 3.14 y el launcher `py`.

```bat
cd /d C:\Users\Garcias\stg-web
actualizar.bat
iniciar.bat
```

Después abrir:

`http://127.0.0.1:5000`

La primera actualización puede tardar varios minutos según las tiendas y sus límites de conexión. No hace falta ejecutar Scrapy manualmente.

## Actualizar solamente

```bat
actualizar.bat
```

## Iniciar solamente

```bat
iniciar.bat
```

Si todavía no existe `catalogo.json`, `iniciar.bat` ejecuta la actualización automáticamente.

## Tiendas iniciales

- Fenix Cell
- Uniontools
- Evophone
- I2C Mayorista
- TS-Shop
- Patagonia Cell
- ProParts Celulares
- Mayorista Electrónica

Las fuentes se revisan tienda por tienda. No se asume que todas utilizan el mismo CMS.

## Categorías objetivo

- Herramientas de apertura y precisión
- Estaciones de soldado y aire caliente
- Microscopios y accesorios
- Fuentes y medición
- Programadoras
- Flux, estaño, malla y consumibles
- Adhesivos y químicos
- Máquinas separadoras/laminadoras
- Repuestos iPhone y Android
- Módulos, baterías, tapas, flex, cámaras, conectores e IC

## Formato común

```json
{
  "tienda": "",
  "nombre": "",
  "marca": "",
  "categoria": "",
  "subcategoria": "",
  "precio": 0,
  "precio_anterior": null,
  "stock": null,
  "imagen": null,
  "url": "",
  "id_producto": "",
  "sku": null,
  "moneda": "ARS"
}
```

## Principio de seguridad

Una extracción vacía no reemplaza un catálogo válido. El runner solamente reemplaza `catalogo.json` cuando al menos una tienda produjo productos válidos; cada ejecución deja un reporte para poder detectar fallos sin perder los datos anteriores.
