# BarberPoint API

Real Flask + PostgreSQL backend for the BarberPoint portfolio project.

## Features

- Services and barbers stored in PostgreSQL
- Dynamic available time slots
- Booking creation with server-side validation
- Conflict checking to prevent double booking
- Protected admin API
- Blocked time slots
- CORS configured for the GitHub Pages portfolio

## Endpoints

- `GET /api/health`
- `GET /api/services`
- `GET /api/barbers`
- `GET /api/available-slots?barber_id=1&service_id=1&date=YYYY-MM-DD`
- `POST /api/bookings`
- `GET /api/admin/bookings` with `X-Admin-Key`
- `PATCH /api/admin/bookings/:id` with `X-Admin-Key`
- `POST /api/admin/blocked-slots` with `X-Admin-Key`

## Environment variables

- `DATABASE_URL`
- `ADMIN_KEY`

## Render commands

Build:

```
pip install -r barberpoint-api/requirements.txt
```

Start:

```
gunicorn --chdir barberpoint-api app:app
```
