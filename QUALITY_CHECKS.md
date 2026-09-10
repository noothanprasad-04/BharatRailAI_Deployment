# RailBlock AI — Quality Verification

## Verified in the build environment

- Python backend compiles successfully with `python -m py_compile backend/main.py`.
- Frontend JSX parses and transpiles successfully with the installed TypeScript compiler.
- Backend `/api/health`, `/api/meta`, all four role logins, dashboard, analytics, submissions, approvals and plans were smoke-tested.
- Invalid role/account combinations return HTTP 403 instead of silently switching roles.
- Worker submission created a controller-review plan item in about 1.2 seconds in the verification run, below the 5-second requirement.
- A submission on SEC002 grouped P.Way + S&T + TRD into one coordinated block.
- The generated block exposed a protected window with a 10-minute buffer before and after execution.
- Timetable, explicit availability and existing protected blocks are checked before a slot is labelled safe.
- Repeated approval of an already-decided block returns HTTP 409 instead of duplicating the action.
- Approval changes mapped maintenance tasks to `Scheduled` and creates approval/notification records.
- Analytics totals are role-specific: Admin 210 > Worker 128 > Control Officer 86 > Department (P.Way 46 / S&T 34 / TRD 28).
- Runtime state is persisted atomically and can be reset without modifying the original CSV dataset.

## Important local verification

Run the backend first, then:

```powershell
cd backend
python smoke_test.py
```

For the frontend, install dependencies in an environment with npm registry access:

```powershell
cd frontend
npm install
npm run build
```

The build environment used to prepare this archive did not have npm registry access, so the final Vite bundle could not be downloaded/built there. The JSX source itself was independently parsed and transpiled successfully.
