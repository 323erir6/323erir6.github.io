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
- 30-minute slot grid with working-hours validation
- Booking horizon limited to 90 days
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
- `GET /api/admin/blocked-slots`
- `POST /api/admin/blocked-slots`
- `DELETE /api/admin/blocked-slots/:id`

Secrets are stored only as Render environment variables and are not committed to GitHub.

## Deployment checks

GitHub Actions runs a production smoke test after pushes to `main`. It verifies:

- the API is reachable
- PostgreSQL is connected
- seeded services and barbers are available
- availability generation works
- invalid/out-of-hours bookings are rejected server-side
- admin endpoints reject unauthenticated access
- GitHub Pages receives the expected CORS header
