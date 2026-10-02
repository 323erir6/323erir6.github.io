# BarberPoint API

Production-style Flask backend for the BarberPoint portfolio project.

## Architecture

- Frontend: GitHub Pages
- Public API: Flask on Render
- Database: PostgreSQL on Supabase
- Private database bridge: Supabase Edge Function
- Admin authentication: server-side `ADMIN_KEY`
- Database tables are protected with Row Level Security and have no public policies

The browser never receives database credentials or the private Supabase store key.

## Features

- Services and barbers stored in PostgreSQL
- Dynamic available time slots
- 30-minute slot grid with working-hours validation
- Booking horizon limited to 90 days
- Server-side booking validation
- Atomic booking creation to prevent double booking
- Protected admin API
- Blocked time slots
- Barber creation from the admin panel
- Admin calendar and filtering
- CORS restricted to the GitHub Pages portfolio
- Request size limits, rate limiting and security headers

## Public endpoints

- `GET /api/health`
- `GET /api/services`
- `GET /api/barbers`
- `GET /api/available-slots?barber_id=1&service_id=1&date=YYYY-MM-DD`
- `POST /api/bookings`

## Admin endpoints

Require `X-Admin-Key`.

- `GET /api/admin/barbers`
- `POST /api/admin/barbers`
- `GET /api/admin/calendar?month=YYYY-MM`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id`
- `GET /api/admin/blocked-slots`
- `POST /api/admin/blocked-slots`
- `DELETE /api/admin/blocked-slots/:id`

## Render environment variables

- `ADMIN_KEY`
- `SUPABASE_STORE_URL`
- `SUPABASE_STORE_KEY`

Database credentials are not committed to GitHub.

## Render commands

Build:

```
pip install -r barberpoint-api/requirements.txt
```

Start:

```
gunicorn --chdir barberpoint-api app:app
```

## Automated checks

GitHub Actions runs production smoke tests, dependency audits and CodeQL checks after pushes to `main`.
