# Repararadar

Comparador y recopilador de catálogos argentinos de insumos, herramientas y repuestos para reparación de celulares.

## Objetivo

Construir un catálogo normalizado de proveedores de servicio técnico móvil, priorizando:

- herramientas de apertura y precisión;
- estaciones de soldado y aire caliente;
- microscopios y lupas;
- fuentes y multímetros;
- programadoras;
- consumibles de microsoldadura;
- adhesivos, flux, estaño y malla;
- máquinas para reparación de módulos/vidrios;
- repuestos de iPhone y Android;
- módulos, baterías, tapas, flex, cámaras, conectores e IC.

## Arquitectura

Cada tienda tendrá un extractor independiente, pero todos producen el mismo esquema normalizado. El sistema mide cobertura, detecta extracciones parciales y conserva el último catálogo válido cuando una fuente falla.

Las fuentes secundarias, cuando sean necesarias para descubrir URLs o contrastar cobertura, quedan separadas de la fuente primaria del precio.

## Tiendas iniciales

- Fenix Cell
- Uniontools
- Evophone
- I2C Mayorista
- TS-Shop
- Mayorista Electrónica
- Patagonia Cell
- ProParts Celulares

Se incorporarán nuevas tiendas luego de identificar para cada una su fuente de datos más estable (HTML, API, sitemap, JSON embebido o índice externo).

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
