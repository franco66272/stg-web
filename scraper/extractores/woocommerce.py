from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
    "Accept-Language": "es-AR,es;q=0.9",
}


def _precio(valor):
    if valor is None:
        return None
    s = re.sub(r"[^0-9,.-]", "", str(valor)).strip()
    if not s:
        return None
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


def _producto_desde_json(obj, base):
    if not isinstance(obj, dict):
        return None
    tipos = obj.get("@type")
    tipos = tipos if isinstance(tipos, list) else [tipos]
    if "Product" not in tipos:
        return None
    offers = obj.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    if not isinstance(offers, dict):
        return None
    precio = _precio(offers.get("price"))
    nombre = str(obj.get("name") or "").strip()
    url = urljoin(base, str(obj.get("url") or ""))
    if not nombre or not precio or not url:
        return None
    image = obj.get("image")
    if isinstance(image, list):
        image = image[0] if image else None
    return {
        "nombre": nombre,
        "marca": None,
        "categoria": None,
        "subcategoria": None,
        "precio": precio,
        "precio_anterior": None,
        "stock": 0 if str(offers.get("availability") or "").lower().endswith("outofstock") else 1,
        "imagen": urljoin(base, image) if image else None,
        "url": url,
        "id_producto": str(obj.get("sku") or obj.get("mpn") or url),
        "sku": obj.get("sku"),
    }


def _extraer_pagina(url, session):
    r = session.get(url, timeout=30, headers=HEADERS)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    productos = []

    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or script.get_text())
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
                continue
            p = _producto_desde_json(item, r.url)
            if p:
                productos.append(p)

    if productos:
        return productos, soup

    # Fallback WooCommerce clásico.
    for card in soup.select("li.product, .product, .type-product"):
        link = card.select_one("a.woocommerce-LoopProduct-link[href], a[href]")
        name = card.select_one(".woocommerce-loop-product__title, .product_title, h2, h3")
        price = card.select_one(".price ins .amount, .price .amount, .price")
        if not link or not name or not price:
            continue
        href = urljoin(r.url, link.get("href"))
        nombre = name.get_text(" ", strip=True)
        precio = _precio(price.get_text(" ", strip=True))
        if not href or not nombre or not precio:
            continue
        img = card.select_one("img")
        image = None
        if img:
            image = img.get("data-src") or img.get("data-lazy-src") or img.get("src")
            if image:
                image = urljoin(r.url, image)
        in_stock = not bool(card.select_one(".outofstock"))
        productos.append({
            "nombre": nombre,
            "marca": None,
            "categoria": None,
            "subcategoria": None,
            "precio": precio,
            "precio_anterior": None,
            "stock": 1 if in_stock else 0,
            "imagen": image,
            "url": href,
            "id_producto": href,
            "sku": None,
        })

    return productos, soup


def _siguiente(soup, current_url):
    node = soup.select_one("a.next.page-numbers, a.next, a[rel='next']")
    return urljoin(current_url, node.get("href")) if node and node.get("href") else None


def extraer_catalogo(base_url: str):
    session = requests.Session()
    session.headers.update(HEADERS)
    vistos = set()
    salida = []
    url = base_url
    for _ in range(300):
        if not url or url in vistos:
            break
        vistos.add(url)
        try:
            productos, soup = _extraer_pagina(url, session)
        except requests.RequestException:
            break
        nuevos = 0
        for p in productos:
            key = str(p.get("id_producto") or p.get("url") or p.get("nombre") or "").strip()
            if key and key not in {x["id_producto"] for x in salida}:
                salida.append(p)
                nuevos += 1
        siguiente = _siguiente(soup, url)
        if not siguiente or nuevos == 0:
            break
        url = siguiente
    return salida
