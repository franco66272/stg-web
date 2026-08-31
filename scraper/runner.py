from __future__ import annotations

import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from catalogo import cargar_catalogo, guardar_catalogo, normalizar_item

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "tiendas.json"


@dataclass(frozen=True)
class Tienda:
    key: str
    nombre: str
    url: str
    extractor: str


def cargar_tiendas() -> list[Tienda]:
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    return [Tienda(**row) for row in data]


def ejecutar_tienda(tienda: Tienda) -> list[dict[str, Any]]:
    module_name, function_name = tienda.extractor.rsplit(":", 1)
    module = importlib.import_module(module_name)
    extractor = getattr(module, function_name)
    items = extractor(tienda.url)
    return [normalizar_item(item, tienda.key) for item in items]


def main() -> None:
    catalogo: list[dict[str, Any]] = []
    for tienda in cargar_tiendas():
        try:
            items = ejecutar_tienda(tienda)
            print(f"[{tienda.key}] {len(items)} productos")
            catalogo.extend(items)
        except Exception as exc:
            print(f"[{tienda.key}] ERROR: {exc}")

    # Deduplicación conservadora por tienda + ID/URL.
    seen: set[tuple[str, str]] = set()
    unicos: list[dict[str, Any]] = []
    for item in catalogo:
        ident = str(item.get("id_producto") or item.get("url") or item.get("nombre") or "").strip()
        key = (item["tienda"], ident)
        if not ident or key in seen:
            continue
        seen.add(key)
        unicos.append(item)

    guardar_catalogo(unicos)
    print(f"TOTAL: {len(unicos)} productos -> catalogo.json")


if __name__ == "__main__":
    main()
