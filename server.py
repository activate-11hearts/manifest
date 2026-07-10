"""Manifest — healing studio app server.

Run with:  python server.py
Then open  http://localhost:8748

No dependencies required (Python standard library only).
Serves the app from /public, your artwork from /paintings,
your audio from /meditations, and persists bookings and
session logs as JSON files in /data.
"""

import json
import mimetypes
import os
import re
import time
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
PAINTINGS = os.path.join(ROOT, "paintings")
MEDITATIONS = os.path.join(ROOT, "meditations")
DATA = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp", ".avif"}

# .avif isn't in Python's mimetypes table on all versions
mimetypes.add_type("image/avif", ".avif")
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac", ".opus"}

# On a host (Render etc.) PORT is set in the environment and we must accept
# outside connections; locally we stay on localhost.
PORT = int(os.environ.get("PORT", 8748))
HOST = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"

for d in (PAINTINGS, MEDITATIONS, DATA):
    os.makedirs(d, exist_ok=True)


def pretty_title(filename):
    """Turn 'morning-light_02.jpg' into 'Morning Light 02'."""
    name = os.path.splitext(filename)[0]
    name = re.sub(r"[-_]+", " ", name).strip()
    return name.title() if name else filename


def list_media(folder, exts, url_prefix):
    items = []
    try:
        entries = sorted(os.listdir(folder))
    except OSError:
        entries = []
    for entry in entries:
        ext = os.path.splitext(entry)[1].lower()
        if ext in exts:
            items.append({
                "file": entry,
                "title": pretty_title(entry),
                "url": f"{url_prefix}/{entry}",
            })
    return items


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


BOOKINGS_FILE = os.path.join(DATA, "bookings.json")
SESSIONS_FILE = os.path.join(DATA, "sessions.json")
ORDERS_FILE = os.path.join(DATA, "orders.json")
CONFIG_FILE = os.path.join(ROOT, "payment-config.json")

DEFAULT_CONFIG = {
    "_help": "Paste your keys below to switch from demo mode to live payments. "
             "Stripe keys: dashboard.stripe.com -> Developers -> API keys. "
             "PayPal client id: developer.paypal.com -> Apps & Credentials. "
             "Prices are in whole dollars; set a painting/meditation price to 0 "
             "to show 'inquire' instead of a Buy button.",
    "currency": "usd",
    "stripe_publishable_key": "",
    "stripe_secret_key": "",
    "paypal_client_id": "",
    "session_prices": {
        "Introductory Session — 45 min": 75,
        "Full Session — 75 min": 150,
        "Series of Four — 4 × 75 min": 500,
    },
    "painting_default_price": 0,
    "painting_prices": {},
    "meditation_default_price": 0,
    "meditation_prices": {},
}


def payment_config():
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(read_json(CONFIG_FILE, {}))
    return cfg


if not os.path.exists(CONFIG_FILE):
    write_json(CONFIG_FILE, DEFAULT_CONFIG)


def item_price(cfg, kind, filename):
    """Price for a painting/meditation file, falling back to the default."""
    specific = cfg.get(f"{kind}_prices", {}).get(filename)
    if specific is not None:
        return specific
    return cfg.get(f"{kind}_default_price", 0)


def studio_pin():
    """PIN protecting the practitioner Studio. Env var wins; payment-config
    'studio_pin' works locally. Empty = Studio open (local use)."""
    return os.environ.get("STUDIO_PIN") or str(payment_config().get("studio_pin") or "")


def stripe_api(method, path, params, secret_key):
    data = urllib.parse.urlencode(params).encode() if params else None
    req = urllib.request.Request("https://api.stripe.com" + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + secret_key)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.load(resp)


def record_order(method, item, amount, currency, payer="", status="paid", ref=""):
    orders = read_json(ORDERS_FILE, [])
    order = {
        "id": uuid.uuid4().hex[:10],
        "created": time.strftime("%Y-%m-%d %H:%M"),
        "method": method,
        "item": str(item)[:300],
        "amount": round(float(amount), 2),
        "currency": currency,
        "payer": str(payer)[:200],
        "status": status,
        "ref": str(ref)[:200],
    }
    orders.insert(0, order)
    write_json(ORDERS_FILE, orders)
    return order


class Handler(SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # keep the console quiet

    # ---------- helpers ----------

    def studio_ok(self):
        pin = studio_pin()
        return not pin or self.headers.get("X-Studio-Pin") == pin

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1_000_000:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def serve_file(self, base_dir, rel_path):
        # Resolve safely inside base_dir only.
        full = os.path.normpath(os.path.join(base_dir, rel_path))
        if not full.startswith(os.path.normpath(base_dir) + os.sep) and full != os.path.normpath(base_dir):
            self.send_error(403)
            return
        if not os.path.isfile(full):
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(500)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---------- routes ----------

    def do_GET(self):
        path = unquote(self.path.split("?")[0])

        if path == "/api/paintings":
            cfg = payment_config()
            items = list_media(PAINTINGS, IMAGE_EXTS, "/paintings")
            for it in items:
                it["price"] = item_price(cfg, "painting", it["file"])
            self.send_json(items)
        elif path == "/api/meditations":
            cfg = payment_config()
            items = list_media(MEDITATIONS, AUDIO_EXTS, "/meditations")
            for it in items:
                it["price"] = item_price(cfg, "meditation", it["file"])
            self.send_json(items)
        elif path == "/api/config":
            cfg = payment_config()
            self.send_json({
                "currency": cfg["currency"],
                "session_prices": cfg["session_prices"],
                "stripe_publishable_key": cfg["stripe_publishable_key"],
                "paypal_client_id": cfg["paypal_client_id"],
                "stripe_enabled": bool(cfg["stripe_secret_key"] and cfg["stripe_publishable_key"]),
                "paypal_enabled": bool(cfg["paypal_client_id"]),
            })
        elif path == "/api/orders":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            self.send_json(read_json(ORDERS_FILE, []))
        elif path.startswith("/api/checkout/stripe/verify"):
            query = parse_qs(urlparse(self.path).query)
            session_id = (query.get("session_id") or [""])[0]
            cfg = payment_config()
            if not session_id or not cfg["stripe_secret_key"]:
                self.send_json({"error": "not configured"}, 400)
                return
            try:
                session = stripe_api("GET", f"/v1/checkout/sessions/{session_id}", None, cfg["stripe_secret_key"])
            except Exception:
                self.send_json({"error": "could not verify payment"}, 502)
                return
            if session.get("payment_status") == "paid":
                orders = read_json(ORDERS_FILE, [])
                if any(o.get("ref") == session_id for o in orders):
                    self.send_json({"ok": True, "already": True})
                    return
                order = record_order(
                    "stripe",
                    session.get("metadata", {}).get("item", "Purchase"),
                    (session.get("amount_total") or 0) / 100,
                    session.get("currency", cfg["currency"]),
                    payer=(session.get("customer_details") or {}).get("email", ""),
                    ref=session_id,
                )
                self.send_json({"ok": True, "order": order})
            else:
                self.send_json({"ok": False, "status": session.get("payment_status")})
        elif path == "/api/bookings":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            self.send_json(read_json(BOOKINGS_FILE, []))
        elif path == "/api/sessions":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            self.send_json(read_json(SESSIONS_FILE, []))
        elif path.startswith("/paintings/"):
            self.serve_file(PAINTINGS, path[len("/paintings/"):])
        elif path.startswith("/meditations/"):
            self.serve_file(MEDITATIONS, path[len("/meditations/"):])
        else:
            if path == "/":
                path = "/index.html"
            self.serve_file(PUBLIC, path.lstrip("/"))

    def do_POST(self):
        path = self.path.split("?")[0]
        body = self.read_body()
        if body is None:
            self.send_json({"error": "invalid request body"}, 400)
            return

        if path == "/api/bookings":
            bookings = read_json(BOOKINGS_FILE, [])
            booking = {
                "id": uuid.uuid4().hex[:10],
                "created": time.strftime("%Y-%m-%d %H:%M"),
                "status": "new",
                "name": str(body.get("name", ""))[:200],
                "email": str(body.get("email", ""))[:200],
                "phone": str(body.get("phone", ""))[:50],
                "offering": str(body.get("offering", ""))[:200],
                "mode": str(body.get("mode", ""))[:50],
                "preferred": str(body.get("preferred", ""))[:200],
                "notes": str(body.get("notes", ""))[:2000],
            }
            bookings.insert(0, booking)
            write_json(BOOKINGS_FILE, bookings)
            self.send_json(booking, 201)

        elif path == "/api/bookings/status":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            bookings = read_json(BOOKINGS_FILE, [])
            for b in bookings:
                if b.get("id") == body.get("id"):
                    b["status"] = str(body.get("status", "new"))[:30]
            write_json(BOOKINGS_FILE, bookings)
            self.send_json({"ok": True})

        elif path == "/api/sessions":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            sessions = read_json(SESSIONS_FILE, [])
            session = {
                "id": uuid.uuid4().hex[:10],
                "date": str(body.get("date", ""))[:50] or time.strftime("%Y-%m-%d"),
                "client": str(body.get("client", ""))[:200],
                "program": str(body.get("program", ""))[:200],
                "minutes": int(body.get("minutes") or 0),
                "feeling": int(body.get("feeling") or 0),
                "notes": str(body.get("notes", ""))[:5000],
            }
            sessions.insert(0, session)
            write_json(SESSIONS_FILE, sessions)
            self.send_json(session, 201)

        elif path == "/api/checkout/stripe":
            cfg = payment_config()
            if not cfg["stripe_secret_key"]:
                self.send_json({"error": "Stripe is not configured yet"}, 400)
                return
            item = str(body.get("item", "Purchase"))[:200]
            try:
                amount = int(round(float(body.get("amount", 0)) * 100))
            except (TypeError, ValueError):
                amount = 0
            if amount < 50:  # Stripe minimum
                self.send_json({"error": "invalid amount"}, 400)
                return
            host = self.headers.get("Host") or f"localhost:{PORT}"
            scheme = "http" if host.startswith(("localhost", "127.")) else "https"
            base = f"{scheme}://{host}"
            try:
                session = stripe_api("POST", "/v1/checkout/sessions", {
                    "mode": "payment",
                    "line_items[0][price_data][currency]": cfg["currency"],
                    "line_items[0][price_data][product_data][name]": item,
                    "line_items[0][price_data][unit_amount]": amount,
                    "line_items[0][quantity]": 1,
                    "metadata[item]": item,
                    "success_url": base + "/?stripe_session={CHECKOUT_SESSION_ID}",
                    "cancel_url": base + "/?payment=cancelled",
                }, cfg["stripe_secret_key"])
            except Exception:
                self.send_json({"error": "Stripe rejected the request — check your keys"}, 502)
                return
            self.send_json({"url": session.get("url")})

        elif path == "/api/orders":
            # Records PayPal captures and demo payments (Stripe is recorded
            # server-side after verification).
            method = str(body.get("method", ""))[:20]
            if method not in ("paypal", "demo"):
                self.send_json({"error": "invalid method"}, 400)
                return
            cfg = payment_config()
            order = record_order(
                method,
                body.get("item", "Purchase"),
                body.get("amount", 0),
                cfg["currency"],
                payer=body.get("payer", ""),
                status="demo" if method == "demo" else "paid",
                ref=body.get("ref", ""),
            )
            self.send_json(order, 201)

        elif path == "/api/sessions/delete":
            if not self.studio_ok():
                self.send_json({"error": "pin required"}, 401)
                return
            sessions = read_json(SESSIONS_FILE, [])
            sessions = [s for s in sessions if s.get("id") != body.get("id")]
            write_json(SESSIONS_FILE, sessions)
            self.send_json({"ok": True})

        else:
            self.send_error(404)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Manifest is running — open http://localhost:{PORT}")
    server.serve_forever()
