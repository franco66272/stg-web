# ReparaRadar

Comparador y recopilador de catálogos argentinos de **insumos, herramientas y repuestos para reparación de celulares**.

## Objetivo

Reunir en un solo catálogo productos de proveedores para técnicos: herramientas de apertura, estaciones de soldado, microscopios, fuentes, multímetros, programadoras, flux, estaño, adhesivos, máquinas, módulos, baterías, flex, cámaras, conectores e IC.

## Inicio rápido en Windows

Requiere Python 3.14 y el launcher `py`.

```bat
cd /d C:\Users\Garcias\stg-web
actualizar.bat
iniciar.bat
```

Después abrir:

`http://127.0.0.1:5000`

**No hace falta ejecutar Scrapy manualmente.** El proyecto usa `requests` + BeautifulSoup y prueba automáticamente varias fuentes de datos.

## Cómo actualiza

Para cada tienda, el extractor automático prueba en este orden:

1. WooCommerce Store API pública.
2. Shopify `products.json`.
3. Sitemap XML / WordPress sitemap + JSON-LD de producto.
4. Crawling HTML controlado como último recurso.

La primera fuente que devuelve un catálogo válido se utiliza. Esto evita depender de que todas las tiendas tengan el mismo CMS.

## Seguridad del catálogo

El runner guarda un catálogo independiente por tienda en `datos_tiendas/`.

- Una extracción vacía no borra el catálogo anterior.
- Una caída extrema respecto del catálogo anterior activa `PARTIAL_FALLBACK`.
- Un error de red o parser activa `FAILED_FALLBACK` si existe información anterior.
- `catalogo.json` solamente se genera a partir de catálogos válidos.
- `reportes/ultima_ejecucion.json` registra el resultado de cada tienda.

## Diagnóstico de una sola tienda

```bat
probar_tienda.bat
```

Ingresá, por ejemplo:

```text
fenixcell_com_ar
```

El diagnóstico informa productos, válidos, imágenes, SKU y stock informado.

## Tiendas iniciales

- Fenix Cell
- Uniontools
- Evophone
- I2C Mayorista
- TS-Shop
- Patagonia Cell
- ProParts Celulares
- Mayorista Electrónica

Las fuentes fueron seleccionadas por su catálogo orientado al servicio técnico. Por ejemplo, Fenix Cell publica categorías de repuestos, programadoras, microscopios, herramientas/insumos, fuentes y estaciones de soldado; Uniontools ofrece herramientas, estaciones y repuestos; I2C separa herramientas e insumos; Evophone tiene herramientas, microscopios, programadoras, fuentes y repuestos. Las estructuras exactas se verifican durante la extracción y no se asumen a priori.

## Categorías objetivo

- Apertura y precisión
- Estaciones de soldado y aire caliente
- Microscopios y accesorios
- Fuentes, multímetros y medición
- Programadoras
- Flux, estaño, malla y consumibles
- Adhesivos y químicos
- Separadoras, laminadoras y máquinas
- Repuestos iPhone
- Repuestos Android
- Módulos y displays
- Baterías
- Tapas
- Flex
- Cámaras
- Conectores
- IC y componentes

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

## Principio del proyecto

Primero se identifica la fuente de datos real de cada tienda; después se aprovecha la fuente más estable disponible. No se agregan selectores específicos por intuición si existe una API, sitemap o JSON estructurado más confiable.
