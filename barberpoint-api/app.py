import os
import re
from datetime import date, datetime, time, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint

app = Flask(__name__)

database_url = os.environ.get("DATABASE_URL", "sqlite:///barberpoint.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JSON_SORT_KEYS"] = False

allowed_origins = [
    "https://323erir6.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

db = SQLAlchemy(app)


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
    opening = datetime.combine(day, time(10, 0))
    closing = datetime.combine(day, time(21, 0))
    cursor = opening
    result = []

    while cursor + timedelta(minutes=duration) <= closing:
        if day > date.today() or cursor.time() > datetime.now().time():
            if is_slot_free(barber_id, day, cursor.time(), duration):
                result.append(cursor.strftime("%H:%M"))
        cursor += timedelta(minutes=30)

    return result


def admin_authorized():
    configured = os.environ.get("ADMIN_KEY")
    supplied = request.headers.get("X-Admin-Key")
    return bool(configured and supplied and supplied == configured)


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
    return jsonify({"ok": True})


@app.get("/api/services")
def services():
    return jsonify([serialize_service(item) for item in Service.query.order_by(Service.id).all()])


@app.get("/api/barbers")
def barbers():
    return jsonify(
        [serialize_barber(item) for item in Barber.query.filter_by(active=True).order_by(Barber.id).all()]
    )


@app.get("/api/available-slots")
def available_slots():
    barber_id = request.args.get("barber_id", type=int)
    service_id = request.args.get("service_id", type=int)
    day = parse_date(request.args.get("date"))

    if not barber_id or not service_id or not day:
        return jsonify({"error": "barber_id, service_id and date are required"}), 400

    if day < date.today():
        return jsonify({"error": "date is in the past"}), 400

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

    if len(client_name) < 2:
        return jsonify({"error": "invalid name"}), 400
    if len(re.sub(r"\D", "", phone)) < 7:
        return jsonify({"error": "invalid phone"}), 400
    if not isinstance(barber_id, int) or not isinstance(service_id, int) or not day or not clock:
        return jsonify({"error": "invalid booking data"}), 400
    if day < date.today():
        return jsonify({"error": "date is in the past"}), 400

    barber = db.session.get(Barber, barber_id)
    service = db.session.get(Service, service_id)
    if not barber or not barber.active or not service:
        return jsonify({"error": "invalid barber or service"}), 404

    if not is_slot_free(barber_id, day, clock, service.duration_minutes):
        return jsonify({"error": "slot is no longer available"}), 409

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

    query = Booking.query.order_by(Booking.booking_date, Booking.booking_time)

    if request.args.get("date"):
        day = parse_date(request.args.get("date"))
        if not day:
            return jsonify({"error": "invalid date"}), 400
        query = query.filter(Booking.booking_date == day)

    rows = []
    for booking in query.all():
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
    if not isinstance(duration, int) or duration < 15 or duration > 480:
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
