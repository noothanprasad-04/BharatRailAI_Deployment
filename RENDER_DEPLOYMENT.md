# RailBlock AI — Render Deployment Package

This package is prepared for Render with two services:

1. `railblock-ai-api` — FastAPI/Python backend
2. `railblock-ai-frontend` — Vite/React static frontend

## Recommended deployment

### Option A — Render Blueprint (easiest)

1. Push this entire folder to GitHub.
2. In Render, choose **New → Blueprint**.
3. Select the GitHub repository.
4. Render will read `render.yaml` and create the backend + frontend services.
5. Wait for both services to finish deploying.
6. Open the frontend service URL.

The frontend is configured to call:
`https://railblock-ai-api.onrender.com/api`

If Render assigns a different backend URL/name, change the frontend service environment variable:
`VITE_API_URL=https://YOUR-BACKEND-URL.onrender.com/api`
Then redeploy the frontend.

## Option B — Create services manually

### Backend Web Service

- Root Directory: `backend`
- Runtime: Python
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn -k uvicorn.workers.UvicornWorker main:app`

### Frontend Static Site

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment Variable:
  `VITE_API_URL=https://YOUR-BACKEND-URL.onrender.com/api`

## Important

The backend currently uses CSV files and a local JSON runtime state file for this demo.
That is suitable for a prototype/demo deployment, but local filesystem state should not
be treated as permanent production storage. For a production system, move mutable state
to a database such as PostgreSQL.

Demo login credentials are intentionally present in the project for the prototype.
Change/remove them before using the application with real users or sensitive data.

## Local test

Backend:
`cd backend`
`pip install -r requirements.txt`
`uvicorn main:app --reload`

Frontend:
`cd frontend`
`npm install`
`npm run dev`

For local frontend → backend communication, create `frontend/.env.local`:
`VITE_API_URL=http://localhost:8000/api`
