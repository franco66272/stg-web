from __future__ import annotations

import json
from pathlib import Path
from typing import Any

OUT = Path("catalogo.json")


def normalizar_item(item: dict[str, Any], tienda: str) -> dict[str, Any]:
    return {
        "tienda": tienda,
        "nombre": str(item.get("nombre") or "").strip(),
        "marca": item.get("marca"),
        "categoria": item.get("categoria") or "Otros",
        "subcategoria": item.get("subcategoria"),
        "precio": item.get("precio"),
        "precio_anterior": item.get("precio_anterior"),
        "stock": item.get("stock"),
        "imagen": item.get("imagen"),
        "url": item.get("url"),
        "id_producto": item.get("id_producto") or item.get("sku") or item.get("url") or item.get("nombre"),
        "sku": item.get("sku"),
        "moneda": item.get("moneda") or "ARS",
    }


def guardar_catalogo(productos: list[dict[str, Any]]) -> None:
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(productos, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT)


def cargar_catalogo() -> list[dict[str, Any]]:
    if not OUT.exists():
        return []
    return json.loads(OUT.read_text(encoding="utf-8"))
