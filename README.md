# RailBlock AI — SIH Mission Zero Disruption

A judge-ready full-stack prototype built around the supplied synthetic railway maintenance dataset.

## Architecture
- `frontend/`: React + Vite single-page application with role-aware UI, animations, dark rail command-center theme and responsive design.
- `backend/`: FastAPI service that loads the supplied CSV dataset and exposes authentication, dashboards, task submission, explainable priority scoring, timetable-aware block optimization, approvals, analytics and health endpoints.
- `backend/runtime/state.json`: generated automatically at runtime so worker submissions and controller approvals survive a backend restart. It is intentionally excluded from the shipped demo state.
- `frontend/src/assets/login-background.jpeg`: login visual supplied for the requested design.
- `frontend/src/assets/dashboard-banner.png`: authenticated dashboard banner supplied for the requested design.

## Demo logins
Password for every account: `12345678`
- Worker: `worker@gmail.com`
- Control Officer: `controlofficer@gmail.com`
- Department: `department@gmail.com` then choose P.Way / S&T / TRD
- Admin: `admin@gmail.com`

The backend validates that the selected role matches the demo account. A worker account cannot be used as an admin account.

## Run backend — Windows PowerShell
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

If PowerShell blocks activation, skip activation completely:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

## Run frontend
Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Reliability improvements
- Centralized frontend API client with timeout, JSON/error parsing and connection handling.
- React error boundaries around the whole application and individual pages so component failures never become a blank screen.
- Retry states for API-backed screens instead of indefinite spinners.
- Worker submission performs scoring and optimization in one request; the controller queue polls every 2 seconds.
- Duplicate submit/approve/optimize clicks are disabled while a request is running.
- Backend validates role, department, corridor and asset relationships.
- Optimizer never labels a conflicted slot as safe: train, explicit availability and existing protected blocks are checked.
- Mandatory ±10 minute safety protection is included in conflict checking.
- New work is scheduled from the current time forward, never into the past.
- Daily/weekly/monthly horizons are bounded so a one-day plan cannot promise an unrealistic number of corridor blocks.
- Approved plan items move their mapped tasks to `Scheduled` and create an approval/notification record.
- Runtime state is persisted atomically and a `reset-demo.bat` utility resets only runtime state without changing the original CSV datasets.
- Analytics are role-specific: Admin > Worker > Controller > Department, with separate department profiles.

## Smoke test
Start the backend and run:
```powershell
cd backend
python smoke_test.py
```

Expected:
```text
RailBlock AI smoke test: PASS
```

## SIH demonstration flow
1. Login as Worker.
2. Submit a maintenance request on a corridor shared by multiple departments.
3. Show the AI priority score and explainable breakdown.
4. Move to Control Officer → Approval Queue. The new item appears automatically without a refresh.
5. Show the single protected corridor block containing compatible P.Way + S&T + TRD tasks.
6. Show the ±10 minute safety protection and timetable conflict check.
7. Approve the block.
8. Login as Department and open Daily / Weekly / Monthly to show the scheduled work.
9. Open Cross-Department Coordination to explain why one block reduces disruption.
10. Use Admin pages to show source systems, health, optimization jobs, auditability and role-specific analytics.

### Prototype note
The AI layer is implemented as deterministic, explainable scoring + constraint-based scheduling so the SIH demo is reproducible without external AI/API keys. It can later be replaced by a trained model/LLM while keeping the API contract and UI.
