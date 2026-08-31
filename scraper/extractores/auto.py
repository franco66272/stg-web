from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

TIMEOUT = 25
RETRIES = 3
MAX_SITEMAPS = 30
MAX_PRODUCT_URLS = 10000
MAX_HTML_PAGES = 250

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "ReparaRadar/1.0 (+catalog collector)",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
})


def _get(url: str, **params) -> requests.Response:
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            r = SESSION.get(url, params=params or None, timeout=TIMEOUT)
            if r.status_code in (429, 500, 502, 503, 504):
                last = RuntimeError(f"HTTP {r.status_code}")
                time.sleep(min(8, 1.5 * (attempt + 1)))
                continue
            r.raise_for_status()
            return r
        except requests.RequestException as exc:
            last = exc
            if attempt < RETRIES - 1:
                time.sleep(1.0 * (attempt + 1))
    raise last or RuntimeError(f"No se pudo obtener {url}")


def _clean(text: Any) -> str:
    return BeautifulSoup(str(text or ""), "html.parser").get_text(" ", strip=True)


def _money(value: Any) -> float | None:
    if value is None:
        return None
    text = _clean(value).replace("ARS", "").replace("$", "").strip()
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        # En precios argentinos la coma suele ser decimal.
        parts = text.split(",")
        text = "".join(parts[:-1]) + "." + parts[-1] if len(parts[-1]) <= 2 else "".join(parts)
    elif text.count(".") > 1:
        text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def _jsonld(soup: BeautifulSoup) -> list[dict[str, Any]]:
    out = []
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.string or node.get_text())
        except Exception:
            continue
        values = data if isinstance(data, list) else [data]
        for value in values:
            if isinstance(value, dict) and isinstance(value.get("@graph"), list):
                values.extend(x for x in value["@graph"] if isinstance(x, dict))
        out.extend(x for x in values if isinstance(x, dict))
    return out


def _product_from_jsonld(soup: BeautifulSoup, page_url: str, tienda: str) -> dict[str, Any] | None:
    for data in _jsonld(soup):
        typ = data.get("@type")
        types = typ if isinstance(typ, list) else [typ]
        if not any(str(x).lower() == "product" for x in types):
            continue
        offers = data.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if not isinstance(offers, dict):
            offers = {}
        image = data.get("image")
        if isinstance(image, list):
            image = image[0] if image else None
        brand = data.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")
        availability = str(offers.get("availability") or "").lower()
        stock = 0 if "outofstock" in availability else (1 if "instock" in availability else None)
        url = data.get("url") or page_url
        return {
            "tienda": tienda,
            "nombre": _clean(data.get("name")),
            "marca": _clean(brand) or None,
            "categoria": "Otros",
            "subcategoria": None,
            "precio": _money(offers.get("price")),
            "precio_anterior": None,
            "stock": stock,
            "imagen": urljoin(page_url, image) if image else None,
            "url": urljoin(page_url, str(url)),
            "id_producto": data.get("sku") or data.get("mpn") or url,
            "sku": data.get("sku"),
            "moneda": offers.get("priceCurrency") or "ARS",
        }
    return None


def _woocommerce_api(base: str, tienda: str) -> list[dict[str, Any]]:
    endpoint = urljoin(base.rstrip("/") + "/", "wp-json/wc/store/v1/products")
    result = []
    for page in range(1, 201):
        r = _get(endpoint, per_page=100, page=page)
        data = r.json()
        if not isinstance(data, list):
            raise RuntimeError("Store API WooCommerce devolvió formato inesperado")
        if not data:
            break
        for p in data:
            prices = p.get("prices") or {}
            decimals = int(prices.get("currency_minor_unit", 2) or 2)
            div = 10 ** decimals
            def api_money(v):
                try:
                    return float(v) / div if v not in (None, "") else None
                except (ValueError, TypeError):
                    return _money(v)
            cats = p.get("categories") or []
            imgs = p.get("images") or []
            result.append({
                "tienda": tienda,
                "nombre": _clean(p.get("name")),
                "marca": None,
                "categoria": cats[0].get("name") if cats else "Otros",
                "subcategoria": cats[1].get("name") if len(cats) > 1 else None,
                "precio": api_money(prices.get("price")),
                "precio_anterior": api_money(prices.get("regular_price")) if prices.get("sale_price") not in (None, "") else None,
                "stock": 1 if p.get("is_in_stock") else 0 if p.get("is_in_stock") is False else None,
                "imagen": imgs[0].get("src") if imgs else None,
                "url": p.get("permalink") or "",
                "id_producto": p.get("sku") or p.get("id") or p.get("permalink"),
                "sku": p.get("sku") or None,
                "moneda": prices.get("currency_code") or "ARS",
            })
        total_pages = int(r.headers.get("X-WP-TotalPages", "0") or 0)
        if total_pages and page >= total_pages:
            break
        if len(data) < 100:
            break
    return result


def _shopify(base: str, tienda: str) -> list[dict[str, Any]]:
    r = _get(urljoin(base.rstrip("/") + "/", "products.json"), limit=250)
    data = r.json()
    products = data.get("products") if isinstance(data, dict) else None
    if not isinstance(products, list):
        raise RuntimeError("Shopify products.json no disponible")
    out = []
    for p in products:
        variants = p.get("variants") or []
        v = variants[0] if variants else {}
        image = (p.get("images") or [{}])[0].get("src")
        out.append({
            "tienda": tienda,
            "nombre": _clean(p.get("title")),
            "marca": p.get("vendor") or None,
            "categoria": p.get("product_type") or "Otros",
            "subcategoria": None,
            "precio": _money(v.get("price")),
            "precio_anterior": _money(v.get("compare_at_price")),
            "stock": 1 if any(int(x.get("inventory_quantity") or 0) > 0 for x in variants) else 0,
            "imagen": image,
            "url": urljoin(base.rstrip("/") + "/", f"products/{p.get('handle')}"),
            "id_producto": v.get("sku") or p.get("id") or p.get("handle"),
            "sku": v.get("sku") or None,
            "moneda": "ARS",
        })
    return out


def _sitemap_urls(base: str) -> list[str]:
    candidates = [
        urljoin(base.rstrip("/") + "/", "sitemap_index.xml"),
        urljoin(base.rstrip("/") + "/", "wp-sitemap.xml"),
        urljoin(base.rstrip("/") + "/", "sitemap.xml"),
    ]
    queue = candidates[:]
    seen = set()
    urls: list[str] = []
    while queue and len(seen) < MAX_SITEMAPS:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        try:
            r = _get(sm)
        except Exception:
            continue
        soup = BeautifulSoup(r.text, "xml")
        locs = [x.get_text(strip=True) for x in soup.find_all("loc")]
        for loc in locs:
            if loc.endswith(".xml") or "sitemap" in loc.lower():
                if loc not in seen:
                    queue.append(loc)
            else:
                urls.append(loc)
    return list(dict.fromkeys(urls))[:MAX_PRODUCT_URLS]


def _sitemap_catalog(base: str, tienda: str) -> list[dict[str, Any]]:
    urls = _sitemap_urls(base)
    if not urls:
        raise RuntimeError("No se encontró sitemap utilizable")
    # Primero intentamos URLs que parezcan productos. Si no hay señal, usamos las primeras URLs.
    productish = [u for u in urls if re.search(r"/(producto|product|productos|tienda|item|p)/", u, re.I)]
    targets = productish or urls
    out = []
    for index, url in enumerate(targets[:MAX_PRODUCT_URLS], 1):
        try:
            r = _get(url)
            soup = BeautifulSoup(r.text, "lxml")
            item = _product_from_jsonld(soup, r.url, tienda)
            if item and item.get("nombre") and item.get("precio") is not None:
                out.append(item)
        except Exception:
            continue
        if index % 100 == 0:
            print(f"    sitemap: {index}/{len(targets)} URLs, {len(out)} productos")
    return out


def _html_catalog(base: str, tienda: str) -> list[dict[str, Any]]:
    out = []
    seen = set()
    queue = [base]
    pages = 0
    while queue and pages < MAX_HTML_PAGES:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            r = _get(url)
        except Exception:
            continue
        pages += 1
        soup = BeautifulSoup(r.text, "lxml")
        for script in soup.select('script[type="application/ld+json"]'):
            item = _product_from_jsonld(soup, r.url, tienda)
            if item and item.get("nombre") and item.get("precio") is not None:
                out.append(item)
                break
        for a in soup.select("a[href]"):
            href = urljoin(r.url, a.get("href"))
            parsed = urlparse(href)
            if parsed.netloc != urlparse(base).netloc:
                continue
            if re.search(r"(producto|product|productos|tienda|categoria|categorias|shop|catalog|page)", href, re.I) and href not in seen:
                queue.append(href.split("#", 1)[0])
    return out


def extraer_catalogo(url: str, tienda: str = "") -> list[dict[str, Any]]:
    tienda = tienda or urlparse(url).netloc
    errores = []
    for name, fn in (("WooCommerce", _woocommerce_api), ("Shopify", _shopify), ("Sitemap", _sitemap_catalog), ("HTML", _html_catalog)):
        try:
            items = fn(url, tienda)
            if items:
                print(f"    Fuente seleccionada: {name} ({len(items)} productos)")
                return items
            errores.append(f"{name}: sin productos")
        except Exception as exc:
            errores.append(f"{name}: {exc}")
    raise RuntimeError(" | ".join(errores))
