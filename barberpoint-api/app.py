import hmac
import json
import os
import re
import time as time_module
import urllib.error
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, time, timedelta
from threading import Lock
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
app.config["JSON_SORT_KEYS"] = False

allowed_origins = ["https://323erir6.github.io"]
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "X-Admin-Key"],
            "supports_credentials": False,
            "max_age": 600,
        }
    },
)

KYIV_TZ = ZoneInfo("Europe/Kyiv")
OPENING_TIME = time(10, 0)
CLOSING_TIME = time(21, 0)
BOOKING_INTERVAL_MINUTES = 30
MAX_BOOKING_DAYS = 90

_rate_buckets = defaultdict(deque)
_rate_lock = Lock()


def local_now():
    return datetime.now(KYIV_TZ)


def local_today():
    return local_now().date()


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip() or "unknown"
    return request.remote_addr or "unknown"


def rate_limited(bucket, limit, window_seconds):
    now = time_module.monotonic()
    key = f"{bucket}:{client_ip()}"

    with _rate_lock:
        entries = _rate_buckets[key]
        cutoff = now - window_seconds
        while entries and entries[0] < cutoff:
            entries.popleft()

        if len(entries) >= limit:
            return True

        entries.append(now)
        return False


@app.before_request
def enforce_rate_limits():
    if request.path == "/api/bookings" and request.method == "POST":
        if rate_limited("booking", 6, 15 * 60):
            return jsonify({"error": "too many booking attempts"}), 429

    if request.path == "/api/reviews" and request.method == "POST":
        if rate_limited("review", 5, 60 * 60):
            return jsonify({"error": "too many review attempts"}), 429

    if request.path.startswith("/api/admin/"):
        if rate_limited("admin", 240, 5 * 60):
            return jsonify({"error": "too many admin requests"}), 429


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


def parse_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def parse_time(value):
    if value is None:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(str(value), fmt).time()
        except ValueError:
            pass
    return None


def combine(day, clock):
    return datetime.combine(day, clock)


def overlaps(start_a, duration_a, start_b, duration_b):
    end_a = start_a + timedelta(minutes=duration_a)
    end_b = start_b + timedelta(minutes=duration_b)
    return start_a < end_b and start_b < end_a


def admin_authorized():
    configured = os.environ.get("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key")
    return bool(
        configured
        and supplied
        and hmac.compare_digest(str(supplied), str(configured))
    )


def store_call(payload, timeout=20):
    url = os.environ.get("SUPABASE_STORE_URL")
    key = os.environ.get("SUPABASE_STORE_KEY")
    if not url or not key:
        return 503, {"error": "database store is not configured"}

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Store-Key": key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            data = json.loads(raw or "{}")
        except Exception:
            data = {"error": "database request failed"}
        return exc.code, data
    except Exception:
        return 503, {"error": "database temporarily unavailable"}


def require_store(payload, timeout=20):
    status, data = store_call(payload, timeout=timeout)
    if status >= 300:
        return None, (jsonify(data), status)
    return data, None


def service_public(item):
    return {
        "id": item["id"],
        "code": item["code"],
        "name_uk": item["name_uk"],
        "name_en": item["name_en"],
        "price": item["price"],
        "duration_minutes": item["duration_minutes"],
    }


def barber_public(item):
    return {
        "id": item["id"],
        "code": item["code"],
        "name_uk": item["name_uk"],
        "name_en": item["name_en"],
        "specialization": item["specialization"],
        "active": bool(item.get("active", True)),
    }


def relation_object(value):
    if isinstance(value, list):
        return value[0] if value else {}
    return value or {}


def get_services():
    status, data = store_call({"op": "services"})
    return data if status < 300 and isinstance(data, list) else None


def get_barbers(include_inactive=False):
    status, data = store_call({"op": "barbers", "include_inactive": include_inactive})
    return data if status < 300 and isinstance(data, list) else None


def find_service(service_id):
    rows = get_services()
    if rows is None:
        return None
    return next((row for row in rows if row["id"] == service_id), None)


def find_barber(barber_id, include_inactive=False):
    rows = get_barbers(include_inactive=include_inactive)
    if rows is None:
        return None
    return next((row for row in rows if row["id"] == barber_id), None)


def unique_barber_code(seed, existing):
    base = re.sub(r"[^a-z0-9]+", "-", (seed or "").lower()).strip("-")[:24] or "barber"
    used = {str(item.get("code", "")) for item in existing}
    code = base
    suffix = 2
    while code in used:
        code = f"{base[:20]}-{suffix}"
        suffix += 1
    return code


def generate_slots(barber_id, day, duration):
    status, data = store_call(
        {"op": "day_data", "barber_id": barber_id, "date": day.isoformat()}
    )
    if status >= 300:
        return None

    bookings = data.get("bookings", [])
    blocked = data.get("blocked_slots", [])
    opening = datetime.combine(day, OPENING_TIME)
    closing = datetime.combine(day, CLOSING_TIME)
    cursor = opening
    result = []

    while cursor + timedelta(minutes=duration) <= closing:
        allowed_by_time = day > local_today() or cursor.time() > local_now().time().replace(tzinfo=None)
        free = allowed_by_time

        if free:
            for booking in bookings:
                existing_clock = parse_time(booking.get("booking_time"))
                if not existing_clock:
                    continue
                existing = combine(day, existing_clock)
                if overlaps(cursor, duration, existing, int(booking.get("duration_minutes", 0))):
                    free = False
                    break

        if free:
            for slot in blocked:
                existing_clock = parse_time(slot.get("blocked_time"))
                if not existing_clock:
                    continue
                existing = combine(day, existing_clock)
                if overlaps(cursor, duration, existing, int(slot.get("duration_minutes", 0))):
                    free = False
                    break

        if free:
            result.append(cursor.strftime("%H:%M"))

        cursor += timedelta(minutes=BOOKING_INTERVAL_MINUTES)

    return result


@app.get("/")
def root():
    return jsonify(
        {
            "name": "BarberPoint API",
            "status": "ok",
            "database": "Supabase PostgreSQL",
            "docs": {
                "health": "/api/health",
                "services": "/api/services",
                "barbers": "/api/barbers",
                "available_slots": "/api/available-slots?barber_id=1&service_id=1&date=2026-10-10",
            },
        }
    )


@app.get("/api/health")
def health():
    status, data = store_call({"op": "health"})
    if status >= 300:
        return jsonify({"ok": False, "database": "unavailable"}), 503

    return jsonify(
        {
            "ok": True,
            "database": "postgresql",
            "provider": "supabase",
            "services": data.get("services", 0),
            "barbers": data.get("barbers", 0),
        }
    )


@app.get("/api/services")
def services():
    data, error = require_store({"op": "services"})
    if error:
        return error
    return jsonify([service_public(item) for item in data])


@app.get("/api/barbers")
def barbers():
    data, error = require_store({"op": "barbers"})
    if error:
        return error
    return jsonify([barber_public(item) for item in data])


@app.get("/api/available-slots")
def available_slots():
    barber_id = request.args.get("barber_id", type=int)
    service_id = request.args.get("service_id", type=int)
    day = parse_date(request.args.get("date"))

    if not barber_id or not service_id or not day:
        return jsonify({"error": "barber_id, service_id and date are required"}), 400
    if day < local_today():
        return jsonify({"error": "date is in the past"}), 400
    if day > local_today() + timedelta(days=MAX_BOOKING_DAYS):
        return jsonify({"error": "date is too far in the future"}), 400

    service = find_service(service_id)
    barber = find_barber(barber_id)
    if not service or not barber or not barber.get("active", True):
        return jsonify({"error": "invalid barber or service"}), 404

    slots = generate_slots(barber_id, day, int(service["duration_minutes"]))
    if slots is None:
        return jsonify({"error": "database temporarily unavailable"}), 503

    return jsonify(
        {
            "barber_id": barber_id,
            "service_id": service_id,
            "date": day.isoformat(),
            "slots": slots,
        }
    )


@app.post("/api/bookings")
def create_booking():
    payload = request.get_json(silent=True) or {}

    client_name = str(payload.get("name", "")).strip()
    phone = str(payload.get("phone", "")).strip()
    barber_id = payload.get("barber_id")
    service_id = payload.get("service_id")
    day = parse_date(payload.get("date"))
    clock = parse_time(payload.get("time"))

    if len(client_name) < 2 or len(client_name) > 120:
        return jsonify({"error": "invalid name"}), 400
    if len(phone) > 40 or len(re.sub(r"\D", "", phone)) < 7:
        return jsonify({"error": "invalid phone"}), 400
    if not isinstance(barber_id, int) or not isinstance(service_id, int) or not day or not clock:
        return jsonify({"error": "invalid booking data"}), 400
    if day < local_today():
        return jsonify({"error": "date is in the past"}), 400
    if day > local_today() + timedelta(days=MAX_BOOKING_DAYS):
        return jsonify({"error": "date is too far in the future"}), 400

    service = find_service(service_id)
    barber = find_barber(barber_id)
    if not service or not barber or not barber.get("active", True):
        return jsonify({"error": "invalid barber or service"}), 404

    requested_time = clock.strftime("%H:%M")
    slots = generate_slots(barber_id, day, int(service["duration_minutes"]))
    if slots is None:
        return jsonify({"error": "database temporarily unavailable"}), 503
    if requested_time not in slots:
        return jsonify({"error": "slot is not available"}), 409

    status, booking = store_call(
        {
            "op": "create_booking",
            "client_name": client_name,
            "phone": phone,
            "service_id": service_id,
            "barber_id": barber_id,
            "booking_date": day.isoformat(),
            "booking_time": requested_time,
        }
    )

    if status >= 300:
        return jsonify(booking), status

    return (
        jsonify(
            {
                "success": True,
                "booking": {
                    "id": booking["id"],
                    "name": booking["client_name"],
                    "phone": booking["phone"],
                    "service": service_public(service),
                    "barber": barber_public(barber),
                    "date": booking["booking_date"],
                    "time": str(booking["booking_time"])[:5],
                    "status": booking["status"],
                },
            }
        ),
        201,
    )


@app.get("/api/reviews")
def reviews():
    data, error = require_store({"op": "reviews"})
    if error:
        return error

    rows = []
    for item in data:
        rows.append(
            {
                "id": item["id"],
                "client_name": item["client_name"],
                "rating": item["rating"],
                "text": item["review_text"],
                "created_at": item["created_at"],
            }
        )
    return jsonify(rows)


@app.post("/api/reviews")
def create_review():
    payload = request.get_json(silent=True) or {}
    phone = str(payload.get("phone", "")).strip()
    text_value = str(payload.get("text", "")).strip()
    rating = payload.get("rating")

    if len(phone) > 40 or len(re.sub(r"\D", "", phone)) < 7:
        return jsonify({"error": "invalid phone"}), 400
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "invalid rating"}), 400
    if len(text_value) < 3 or len(text_value) > 1000:
        return jsonify({"error": "invalid review"}), 400

    status_code, data = store_call(
        {
            "op": "create_review",
            "phone": phone,
            "rating": rating,
            "review_text": text_value,
        }
    )

    if status_code >= 300:
        return jsonify(data), status_code

    review = data.get("review", {})
    return (
        jsonify(
            {
                "success": True,
                "review": {
                    "id": review.get("id"),
                    "client_name": review.get("client_name"),
                    "rating": review.get("rating"),
                    "text": review.get("review_text"),
                    "created_at": review.get("created_at"),
                },
            }
        ),
        201,
    )


@app.get("/api/admin/barbers")
def admin_barbers():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    data, error = require_store({"op": "barbers", "include_inactive": True})
    if error:
        return error
    return jsonify([barber_public(item) for item in data])


@app.post("/api/admin/barbers")
def admin_create_barber():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    name_uk = str(payload.get("name_uk", "")).strip()
    name_en = str(payload.get("name_en", "")).strip()
    specialization = str(payload.get("specialization", "")).strip()

    if not (2 <= len(name_uk) <= 80):
        return jsonify({"error": "invalid Ukrainian name"}), 400
    if not (2 <= len(name_en) <= 80):
        return jsonify({"error": "invalid English name"}), 400
    if not (2 <= len(specialization) <= 160):
        return jsonify({"error": "invalid specialization"}), 400

    existing = get_barbers(include_inactive=True)
    if existing is None:
        return jsonify({"error": "database temporarily unavailable"}), 503

    code = unique_barber_code(name_en, existing)
    status, result = store_call(
        {
            "op": "create_barber",
            "code": code,
            "name_uk": name_uk,
            "name_en": name_en,
            "specialization": specialization,
        }
    )
    if status >= 300:
        return jsonify(result), status

    return jsonify({"success": True, "barber": barber_public(result["barber"])}), 201


@app.get("/api/admin/calendar")
def admin_calendar():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    month = str(request.args.get("month", "")).strip()
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return jsonify({"error": "month must be YYYY-MM"}), 400

    try:
        datetime.strptime(month + "-01", "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "invalid month"}), 400

    payload = {"op": "calendar", "month": month}
    barber_id = request.args.get("barber_id", type=int)
    if request.args.get("barber_id"):
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        payload["barber_id"] = barber_id

    data, error = require_store(payload)
    if error:
        return error
    return jsonify(data)


@app.get("/api/admin/bookings")
def admin_bookings():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    payload = {"op": "admin_bookings"}

    if request.args.get("date"):
        day = parse_date(request.args.get("date"))
        if not day:
            return jsonify({"error": "invalid date"}), 400
        payload["date"] = day.isoformat()

    if request.args.get("barber_id"):
        barber_id = request.args.get("barber_id", type=int)
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        payload["barber_id"] = barber_id

    if request.args.get("time"):
        clock = parse_time(request.args.get("time"))
        if not clock:
            return jsonify({"error": "invalid time"}), 400
        payload["time"] = clock.strftime("%H:%M:%S")

    data, error = require_store(payload)
    if error:
        return error

    rows = []
    for booking in data:
        service = relation_object(booking.get("services"))
        barber = relation_object(booking.get("barbers"))
        rows.append(
            {
                "id": booking["id"],
                "name": booking["client_name"],
                "phone": booking["phone"],
                "service": service_public(service),
                "barber": barber_public(barber),
                "date": booking["booking_date"],
                "time": str(booking["booking_time"])[:5],
                "duration_minutes": booking["duration_minutes"],
                "status": booking["status"],
                "created_at": booking["created_at"],
            }
        )

    return jsonify(rows)


@app.patch("/api/admin/bookings/<int:booking_id>")
def admin_update_booking(booking_id):
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    status_value = payload.get("status")
    if status_value not in {"confirmed", "cancelled", "completed"}:
        return jsonify({"error": "invalid status"}), 400

    status, data = store_call(
        {"op": "update_booking_status", "id": booking_id, "status": status_value}
    )
    return jsonify(data), status


@app.get("/api/admin/blocked-slots")
def admin_blocked_slots():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    payload = {"op": "blocked_slots"}

    if request.args.get("date"):
        day = parse_date(request.args.get("date"))
        if not day:
            return jsonify({"error": "invalid date"}), 400
        payload["date"] = day.isoformat()

    if request.args.get("barber_id"):
        barber_id = request.args.get("barber_id", type=int)
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        payload["barber_id"] = barber_id

    data, error = require_store(payload)
    if error:
        return error

    rows = []
    for slot in data:
        barber = relation_object(slot.get("barbers"))
        rows.append(
            {
                "id": slot["id"],
                "barber_id": slot["barber_id"],
                "barber": barber_public(barber),
                "date": slot["blocked_date"],
                "time": str(slot["blocked_time"])[:5],
                "duration_minutes": slot["duration_minutes"],
                "reason": slot.get("reason"),
            }
        )

    return jsonify(rows)


@app.delete("/api/admin/blocked-slots/<int:slot_id>")
def admin_delete_blocked_slot(slot_id):
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    status, data = store_call({"op": "delete_blocked_slot", "id": slot_id})
    return jsonify(data), status


@app.post("/api/admin/blocked-slots")
def admin_block_slot():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    barber_id = payload.get("barber_id")
    day = parse_date(payload.get("date"))
    clock = parse_time(payload.get("time"))
    duration = payload.get("duration_minutes", 30)

    if not isinstance(barber_id, int) or not day or not clock:
        return jsonify({"error": "invalid block data"}), 400
    if day < local_today():
        return jsonify({"error": "date is in the past"}), 400
    if day == local_today() and clock <= local_now().time().replace(tzinfo=None):
        return jsonify({"error": "time is in the past"}), 400
    if not isinstance(duration, int) or duration < 15 or duration > 720:
        return jsonify({"error": "invalid duration"}), 400

    barber = find_barber(barber_id, include_inactive=True)
    if not barber:
        return jsonify({"error": "barber not found"}), 404

    status, data = store_call(
        {
            "op": "create_blocked_slot",
            "barber_id": barber_id,
            "blocked_date": day.isoformat(),
            "blocked_time": clock.strftime("%H:%M:%S"),
            "duration_minutes": duration,
            "reason": str(payload.get("reason", "")).strip() or None,
        }
    )
    return jsonify(data), status


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
