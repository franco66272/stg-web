from __future__ import annotations

import json
import math
from pathlib import Path

from flask import Flask, render_template_string, request

ROOT = Path(__file__).resolve().parent
CATALOGO = ROOT / "catalogo.json"
PAGE_SIZE = 60

app = Flask(__name__)

TEMPLATE = r'''
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReparaRadar</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;background:#f4f6f8;color:#17202a}header{background:#101820;color:white;padding:18px 24px}main{max-width:1250px;margin:auto;padding:24px}.brand{font-size:24px;font-weight:800}.tag{opacity:.75}.search{display:flex;gap:8px;margin-top:20px}.search input{flex:1;padding:13px;border-radius:8px;border:1px solid #ccd;font-size:16px}.search button,.apply{padding:13px 20px;border:0;border-radius:8px;background:#2672ff;color:#fff;font-weight:700}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.filters select{padding:10px;border:1px solid #ccd;border-radius:8px;background:white}.meta{margin:18px 0;color:#5c6770}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}.card{background:white;border:1px solid #e0e4e8;border-radius:12px;padding:14px;display:flex;flex-direction:column;min-height:320px}.card img{width:100%;height:170px;object-fit:contain;background:#fff}.name{font-weight:700;line-height:1.25;min-height:46px}.store{font-size:13px;color:#68737d;margin-top:8px}.price{font-size:20px;font-weight:800;margin-top:8px}.link{display:inline-block;margin-top:auto;padding-top:12px;color:#2672ff;text-decoration:none}.pagination{display:flex;justify-content:center;gap:8px;margin:28px 0}.pagination a{background:white;border:1px solid #ccd;padding:9px 14px;border-radius:7px;text-decoration:none;color:#17202a}.empty{padding:50px;text-align:center;background:white;border-radius:12px}
</style></head>
<body><header><div class="brand">REPARARADAR <span class="tag">· herramientas, insumos y repuestos</span></div></header>
<main><form class="search" method="get"><input name="q" value="{{q}}" placeholder="Buscar microscopio, flux, pantalla, batería, programadora..."><input type="hidden" name="tienda" value="{{tienda}}"><button>Buscar</button></form>
<form class="filters" method="get"><input type="hidden" name="q" value="{{q}}"><select name="tienda"><option value="">Todas las tiendas</option>{% for t in tiendas %}<option value="{{t}}" {% if t==tienda %}selected{% endif %}>{{t}}</option>{% endfor %}</select><select name="orden"><option value="precio" {% if orden=='precio' %}selected{% endif %}>Precio más bajo</option><option value="nombre" {% if orden=='nombre' %}selected{% endif %}>Nombre</option></select><button class="apply">Aplicar</button></form>
<div class="meta">{{total_filtrados}} productos encontrados · {{total}} en el catálogo · página {{pagina}}/{{paginas}}</div>
{% if productos %}<section class="grid">{% for p in productos %}<article class="card">{% if p.imagen %}<img src="{{p.imagen}}" loading="lazy" referrerpolicy="no-referrer">{% endif %}<div class="store">{{p.tienda}} · {{p.categoria}}</div><div class="name">{{p.nombre}}</div><div class="price">{% if p.precio is not none %}${{'{:,.0f}'.format(p.precio).replace(',', '.')}}{% else %}Consultar{% endif %}</div>{% if p.url %}<a class="link" href="{{p.url}}" target="_blank" rel="noopener">Ver en tienda →</a>{% endif %}</article>{% endfor %}</section>{% else %}<div class="empty">No encontramos productos con esos filtros.</div>{% endif %}
{% if paginas>1 %}<nav class="pagination">{% if pagina>1 %}<a href="{{url_for('inicio',q=q,tienda=tienda,orden=orden,page=pagina-1)}}">← Anterior</a>{% endif %}{% if pagina<paginas %}<a href="{{url_for('inicio',q=q,tienda=tienda,orden=orden,page=pagina+1)}}">Siguiente →</a>{% endif %}</nav>{% endif %}
</main></body></html>
'''


def cargar() -> list[dict]:
    if not CATALOGO.exists():
        return []
    try:
        return json.loads(CATALOGO.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


@app.get("/")
def inicio():
    catalogo = cargar()
    q = request.args.get("q", "").strip().lower()
    tienda = request.args.get("tienda", "").strip()
    orden = request.args.get("orden", "precio")
    try:
        pagina = max(1, int(request.args.get("page", "1")))
    except ValueError:
        pagina = 1

    productos = catalogo
    if q:
        productos = [p for p in productos if any(q in str(p.get(k) or "").lower() for k in ("nombre", "marca", "categoria", "subcategoria"))]
    if tienda:
        productos = [p for p in productos if p.get("tienda") == tienda]
    if orden == "nombre":
        productos.sort(key=lambda p: str(p.get("nombre") or "").lower())
    else:
        productos.sort(key=lambda p: (p.get("precio") is None, p.get("precio") or 0))

    total_filtrados = len(productos)
    paginas = max(1, math.ceil(total_filtrados / PAGE_SIZE))
    pagina = min(pagina, paginas)
    inicio_p = (pagina - 1) * PAGE_SIZE
    productos = productos[inicio_p:inicio_p + PAGE_SIZE]
    tiendas = sorted({p.get("tienda", "") for p in catalogo if p.get("tienda")})
    return render_template_string(TEMPLATE, productos=productos, total=len(catalogo), total_filtrados=total_filtrados, tiendas=tiendas, q=q, tienda=tienda, orden=orden, pagina=pagina, paginas=paginas)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
