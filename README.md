# ChronoGrid

Calendar designed for people with ADHD. Built with React, FastAPI and PostgreSQL.

**Features:** weekly / monthly / yearly views, drag & drop events, Eisenhower matrix, Ctrl+Z undo history, activity templates, contacts with birthdays, .ics export and import.

Live demo: no registration required, data resets automatically.

---

## Tech stack

- **Frontend** — React 18, TypeScript, Tailwind CSS, Vite
- **Backend** — FastAPI, SQLAlchemy, Alembic, PostgreSQL 16
- **Auth** — JWT (rotating tokens, bcrypt passwords)
- **Infrastructure** — Docker Compose (dev + prod)

---

## Local development

### Requirements

- Docker
- Docker Compose v2

### Setup

```bash
git clone https://github.com/bie-nia/ChronoGrid.git
cd ChronoGrid

cp .env.example .env
```

Edit `.env` — at minimum change `SECRET_KEY` and `POSTGRES_PASSWORD`.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

On first start, the backend automatically runs migrations and creates:
- an admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`)
- a demo account (`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` from `.env`)

---

## Production deployment

```bash
cp .env.example .env
```

Fill in all values in `.env`. The following are required (no defaults):

| Variable | Description |
|---|---|
| `SECRET_KEY` | Random string, minimum 64 characters |
| `POSTGRES_PASSWORD` | Database password |
| `ADMIN_PASSWORD` | Admin account password |
| `ALLOWED_ORIGINS` | Frontend URL(s), comma-separated, e.g. `https://yourdomain.com` |
| `VITE_API_URL` | Public backend URL, e.g. `https://api.yourdomain.com` |

Generate a secure `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Then start:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The frontend is served by nginx on port 80. The backend is not exposed directly — only accessible internally by nginx.

---

## Environment variables

Full reference: `.env.example`

---

## License

MIT — Dominik Bienia
