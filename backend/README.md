# RailBlock AI Backend

FastAPI service for the SIH prototype.

## Start

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Activation is optional. Using `.venv\Scripts\python.exe` avoids PowerShell execution-policy problems.

## API highlights

- `GET /api/health`
- `GET /api/meta`
- `POST /api/login`
- `GET /api/dashboard/{role}`
- `GET /api/tasks`
- `POST /api/submissions`
- `POST /api/optimize?horizon=Daily|Weekly|Monthly`
- `GET /api/plans`
- `GET /api/approvals`
- `POST /api/approvals`
- `GET /api/notifications`
- `GET /api/analytics`

## Planning guarantees

A generated block is only marked safe after checking the complete protected window:

`10 minutes before work → execution window → 10 minutes after work`

The scheduler checks recurring timetable slots, explicit unavailable corridor windows, and previously planned protected blocks. If no safe slot exists in the horizon, it returns a clear HTTP 409 instead of claiming that a conflicting slot is safe.

## Persistence

Dynamic submissions, plans and approvals are stored in `runtime/state.json` using an atomic replace. The original supplied CSV files are never modified by normal application actions.

To reset only demo runtime state on Windows, run:

```text
..\reset-demo.bat
```
