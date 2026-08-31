from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

from catalogo import normalizar_item

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "tiendas.json"


def main() -> int:
    key = sys.argv[1] if len(sys.argv) > 1 else ""
    stores = json.loads(CONFIG.read_text(encoding="utf-8"))
    store = next((x for x in stores if x["key"] == key or x["nombre"].lower() == key.lower()), None)
    if not store:
        print("Tienda no encontrada. Keys disponibles:")
        for x in stores:
            print(f"  {x['key']} -> {x['nombre']}")
        return 2

    module_name, function_name = store["extractor"].rsplit(":", 1)
    extractor = getattr(importlib.import_module(module_name), function_name)
    print(f"Probando: {store['nombre']}\nURL: {store['url']}\n")
    try:
        raw = extractor(store["url"], store["nombre"])
        items = [normalizar_item(x, store["key"]) for x in raw]
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}")
        return 1

    print(f"Productos: {len(items)}")
    valid = [x for x in items if x.get("nombre") and x.get("precio") is not None and x.get("url")]
    print(f"Validos: {len(valid)}")
    print(f"Con imagen: {sum(bool(x.get('imagen')) for x in valid)}")
    print(f"Con SKU: {sum(bool(x.get('sku')) for x in valid)}")
    print(f"Con stock informado: {sum(x.get('stock') is not None for x in valid)}")
    for item in valid[:10]:
        print(f"  - {item['nombre']} | ${item['precio']} | {item['url']}")
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
