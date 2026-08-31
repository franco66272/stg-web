from __future__ import annotations

import json
from pathlib import Path

from flask import Flask, render_template_string, request

ROOT = Path(__file__).resolve().parent
CATALOGO = ROOT / "catalogo.json"

app = Flask(__name__)

TEMPLATE = r'''
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReparaRadar</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#f4f6f8;color:#17202a}header{background:#101820;color:white;padding:18px 24px}main{max-width:1200px;margin:auto;padding:24px}.search{display:flex;gap:8px}.search input{flex:1;padding:12px;border-radius:8px;border:1px solid #ccd}.search button{padding:12px 20px;border:0;border-radius:8px;background:#2672ff;color:#fff;font-weight:700}.meta{margin:18px 0;color:#5c6770}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}.card{background:white;border:1px solid #e0e4e8;border-radius:12px;padding:14px}.card img{width:100%;height:170px;object-fit:contain}.name{font-weight:700;min-height:44px}.store{font-size:13px;color:#68737d}.price{font-size:20px;font-weight:800;margin-top:8px}.link{display:inline-block;margin-top:10px;color:#2672ff;text-decoration:none}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}.filters select{padding:9px}
</style></head>
<body><header><strong>REPARARADAR</strong><span> · Insumos, herramientas y repuestos para reparación móvil</span></header>
<main><form class="search"><input name="q" value="{{q}}" placeholder="Buscar microscopio, flux, pantalla, batería, programadora..."><button>Buscar</button></form>
<div class="filters"><select name="tienda" form="f"><option value="">Todas las tiendas</option>{% for t in tiendas %}<option value="{{t}}" {% if t==tienda %}selected{% endif %}>{{t}}</option>{% endfor %}</select></div>
<div class="meta">{{productos|length}} productos mostrados · {{total}} productos en catálogo</div>
<section class="grid">{% for p in productos %}<article class="card">{% if p.imagen %}<img src="{{p.imagen}}" loading="lazy" referrerpolicy="no-referrer">{% endif %}<div class="store">{{p.tienda}} · {{p.categoria}}</div><div class="name">{{p.nombre}}</div><div class="price">{% if p.precio is not none %}${{'{:,.0f}'.format(p.precio).replace(',', '.')}}{% else %}Consultar{% endif %}</div>{% if p.url %}<a class="link" href="{{p.url}}" target="_blank" rel="noopener">Ver en tienda →</a>{% endif %}</article>{% endfor %}</section></main></body></html>
'''


def cargar() -> list[dict]:
    if not CATALOGO.exists():
        return []
    return json.loads(CATALOGO.read_text(encoding="utf-8"))


@app.get("/")
def inicio():
    catalogo = cargar()
    q = request.args.get("q", "").strip().lower()
    tienda = request.args.get("tienda", "").strip()
    productos = catalogo
    if q:
        productos = [p for p in productos if q in str(p.get("nombre", "")).lower() or q in str(p.get("marca", "")).lower() or q in str(p.get("categoria", "")).lower()]
    if tienda:
        productos = [p for p in productos if p.get("tienda") == tienda]
    productos = sorted(productos, key=lambda p: (p.get("precio") is None, p.get("precio") or 0))[:500]
    tiendas = sorted({p.get("tienda", "") for p in catalogo if p.get("tienda")})
    return render_template_string(TEMPLATE, productos=productos, total=len(catalogo), tiendas=tiendas, q=q, tienda=tienda)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
