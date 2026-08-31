# Scraper

## Principio de trabajo

No se asume el CMS de una tienda antes de inspeccionarla. Primero se identifica si existe API, sitemap, JSON embebido, WooCommerce, Shopify u otra fuente; luego se implementa el extractor definitivo.

## Reglas

- No usar selectores frágiles como única fuente cuando exista JSON-LD, API o sitemap.
- Registrar `pages_ok`, `pages_failed`, `products_unique` y, cuando sea posible, `expected_total`.
- No reemplazar un catálogo anterior con una extracción claramente parcial.
- Deduplicar por SKU/ID estable y URL como fallback.
- Mantener precio, stock, imagen y URL separados.
- No descargar páginas de producto si el listado ya contiene todos los datos necesarios.
