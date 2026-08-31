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
STORE_DATA = PROJECT / "datos_tiendas"
REPORTS.mkdir(exist_ok=True)
STORE_DATA.mkdir(exist_ok=True)


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


def cargar_anterior(key: str) -> list[dict[str, Any]]:
    path = STORE_DATA / f"{key}.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def guardar_tienda(key: str, items: list[dict[str, Any]]) -> None:
    path = STORE_DATA / f"{key}.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def deduplicar(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out = []
    for item in items:
        ident = str(item.get("id_producto") or item.get("sku") or item.get("url") or "").strip()
        if not ident:
            continue
        key = (str(item.get("tienda") or ""), ident)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def guardar_reporte(rows: list[dict[str, Any]]) -> None:
    payload = {
        "fecha": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "tiendas": rows,
        "total_catalogo": sum(int(x.get("productos_finales", 0)) for x in rows),
    }
    (REPORTS / "ultima_ejecucion.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> int:
    inicio = time.time()
    catalogo: list[dict[str, Any]] = []
    reportes: list[dict[str, Any]] = []

    for tienda in cargar_tiendas():
        anterior = deduplicar(cargar_anterior(tienda.key))
        print(f"\n[{tienda.nombre}] {tienda.url}")
        t0 = time.time()
        try:
            nuevos = deduplicar(ejecutar_tienda(tienda))
            if not nuevos:
                raise RuntimeError("extracción sin productos válidos")

            # Una caída brusca no reemplaza silenciosamente un catálogo sano.
            if anterior and len(nuevos) < max(5, int(len(anterior) * 0.20)):
                final = anterior
                estado = "PARTIAL_FALLBACK"
                warning = f"Extracción sospechosamente pequeña: {len(nuevos)} nuevos vs {len(anterior)} anteriores"
                print(f"  WARNING: {warning}")
            else:
                final = nuevos
                estado = "HEALTHY"
                warning = None
                guardar_tienda(tienda.key, final)

            catalogo.extend(final)
            reportes.append({
                "tienda": tienda.nombre,
                "key": tienda.key,
                "estado": estado,
                "productos_nuevos": len(nuevos),
                "productos_anteriores": len(anterior),
                "productos_finales": len(final),
                "duracion_s": round(time.time() - t0, 1),
                "warning": warning,
            })
            print(f"  {estado}: {len(final)} productos")
        except Exception as exc:
            if anterior:
                catalogo.extend(anterior)
                estado = "FAILED_FALLBACK"
                productos = len(anterior)
                print(f"  ERROR: {exc}")
                print(f"  FALLBACK: se conserva catálogo anterior ({productos})")
            else:
                estado = "FAILED"
                productos = 0
                print(f"  ERROR: {exc}")
            reportes.append({
                "tienda": tienda.nombre,
                "key": tienda.key,
                "estado": estado,
                "productos_nuevos": 0,
                "productos_anteriores": len(anterior),
                "productos_finales": productos,
                "duracion_s": round(time.time() - t0, 1),
                "error": str(exc),
            })

    if not catalogo:
        print("\nERROR: ninguna tienda produjo ni tenía un catálogo previo.")
        guardar_reporte(reportes)
        return 2

    catalogo = deduplicar(catalogo)
    guardar_catalogo(catalogo)
    guardar_reporte(reportes)

    duracion = round(time.time() - inicio, 1)
    print("\n" + "=" * 60)
    print(f"TOTAL: {len(catalogo)} productos -> catalogo.json")
    print(f"Tiempo: {duracion}s")
    print("Reporte: reportes/ultima_ejecucion.json")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
