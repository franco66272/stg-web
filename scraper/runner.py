from __future__ import annotations

import importlib
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from catalogo import guardar_catalogo, normalizar_item

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
CONFIG = ROOT / "tiendas.json"
REPORTS = PROJECT / "reportes"
REPORTS.mkdir(exist_ok=True)


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
    try:
        raw = extractor(tienda.url, tienda.nombre)
    except TypeError:
        raw = extractor(tienda.url)
    return [normalizar_item(item, tienda.key) for item in raw]


def guardar_reporte(rows: list[dict[str, Any]]) -> None:
    (REPORTS / "ultima_ejecucion.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> int:
    inicio = time.time()
    catalogo: list[dict[str, Any]] = []
    reportes: list[dict[str, Any]] = []

    for tienda in cargar_tiendas():
        print(f"\n[{tienda.nombre}] {tienda.url}")
        try:
            items = ejecutar_tienda(tienda)
            validos = [x for x in items if x.get("nombre") and x.get("precio") is not None and x.get("url")]
            if not validos:
                raise RuntimeError("extracción sin productos válidos")
            catalogo.extend(validos)
            reportes.append({
                "tienda": tienda.nombre,
                "key": tienda.key,
                "estado": "HEALTHY",
                "productos": len(validos),
                "duracion_s": round(time.time() - inicio, 1),
            })
            print(f"  OK: {len(validos)} productos")
        except Exception as exc:
            reportes.append({
                "tienda": tienda.nombre,
                "key": tienda.key,
                "estado": "FAILED",
                "productos": 0,
                "error": str(exc),
            })
            print(f"  ERROR: {exc}")

    if not catalogo:
        print("\nERROR: ninguna tienda produjo productos. No se reemplaza el catálogo.")
        guardar_reporte(reportes)
        return 2

    # Deduplicación conservadora: una misma URL/SKU dentro de la misma tienda.
    seen: set[tuple[str, str]] = set()
    unicos: list[dict[str, Any]] = []
    for item in catalogo:
        ident = str(item.get("id_producto") or item.get("url") or "").strip()
        key = (item["tienda"], ident)
        if not ident or key in seen:
            continue
        seen.add(key)
        unicos.append(item)

    guardar_catalogo(unicos)
    guardar_reporte(reportes)
    duracion = round(time.time() - inicio, 1)
    print("\n" + "=" * 60)
    print(f"TOTAL: {len(unicos)} productos -> catalogo.json")
    print(f"Tiempo: {duracion}s")
    print("Reporte: reportes/ultima_ejecucion.json")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
