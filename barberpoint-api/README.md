# BarberPoint API

Flask + PostgreSQL backend for the BarberPoint portfolio project.

## Production

- Frontend: `https://323erir6.github.io/barberpoint/`
- API: `https://barberpoint-api-oneone.onrender.com`
- Admin UI: `https://323erir6.github.io/barberpoint/admin.html`

## Features

- PostgreSQL persistence
- Services and barbers loaded through REST API
- Dynamic free time slots
- Server-side booking validation
- PostgreSQL advisory lock to prevent double booking races
- Admin booking management
- Manual blocked slots
- Europe/Kyiv availability calculations
- CORS limited to the portfolio origin and local development

## API

Public:
- `GET /api/health`
- `GET /api/services`
- `GET /api/barbers`
- `GET /api/available-slots?barber_id=1&service_id=1&date=YYYY-MM-DD`
- `POST /api/bookings`

Admin, requires `X-Admin-Key`:
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id`
- `POST /api/admin/blocked-slots`

Secrets are stored only as Render environment variables and are not committed to GitHub.
