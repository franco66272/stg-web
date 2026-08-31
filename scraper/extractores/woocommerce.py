from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "ReparaRadar/1.0 (+catalog collector)",
    "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
})

PER_PAGE = 100
TIMEOUT = 30
MAX_PAGES = 200
RETRIES = 3


def _get(url: str, **params) -> requests.Response:
    last = None
    for attempt in range(RETRIES):
        try:
            response = SESSION.get(url, params=params or None, timeout=TIMEOUT)
            if response.status_code in (429, 500, 502, 503, 504):
                wait = min(12, 2 ** attempt)
                time.sleep(wait)
                last = RuntimeError(f"HTTP {response.status_code}: {response.url}")
                continue
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            last = exc
            if attempt < RETRIES - 1:
                time.sleep(1.5 * (attempt + 1))
    raise last or RuntimeError(f"No se pudo obtener {url}")


def _money(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # WooCommerce Store API normalmente entrega minor units; HTML puede entregar formato AR.
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _stock(product: dict[str, Any]) -> int | None:
    if product.get("is_in_stock") is True:
        qty = product.get("stock_quantity")
        return int(qty) if isinstance(qty, (int, float)) and qty >= 0 else 1
    if product.get("is_in_stock") is False:
        return 0
    return None


def _api_item(p: dict[str, Any], tienda: str) -> dict[str, Any]:
    prices = p.get("prices") or {}
    raw_price = prices.get("price")
    raw_regular = prices.get("regular_price")
    raw_sale = prices.get("sale_price")
    # Store API usa minor units y decimal_places.
    decimals = int(prices.get("currency_minor_unit", 2) or 2)
    divisor = 10 ** decimals

    def api_money(v):
        if v in (None, ""):
            return None
        try:
            return float(v) / divisor
        except (ValueError, TypeError):
            return _money(v)

    cats = p.get("categories") or []
    category = cats[0].get("name") if cats else "Otros"
    subcategory = cats[1].get("name") if len(cats) > 1 else None
    images = p.get("images") or []
    image = images[0].get("src") if images else None
    sku = p.get("sku") or None
    return {
        "tienda": tienda,
        "nombre": BeautifulSoup(str(p.get("name") or ""), "html.parser").get_text(" ", strip=True),
        "marca": None,
        "categoria": category,
        "subcategoria": subcategory,
        "precio": api_money(raw_price),
        "precio_anterior": api_money(raw_regular) if raw_sale not in (None, "") else None,
        "stock": _stock(p),
        "imagen": image,
        "url": p.get("permalink") or "",
        "id_producto": sku or str(p.get("id") or p.get("permalink") or ""),
        "sku": sku,
        "moneda": (prices.get("currency_code") or "ARS"),
    }


def _api_catalogo(base: str, tienda: str) -> list[dict[str, Any]]:
    endpoint = urljoin(base.rstrip("/") + "/", "wp-json/wc/store/v1/products")
    items: list[dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        response = _get(endpoint, per_page=PER_PAGE, page=page)
        data = response.json()
        if not isinstance(data, list):
            raise RuntimeError("WooCommerce Store API devolvió un formato inesperado")
        if not data:
            break
        items.extend(_api_item(p, tienda) for p in data if isinstance(p, dict))
        total_pages = int(response.headers.get("X-WP-TotalPages", "0") or 0)
        if total_pages and page >= total_pages:
            break
        if len(data) < PER_PAGE:
            break
    return items


def _html_catalogo(base: str, tienda: str) -> list[dict[str, Any]]:
    # Fallback para tiendas que bloqueen la Store API.
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in range(1, MAX_PAGES + 1):
        url = base.rstrip("/") + ("/page/{}/".format(page) if page > 1 else "/")
        response = _get(url)
        soup = BeautifulSoup(response.text, "html.parser")
        cards = soup.select("li.product, .product.type-product, .product-card")
        if not cards:
            if page == 1:
                raise RuntimeError("No se encontraron tarjetas de producto en HTML")
            break
        new_count = 0
        for card in cards:
            link = card.select_one("a.woocommerce-LoopProduct-link[href], a.product-card__link[href], a[href]")
            if not link:
                continue
            href = urljoin(response.url, link.get("href", ""))
            if not href or href in seen:
                continue
            name = card.select_one(".woocommerce-loop-product__title, .product-title, h2, h3")
            price = card.select_one(".price, .product-price")
            image = card.select_one("img")
            text = name.get_text(" ", strip=True) if name else link.get_text(" ", strip=True)
            price_text = price.get_text(" ", strip=True) if price else ""
            value = _money(price_text)
            if not text or value is None:
                continue
            seen.add(href)
            items.append({
                "tienda": tienda,
                "nombre": text,
                "marca": None,
                "categoria": "Otros",
                "subcategoria": None,
                "precio": value,
                "precio_anterior": None,
                "stock": None,
                "imagen": urljoin(response.url, image.get("src")) if image and image.get("src") else None,
                "url": href,
                "id_producto": href,
                "sku": None,
                "moneda": "ARS",
            })
            new_count += 1
        if new_count == 0:
            break
    return items


def extraer_catalogo(url: str, tienda: str = "") -> list[dict[str, Any]]:
    tienda = tienda or url
    try:
        items = _api_catalogo(url, tienda)
        if items:
            return items
    except Exception as api_error:
        print(f"    Store API no disponible: {api_error}")
    return _html_catalogo(url, tienda)
