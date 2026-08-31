from __future__ import annotations

import json
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
    "Accept-Language": "es-AR,es;q=0.9",
}


def _precio(valor):
    if valor is None:
        return None
    s = re.sub(r"[^0-9,.-]", "", str(valor))
    if "," in s and "." in s:
        s = s.split(",", 1)[0].replace(".", "")
    elif "," in s:
        s = s.split(",", 1)[0]
    else:
        s = s.replace(".", "")
    try:
        n = int(s)
    except ValueError:
        return None
    return n if n >= 100 else None


def extraer_catalogo(base_url: str):
    session = requests.Session()
    session.headers.update(HEADERS)
    candidates = [
        base_url.rstrip("/") + "/products.json?limit=250",
        base_url.rstrip("/") + "/collections/all/products.json?limit=250",
    ]
    productos = []
    for endpoint in candidates:
        try:
            r = session.get(endpoint, timeout=30)
            if r.status_code != 200:
                continue
            data = r.json()
            items = data.get("products") if isinstance(data, dict) else data
            if not isinstance(items, list):
                continue
            for obj in items:
                nombre = str(obj.get("title") or "").strip()
                variants = obj.get("variants") or []
                variant = variants[0] if variants else {}
                precio = _precio(variant.get("price"))
                if not nombre or not precio:
                    continue
                handle = obj.get("handle")
                url = urljoin(base_url, "/products/" + str(handle)) if handle else base_url
                images = obj.get("images") or []
                image = images[0].get("src") if images and isinstance(images[0], dict) else None
                key = str(variant.get("sku") or obj.get("id") or url)
                productos.append({
                    "nombre": nombre,
                    "marca": obj.get("vendor"),
                    "categoria": None,
                    "subcategoria": None,
                    "precio": precio,
                    "precio_anterior": None,
                    "stock": 1 if variant.get("available", True) else 0,
                    "imagen": image,
                    "url": url,
                    "id_producto": key,
                    "sku": variant.get("sku"),
                })
            if productos:
                break
        except (requests.RequestException, ValueError):
            continue

    if productos:
        seen = set()
        return [p for p in productos if not (p["id_producto"] in seen or seen.add(p["id_producto"]))]

    return _html_fallback(base_url, session)


def _html_fallback(url, session):
    try:
        r = session.get(url, timeout=30)
        r.raise_for_status()
    except requests.RequestException:
        return []
    soup = BeautifulSoup(r.text, "lxml")
    out = []
    for card in soup.select(".product-card, .product-item, .card-product, product-card"):
        name = card.select_one(".card__heading, .product-title, .product-name, h2, h3")
        price = card.select_one(".price, .money, .product-price")
        link = card.select_one("a[href]")
        if not name or not price or not link:
            continue
        p = _precio(price.get_text(" ", strip=True))
        if not p:
            continue
        href = urljoin(r.url, link.get("href"))
        img = card.select_one("img")
        image = img.get("src") if img else None
        out.append({"nombre":name.get_text(" ", strip=True),"marca":None,"categoria":None,"subcategoria":None,"precio":p,"precio_anterior":None,"stock":1,"imagen":urljoin(r.url,image) if image else None,"url":href,"id_producto":href,"sku":None})
    return out
