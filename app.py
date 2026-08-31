from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

from flask import Flask, render_template_string, request

ROOT = Path(__file__).resolve().parent
CATALOGO = ROOT / "catalogo.json"
PAGE_SIZE = 48

app = Flask(__name__)

TEMPLATE = r'''
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReparaRadar — insumos y herramientas para reparación</title>
<style>
*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;margin:0;background:#f5f7fa;color:#17202a}header{background:#0d1726;color:#fff;padding:18px 24px;position:sticky;top:0;z-index:5}.head{max-width:1320px;margin:auto}.brand{font-size:24px;font-weight:900}.tag{opacity:.65;font-size:13px}.search{display:flex;gap:8px;margin-top:16px}.search input{flex:1;padding:13px;border-radius:9px;border:1px solid #ccd4dd;font-size:16px}.search button,.apply{padding:13px 20px;border:0;border-radius:9px;background:#246bfe;color:#fff;font-weight:800;cursor:pointer}main{max-width:1320px;margin:auto;padding:24px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}.stat{background:#fff;border:1px solid #e0e5eb;border-radius:12px;padding:16px}.stat b{display:block;font-size:24px}.stat span{color:#68737d;font-size:13px}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.filters select,.filters input{padding:10px;border:1px solid #ccd4dd;border-radius:8px;background:white}.meta{margin:18px 0;color:#5c6770}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:16px}.card{background:white;border:1px solid #e0e4e8;border-radius:12px;padding:14px;display:flex;flex-direction:column;min-height:330px;box-shadow:0 2px 8px #00000008}.card img{width:100%;height:175px;object-fit:contain;background:#fff}.name{font-weight:750;line-height:1.3;margin-top:8px}.store{font-size:12px;color:#68737d;margin-top:8px}.cat{font-size:12px;color:#246bfe;margin-top:4px}.price{font-size:21px;font-weight:900;margin-top:8px}.stock{font-size:12px;margin-top:4px;color:#27844a}.out{color:#b44}.link{display:inline-block;margin-top:auto;padding-top:12px;color:#246bfe;text-decoration:none;font-weight:700}.pagination{display:flex;justify-content:center;gap:8px;margin:28px 0}.pagination a{background:white;border:1px solid #ccd;padding:9px 14px;border-radius:7px;text-decoration:none;color:#17202a}.empty{padding:50px;text-align:center;background:white;border-radius:12px}.stores{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.stores a{background:#fff;border:1px solid #e0e4e8;border-radius:20px;padding:8px 12px;text-decoration:none;color:#17202a;font-size:13px}.note{font-size:12px;color:#78838e;margin-top:8px}
</style></head>
<body><header><div class="head"><div class="brand">REPARARADAR <span class="tag">· herramientas, insumos y repuestos</span></div><form class="search" method="get"><input name="q" value="{{q}}" placeholder="Microscopio, flux, pantalla, batería, programadora..."><button>Buscar</button></form></div></header>
<main>
<div class="stats"><div class="stat"><b>{{total}}</b><span>productos en catálogo</span></div><div class="stat"><b>{{tiendas|length}}</b><span>tiendas</span></div><div class="stat"><b>{{categorias|length}}</b><span>categorías</span></div><div class="stat"><b>{{total_filtrados}}</b><span>resultados actuales</span></div></div>
<div class="stores">{% for t in tiendas %}<a href="{{url_for('inicio',tienda=t)}}">{{t}} · {{store_counts[t]}}</a>{% endfor %}</div>
<form class="filters" method="get"><input type="hidden" name="q" value="{{q}}"><select name="tienda"><option value="">Todas las tiendas</option>{% for t in tiendas %}<option value="{{t}}" {% if t==tienda %}selected{% endif %}>{{t}}</option>{% endfor %}</select><select name="categoria"><option value="">Todas las categorías</option>{% for c in categorias %}<option value="{{c}}" {% if c==categoria %}selected{% endif %}>{{c}}</option>{% endfor %}</select><input type="number" name="precio_min" value="{{precio_min}}" placeholder="Precio desde"><input type="number" name="precio_max" value="{{precio_max}}" placeholder="Precio hasta"><select name="orden"><option value="precio" {% if orden=='precio' %}selected{% endif %}>Precio más bajo</option><option value="mayor" {% if orden=='mayor' %}selected{% endif %}>Precio más alto</option><option value="nombre" {% if orden=='nombre' %}selected{% endif %}>Nombre</option></select><button class="apply">Aplicar</button></form>
<div class="meta">{{total_filtrados}} productos · página {{pagina}}/{{paginas}}<div class="note">Los precios y el stock corresponden a la última actualización del catálogo.</div></div>
{% if productos %}<section class="grid">{% for p in productos %}<article class="card">{% if p.imagen %}<img src="{{p.imagen}}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">{% endif %}<div class="store">{{p.tienda}}</div><div class="cat">{{p.categoria}}{% if p.subcategoria %} · {{p.subcategoria}}{% endif %}</div><div class="name">{{p.nombre}}</div><div class="price">{% if p.precio is not none %}${{'{:,.0f}'.format(p.precio).replace(',', '.')}}{% else %}Consultar{% endif %}</div>{% if p.stock == 0 %}<div class="stock out">Sin stock</div>{% elif p.stock is not none %}<div class="stock">Stock disponible</div>{% endif %}{% if p.url %}<a class="link" href="{{p.url}}" target="_blank" rel="noopener">Ver en tienda →</a>{% endif %}</article>{% endfor %}</section>{% else %}<div class="empty">No encontramos productos con esos filtros.</div>{% endif %}
{% if paginas>1 %}<nav class="pagination">{% if pagina>1 %}<a href="{{url_for('inicio',q=q,tienda=tienda,categoria=categoria,precio_min=precio_min,precio_max=precio_max,orden=orden,page=pagina-1)}}">← Anterior</a>{% endif %}{% if pagina<paginas %}<a href="{{url_for('inicio',q=q,tienda=tienda,categoria=categoria,precio_min=precio_min,precio_max=precio_max,orden=orden,page=pagina+1)}}">Siguiente →</a>{% endif %}</nav>{% endif %}
</main></body></html>
'''


def cargar() -> list[dict]:
    if not CATALOGO.exists():
        return []
    try:
        data = json.loads(CATALOGO.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


@app.get("/")
def inicio():
    catalogo = cargar()
    q = request.args.get("q", "").strip().lower()
    tienda = request.args.get("tienda", "").strip()
    categoria = request.args.get("categoria", "").strip()
    orden = request.args.get("orden", "precio")
    precio_min = request.args.get("precio_min", "").strip()
    precio_max = request.args.get("precio_max", "").strip()
    try:
        minimo = float(precio_min) if precio_min else None
        maximo = float(precio_max) if precio_max else None
    except ValueError:
        minimo = maximo = None
    try:
        pagina = max(1, int(request.args.get("page", "1")))
    except ValueError:
        pagina = 1

    productos = list(catalogo)
    if q:
        productos = [p for p in productos if any(q in str(p.get(k) or "").lower() for k in ("nombre", "marca", "categoria", "subcategoria", "sku"))]
    if tienda:
        productos = [p for p in productos if p.get("tienda") == tienda]
    if categoria:
        productos = [p for p in productos if p.get("categoria") == categoria]
    if minimo is not None:
        productos = [p for p in productos if p.get("precio") is not None and p.get("precio") >= minimo]
    if maximo is not None:
        productos = [p for p in productos if p.get("precio") is not None and p.get("precio") <= maximo]

    if orden == "nombre":
        productos.sort(key=lambda p: str(p.get("nombre") or "").lower())
    elif orden == "mayor":
        productos.sort(key=lambda p: (p.get("precio") is None, -(p.get("precio") or 0)))
    else:
        productos.sort(key=lambda p: (p.get("precio") is None, p.get("precio") or 0))

    total_filtrados = len(productos)
    paginas = max(1, math.ceil(total_filtrados / PAGE_SIZE))
    pagina = min(pagina, paginas)
    start = (pagina - 1) * PAGE_SIZE
    pagina_items = productos[start:start + PAGE_SIZE]
    tiendas = sorted({p.get("tienda", "") for p in catalogo if p.get("tienda")})
    categorias = sorted({p.get("categoria", "Otros") for p in catalogo if p.get("categoria")})
    store_counts = Counter(p.get("tienda") for p in catalogo if p.get("tienda"))
    return render_template_string(TEMPLATE, productos=pagina_items, total=len(catalogo), total_filtrados=total_filtrados, tiendas=tiendas, categorias=categorias, store_counts=store_counts, q=q, tienda=tienda, categoria=categoria, precio_min=precio_min, precio_max=precio_max, orden=orden, pagina=pagina, paginas=paginas)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
