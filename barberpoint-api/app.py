import hmac
import os
import re
import time as time_module
from collections import defaultdict, deque
from datetime import date, datetime, time, timedelta
from threading import Lock
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint, text

app = Flask(__name__)

database_url = os.environ.get("DATABASE_URL", "sqlite:///barberpoint.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

allowed_origins = [
    "https://323erir6.github.io",
]
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

db = SQLAlchemy(app)
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


class Service(db.Model):
    __tablename__ = "services"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name_uk = db.Column(db.String(120), nullable=False)
    name_en = db.Column(db.String(120), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)


class Barber(db.Model):
    __tablename__ = "barbers"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name_uk = db.Column(db.String(80), nullable=False)
    name_en = db.Column(db.String(80), nullable=False)
    specialization = db.Column(db.String(160), nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    client_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    barber_id = db.Column(db.Integer, db.ForeignKey("barbers.id"), nullable=False)
    booking_date = db.Column(db.Date, nullable=False, index=True)
    booking_time = db.Column(db.Time, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default="confirmed")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    service = db.relationship("Service")
    barber = db.relationship("Barber")


class BlockedSlot(db.Model):
    __tablename__ = "blocked_slots"
    __table_args__ = (
        UniqueConstraint("barber_id", "blocked_date", "blocked_time", name="uq_blocked_slot"),
    )

    id = db.Column(db.Integer, primary_key=True)
    barber_id = db.Column(db.Integer, db.ForeignKey("barbers.id"), nullable=False)
    blocked_date = db.Column(db.Date, nullable=False, index=True)
    blocked_time = db.Column(db.Time, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False, default=30)
    reason = db.Column(db.String(200))

    barber = db.relationship("Barber")


SERVICES = [
    ("haircut", "Чоловіча стрижка", "Haircut", 650, 60),
    ("beard", "Борода", "Beard trim", 400, 30),
    ("combo", "Стрижка + борода", "Haircut + Beard", 950, 90),
    ("buzz", "Стрижка машинкою", "Buzz cut", 450, 45),
]

BARBERS = [
    ("andrii", "Андрій", "Andrii", "Fade / Texture / Classic"),
    ("max", "Максим", "Max", "Beard / Crop / Styling"),
    ("oleksii", "Олексій", "Oleksii", "Classic / Scissor / Long hair"),
]


def seed_data():
    if Service.query.count() == 0:
        for code, uk, en, price, duration in SERVICES:
            db.session.add(
                Service(
                    code=code,
                    name_uk=uk,
                    name_en=en,
                    price=price,
                    duration_minutes=duration,
                )
            )

    if Barber.query.count() == 0:
        for code, uk, en, specialization in BARBERS:
            db.session.add(
                Barber(
                    code=code,
                    name_uk=uk,
                    name_en=en,
                    specialization=specialization,
                )
            )

    db.session.commit()


def serialize_service(service):
    return {
        "id": service.id,
        "code": service.code,
        "name_uk": service.name_uk,
        "name_en": service.name_en,
        "price": service.price,
        "duration_minutes": service.duration_minutes,
    }


def serialize_barber(barber):
    return {
        "id": barber.id,
        "code": barber.code,
        "name_uk": barber.name_uk,
        "name_en": barber.name_en,
        "specialization": barber.specialization,
        "active": barber.active,
    }


def serialize_blocked_slot(slot):
    return {
        "id": slot.id,
        "barber_id": slot.barber_id,
        "barber": serialize_barber(slot.barber),
        "date": slot.blocked_date.isoformat(),
        "time": slot.blocked_time.strftime("%H:%M"),
        "duration_minutes": slot.duration_minutes,
        "reason": slot.reason,
    }


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def parse_time(value):
    try:
        return datetime.strptime(value, "%H:%M").time()
    except (TypeError, ValueError):
        return None


def combine(day, clock):
    return datetime.combine(day, clock)


def overlaps(start_a, duration_a, start_b, duration_b):
    end_a = start_a + timedelta(minutes=duration_a)
    end_b = start_b + timedelta(minutes=duration_b)
    return start_a < end_b and start_b < end_a


def is_slot_free(barber_id, day, clock, duration):
    candidate = combine(day, clock)

    bookings = Booking.query.filter(
        Booking.barber_id == barber_id,
        Booking.booking_date == day,
        Booking.status.in_(["confirmed", "pending"]),
    ).all()

    for booking in bookings:
        existing = combine(day, booking.booking_time)
        if overlaps(candidate, duration, existing, booking.duration_minutes):
            return False

    blocked = BlockedSlot.query.filter(
        BlockedSlot.barber_id == barber_id,
        BlockedSlot.blocked_date == day,
    ).all()

    for slot in blocked:
        existing = combine(day, slot.blocked_time)
        if overlaps(candidate, duration, existing, slot.duration_minutes):
            return False

    return True


def generate_slots(barber_id, day, duration):
    opening = datetime.combine(day, OPENING_TIME)
    closing = datetime.combine(day, CLOSING_TIME)
    cursor = opening
    result = []

    while cursor + timedelta(minutes=duration) <= closing:
        if day > local_today() or cursor.time() > local_now().time().replace(tzinfo=None):
            if is_slot_free(barber_id, day, cursor.time(), duration):
                result.append(cursor.strftime("%H:%M"))
        cursor += timedelta(minutes=BOOKING_INTERVAL_MINUTES)

    return result


def admin_authorized():
    configured = os.environ.get("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key")
    return bool(
        configured
        and supplied
        and hmac.compare_digest(str(supplied), str(configured))
    )


def unique_barber_code(seed):
    base = re.sub(r"[^a-z0-9]+", "-", (seed or "").lower()).strip("-")[:24] or "barber"
    code = base
    suffix = 2
    while Barber.query.filter_by(code=code).first():
        code = f"{base[:20]}-{suffix}"
        suffix += 1
    return code


@app.get("/")
def root():
    return jsonify(
        {
            "name": "BarberPoint API",
            "status": "ok",
            "docs": {
                "services": "/api/services",
                "barbers": "/api/barbers",
                "available_slots": "/api/available-slots?barber_id=1&service_id=1&date=2026-10-10",
            },
        }
    )


@app.get("/api/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify(
            {
                "ok": True,
                "database": "postgresql" if database_url.startswith("postgresql+") else "sqlite",
                "services": Service.query.count(),
                "barbers": Barber.query.filter_by(active=True).count(),
            }
        )
    except Exception:
        db.session.rollback()
        return jsonify({"ok": False, "database": "unavailable"}), 503


@app.get("/api/services")
def services():
    return jsonify([serialize_service(item) for item in Service.query.order_by(Service.id).all()])


@app.get("/api/barbers")
def barbers():
    return jsonify(
        [serialize_barber(item) for item in Barber.query.filter_by(active=True).order_by(Barber.id).all()]
    )


@app.get("/api/internal/migration-export")
def migration_export():
    configured = os.environ.get("MIGRATION_EXPORT_TOKEN")
    supplied = request.args.get("token", "")
    if not configured or not supplied or not hmac.compare_digest(str(supplied), str(configured)):
        return jsonify({"error": "not found"}), 404

    services = [serialize_service(item) for item in Service.query.order_by(Service.id).all()]
    barbers = [serialize_barber(item) for item in Barber.query.order_by(Barber.id).all()]
    bookings = []
    for booking in Booking.query.order_by(Booking.id).all():
        bookings.append({
            "id": booking.id,
            "client_name": booking.client_name,
            "phone": booking.phone,
            "service_id": booking.service_id,
            "barber_id": booking.barber_id,
            "booking_date": booking.booking_date.isoformat(),
            "booking_time": booking.booking_time.strftime("%H:%M:%S"),
            "duration_minutes": booking.duration_minutes,
            "status": booking.status,
            "created_at": booking.created_at.isoformat(),
        })
    blocked_slots = []
    for slot in BlockedSlot.query.order_by(BlockedSlot.id).all():
        blocked_slots.append({
            "id": slot.id,
            "barber_id": slot.barber_id,
            "blocked_date": slot.blocked_date.isoformat(),
            "blocked_time": slot.blocked_time.strftime("%H:%M:%S"),
            "duration_minutes": slot.duration_minutes,
            "reason": slot.reason,
        })

    return jsonify({
        "services": services,
        "barbers": barbers,
        "bookings": bookings,
        "blocked_slots": blocked_slots,
    })


@app.get("/api/admin/barbers")
def admin_barbers():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    return jsonify([serialize_barber(item) for item in Barber.query.order_by(Barber.id).all()])


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

    barber = Barber(
        code=unique_barber_code(name_en),
        name_uk=name_uk,
        name_en=name_en,
        specialization=specialization,
        active=True,
    )
    db.session.add(barber)
    db.session.commit()

    return jsonify({"success": True, "barber": serialize_barber(barber)}), 201


@app.get("/api/admin/calendar")
def admin_calendar():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    month = str(request.args.get("month", "")).strip()
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        return jsonify({"error": "month must be YYYY-MM"}), 400

    try:
        first = datetime.strptime(month + "-01", "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "invalid month"}), 400

    next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    query = Booking.query.filter(
        Booking.booking_date >= first,
        Booking.booking_date < next_month,
    )

    raw_barber = request.args.get("barber_id")
    if raw_barber:
        barber_id = request.args.get("barber_id", type=int)
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        query = query.filter(Booking.barber_id == barber_id)

    days = {}
    for booking in query.limit(500).all():
        key = booking.booking_date.isoformat()
        item = days.setdefault(
            key,
            {"date": key, "total": 0, "confirmed": 0, "completed": 0, "cancelled": 0},
        )
        item["total"] += 1
        if booking.status in item:
            item[booking.status] += 1

    return jsonify({"month": month, "days": [days[key] for key in sorted(days)]})


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

    barber = db.session.get(Barber, barber_id)
    service = db.session.get(Service, service_id)
    if not barber or not barber.active or not service:
        return jsonify({"error": "invalid barber or service"}), 404

    return jsonify(
        {
            "barber_id": barber_id,
            "service_id": service_id,
            "date": day.isoformat(),
            "slots": generate_slots(barber_id, day, service.duration_minutes),
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

    barber = db.session.get(Barber, barber_id)
    service = db.session.get(Service, service_id)
    if not barber or not barber.active or not service:
        return jsonify({"error": "invalid barber or service"}), 404

    if database_url.startswith("postgresql+"):
        lock_key = f"barberpoint:{barber_id}:{day.isoformat()}"
        db.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": lock_key},
        )

    requested_time = clock.strftime("%H:%M")
    if requested_time not in generate_slots(barber_id, day, service.duration_minutes):
        db.session.rollback()
        return jsonify({"error": "slot is not available"}), 409

    booking = Booking(
        client_name=client_name,
        phone=phone,
        service_id=service.id,
        barber_id=barber.id,
        booking_date=day,
        booking_time=clock,
        duration_minutes=service.duration_minutes,
        status="confirmed",
    )

    db.session.add(booking)
    db.session.commit()

    return (
        jsonify(
            {
                "success": True,
                "booking": {
                    "id": booking.id,
                    "name": booking.client_name,
                    "phone": booking.phone,
                    "service": serialize_service(service),
                    "barber": serialize_barber(barber),
                    "date": booking.booking_date.isoformat(),
                    "time": booking.booking_time.strftime("%H:%M"),
                    "status": booking.status,
                },
            }
        ),
        201,
    )


@app.get("/api/admin/bookings")
def admin_bookings():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    query = Booking.query
    has_date = False

    if request.args.get("date"):
        day = parse_date(request.args.get("date"))
        if not day:
            return jsonify({"error": "invalid date"}), 400
        query = query.filter(Booking.booking_date == day)
        has_date = True

    raw_barber = request.args.get("barber_id")
    if raw_barber:
        barber_id = request.args.get("barber_id", type=int)
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        query = query.filter(Booking.barber_id == barber_id)

    raw_time = request.args.get("time")
    if raw_time:
        clock = parse_time(raw_time)
        if not clock:
            return jsonify({"error": "invalid time"}), 400
        query = query.filter(Booking.booking_time == clock)

    if has_date:
        query = query.order_by(Booking.booking_time, Booking.created_at)
    else:
        query = query.order_by(Booking.created_at.desc())

    rows = []
    for booking in query.limit(500).all():
        rows.append(
            {
                "id": booking.id,
                "name": booking.client_name,
                "phone": booking.phone,
                "service": serialize_service(booking.service),
                "barber": serialize_barber(booking.barber),
                "date": booking.booking_date.isoformat(),
                "time": booking.booking_time.strftime("%H:%M"),
                "duration_minutes": booking.duration_minutes,
                "status": booking.status,
                "created_at": booking.created_at.isoformat() + "Z",
            }
        )

    return jsonify(rows)


@app.patch("/api/admin/bookings/<int:booking_id>")
def admin_update_booking(booking_id):
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    booking = db.session.get(Booking, booking_id)
    if not booking:
        return jsonify({"error": "booking not found"}), 404

    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    if status not in {"confirmed", "cancelled", "completed"}:
        return jsonify({"error": "invalid status"}), 400

    booking.status = status
    db.session.commit()
    return jsonify({"success": True, "id": booking.id, "status": booking.status})


@app.get("/api/admin/blocked-slots")
def admin_blocked_slots():
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    query = BlockedSlot.query.order_by(BlockedSlot.blocked_date, BlockedSlot.blocked_time)
    if request.args.get("date"):
        day = parse_date(request.args.get("date"))
        if not day:
            return jsonify({"error": "invalid date"}), 400
        query = query.filter(BlockedSlot.blocked_date == day)

    raw_barber = request.args.get("barber_id")
    if raw_barber:
        barber_id = request.args.get("barber_id", type=int)
        if not barber_id:
            return jsonify({"error": "invalid barber_id"}), 400
        query = query.filter(BlockedSlot.barber_id == barber_id)

    return jsonify([serialize_blocked_slot(slot) for slot in query.all()])


@app.delete("/api/admin/blocked-slots/<int:slot_id>")
def admin_delete_blocked_slot(slot_id):
    if not admin_authorized():
        return jsonify({"error": "unauthorized"}), 401

    slot = db.session.get(BlockedSlot, slot_id)
    if not slot:
        return jsonify({"error": "blocked slot not found"}), 404

    db.session.delete(slot)
    db.session.commit()
    return jsonify({"success": True, "id": slot_id})


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

    barber = db.session.get(Barber, barber_id)
    if not barber:
        return jsonify({"error": "barber not found"}), 404

    slot = BlockedSlot(
        barber_id=barber_id,
        blocked_date=day,
        blocked_time=clock,
        duration_minutes=duration,
        reason=str(payload.get("reason", "")).strip() or None,
    )

    db.session.add(slot)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "slot already blocked"}), 409

    return jsonify({"success": True, "id": slot.id}), 201


with app.app_context():
    db.create_all()
    seed_data()
    print(
        f"BarberPoint database ready: {Service.query.count()} services, "
        f"{Barber.query.filter_by(active=True).count()} active barbers"
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
