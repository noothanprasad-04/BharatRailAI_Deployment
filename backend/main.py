from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

BASE = Path(__file__).resolve().parent / "data"
RUNTIME = Path(__file__).resolve().parent / "runtime"
RUNTIME.mkdir(exist_ok=True)
STATE_FILE = RUNTIME / "state.json"
STATE_LOCK = Lock()


def load(name: str) -> pd.DataFrame:
    path = BASE / name
    if not path.exists():
        raise FileNotFoundError(f"Required dataset missing: {path}")
    return pd.read_csv(path)


users = load("app_user.csv")
roles = load("role.csv")
deps = load("department.csv")
corridors = load("corridor.csv")
assets = load("asset.csv")
tasks = load("maintenance_task.csv")
priorities = load("priority_score.csv")
timetable = load("timetable_slot.csv")
availability = load("corridor_availability.csv")
plans = load("block_plan.csv")
plan_items = load("block_plan_item.csv")
plan_item_tasks = load("block_plan_item_task.csv")
approvals = load("approval.csv")
notifications = load("notification.csv")

CREDENTIALS = {
    "worker@gmail.com": {"role": "worker", "name": "Field Worker", "department_id": "DPT001"},
    "controlofficer@gmail.com": {"role": "controller", "name": "Section Controller", "department_id": None},
    "department@gmail.com": {"role": "department", "name": "Department Supervisor", "department_id": "DPT001"},
    "admin@gmail.com": {"role": "admin", "name": "System Administrator", "department_id": None},
}
PASSWORD = "12345678"
ALLOWED_ROLES = {"worker", "controller", "department", "admin"}
DEPARTMENT_IDS = {str(x) for x in deps["department_id"].tolist()}
SEVERITIES = {"Critical", "High", "Medium", "Low"}
DECISIONS = {"Approved", "Rejected"}

app = FastAPI(title="RailBlock AI", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)
    role: str
    department_id: Optional[str] = None


class SubmissionRequest(BaseModel):
    worker_name: str = Field(default="Field Worker", min_length=1, max_length=100)
    department_id: str
    corridor_id: str
    asset_id: str
    severity: str
    description: str = Field(min_length=8, max_length=500)
    estimated_duration_minutes: int = Field(default=60, ge=15, le=480)

    @field_validator("severity")
    @classmethod
    def valid_severity(cls, value: str) -> str:
        value = value.title()
        if value not in SEVERITIES:
            raise ValueError("Severity must be Critical, High, Medium or Low")
        return value


class DecisionRequest(BaseModel):
    plan_item_id: str = Field(min_length=3)
    decision: str
    reason: str = Field(default="Reviewed for safety, traffic and cross-department feasibility.", max_length=500)

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, value: str) -> str:
        value = value.title()
        if value not in DECISIONS:
            raise ValueError("Decision must be Approved or Rejected")
        return value


SEVERITY_WEIGHT = {"Critical": 50, "High": 38, "Medium": 25, "Low": 12}


def now_local() -> datetime:
    return datetime.now().replace(second=0, microsecond=0)


def clean_record(record: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in record.items():
        if pd.isna(value):
            result[key] = None
        elif hasattr(value, "item"):
            result[key] = value.item()
        else:
            result[key] = value
    return result


def role_name(role_id: str) -> str:
    row = roles[roles.role_id == role_id]
    return str(row.iloc[0].role_name) if not row.empty else role_id


def dep_name(dep_id: str) -> str:
    row = deps[deps.department_id == dep_id]
    return str(row.iloc[0].department_name) if not row.empty else dep_id


def corridor_name(cid: str) -> str:
    row = corridors[corridors.corridor_id == cid]
    return str(row.iloc[0].section_name) if not row.empty else cid


def validate_references(department_id: str, corridor_id: str, asset_id: str) -> None:
    if department_id not in DEPARTMENT_IDS:
        raise HTTPException(400, "Unknown department")
    if corridors[corridors.corridor_id == corridor_id].empty:
        raise HTTPException(400, "Unknown corridor")
    asset = assets[assets.asset_id == asset_id]
    if asset.empty:
        raise HTTPException(400, "Unknown asset")
    asset_row = asset.iloc[0]
    if str(asset_row.department_id) != department_id:
        raise HTTPException(400, "Selected asset does not belong to the selected department")
    if str(asset_row.corridor_id) != corridor_id:
        raise HTTPException(400, "Selected asset is not located on the selected corridor")


def score_task(row: pd.Series) -> dict[str, Any]:
    sev = str(row.get("severity_class", "Medium"))
    criticality = float(SEVERITY_WEIGHT.get(sev, 20))
    due = pd.to_datetime(row.get("due_by_date"), errors="coerce")
    reported = pd.to_datetime(row.get("reported_date"), errors="coerce")
    now = pd.Timestamp.now().normalize()
    days_left = max(0, int((due - now).days)) if pd.notna(due) else 7
    overdue_component = 30 if days_left == 0 else max(0, 30 - days_left * 3)
    corridor = corridors[corridors.corridor_id == row.get("corridor_id")]
    traffic = float(corridor.iloc[0].avg_daily_trains) if not corridor.empty else 4
    freight = float(corridor.iloc[0].avg_daily_freight_trains) if not corridor.empty else 0
    traffic_component = min(20, traffic * 1.1 + freight * 0.8)
    age = max(0, int((now - reported).days)) if pd.notna(reported) else 0
    age_component = min(10, age * 1.2)
    score = min(100, round(criticality + overdue_component + traffic_component + age_component, 1))
    band = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 35 else "LOW"
    return {
        "score": score,
        "band": band,
        "breakdown": {
            "severity": round(criticality, 1),
            "deadline_pressure": round(overdue_component, 1),
            "traffic_impact": round(traffic_component, 1),
            "age": round(age_component, 1),
        },
        "reason": f"{sev} defect on {corridor_name(row['corridor_id'])}; severity, deadline pressure, traffic exposure and task age were included.",
    }


def task_records(department_id: Optional[str] = None):
    df = tasks.copy()
    if department_id:
        df = df[df.department_id == department_id]
    out = []
    for _, row in df.iterrows():
        p = priorities[priorities.task_id == row.task_id]
        score = float(p.iloc[0].score_value) if not p.empty else score_task(row)["score"]
        out.append(
            {
                **clean_record(row.to_dict()),
                "department_name": dep_name(str(row.department_id)),
                "corridor_name": corridor_name(str(row.corridor_id)),
                "priority_score": score,
                "priority_band": "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 35 else "LOW",
            }
        )
    return out


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def parse_clock(value: Any) -> tuple[int, int]:
    hour, minute = map(int, str(value).strip().split(":")[:2])
    return hour, minute


def train_conflict(cid: str, start: datetime, end: datetime) -> bool:
    """Check recurring timetable slots on the candidate date, including overnight slots."""
    slots = timetable[timetable.corridor_id.astype(str) == str(cid)]
    for _, row in slots.iterrows():
        day = str(row.get("day_of_week", "Daily")).strip().lower()
        day_ok = day in {"daily", "everyday", "all"} or day.startswith(start.strftime("%A").lower()[:3]) or day == start.strftime("%A").lower()
        if not day_ok:
            continue
        sh, sm = parse_clock(row.start_time)
        eh, em = parse_clock(row.end_time)
        slot_start = start.replace(hour=sh, minute=sm, second=0, microsecond=0)
        slot_end = start.replace(hour=eh, minute=em, second=0, microsecond=0)
        if slot_end <= slot_start:
            slot_end += timedelta(days=1)
        if overlaps(start, end, slot_start, slot_end):
            return True
    return False


def availability_conflict(cid: str, start: datetime, end: datetime) -> bool:
    """Return True when an explicitly unavailable/reserved source window overlaps the candidate."""
    rows = availability[availability.corridor_id.astype(str) == str(cid)]
    for _, row in rows.iterrows():
        source_start = pd.to_datetime(row.window_start, errors="coerce")
        source_end = pd.to_datetime(row.window_end, errors="coerce")
        if pd.isna(source_start) or pd.isna(source_end):
            continue
        if source_end.to_pydatetime() < start - timedelta(days=2) or source_start.to_pydatetime() > end + timedelta(days=2):
            continue
        is_available = str(row.get("is_available", "True")).strip().lower() in {"true", "1", "yes"}
        if not is_available and overlaps(start, end, source_start.to_pydatetime(), source_end.to_pydatetime()):
            return True
    return False


def existing_plan_conflict(cid: str, start: datetime, end: datetime) -> bool:
    rows = plan_items[plan_items.corridor_id.astype(str) == str(cid)]
    for _, row in rows.iterrows():
        if str(row.get("controller_decision", "")).lower() == "rejected":
            continue
        ps = pd.to_datetime(row.window_start, errors="coerce")
        pe = pd.to_datetime(row.window_end, errors="coerce")
        if pd.notna(ps) and pd.notna(pe):
            ps = ps.to_pydatetime() - timedelta(minutes=10)
            pe = pe.to_pydatetime() + timedelta(minutes=10)
            if overlaps(start, end, ps, pe):
                return True
    return False


def find_safe_slot(cid: str, earliest: datetime, duration: int, horizon_end: datetime) -> tuple[datetime, datetime, datetime, dict[str, Any]]:
    """Find a conflict-free execution slot with a mandatory ±10 minute protected safety window."""
    duration = max(15, min(int(duration), 480))
    candidate = earliest.replace(second=0, microsecond=0)
    if candidate.minute % 30:
        candidate += timedelta(minutes=30 - candidate.minute % 30)
    checked = 0
    max_checks = 7 * 24 * 2 + 4
    while candidate + timedelta(minutes=duration + 20) <= horizon_end and checked < max_checks:
        work_start = candidate + timedelta(minutes=10)
        work_end = work_start + timedelta(minutes=duration)
        protected_start = candidate
        protected_end = work_end + timedelta(minutes=10)
        train_hit = train_conflict(cid, protected_start, protected_end)
        availability_hit = availability_conflict(cid, protected_start, protected_end)
        existing_hit = existing_plan_conflict(cid, protected_start, protected_end)
        if not (train_hit or availability_hit or existing_hit):
            return work_start, work_end, protected_end, {
                "train_conflict": False,
                "availability_conflict": False,
                "existing_block_conflict": False,
                "safety_buffer_minutes": 10,
                "protected_start": protected_start.isoformat(timespec="minutes"),
                "protected_end": protected_end.isoformat(timespec="minutes"),
            }
        candidate += timedelta(minutes=30)
        checked += 1
    raise HTTPException(409, f"No safe maintenance window available on {corridor_name(cid)} within the requested planning horizon")


def next_id(prefix: str, frame: pd.DataFrame, column: str) -> str:
    existing = {str(x) for x in frame[column].dropna().tolist()} if column in frame else set()
    for _ in range(10000):
        candidate = f"{prefix}{uuid.uuid4().hex[:8].upper()}"
        if candidate not in existing:
            return candidate
    raise RuntimeError("Unable to allocate unique identifier")


def persist_state() -> None:
    state = {
        "tasks": tasks.to_dict("records"),
        "priorities": priorities.to_dict("records"),
        "plans": plans.to_dict("records"),
        "plan_items": plan_items.to_dict("records"),
        "plan_item_tasks": plan_item_tasks.to_dict("records"),
        "approvals": approvals.to_dict("records"),
        "notifications": notifications.to_dict("records"),
    }
    serializable = json.loads(json.dumps(state, default=str))
    fd, temp_path = tempfile.mkstemp(prefix="railblock_", suffix=".json", dir=RUNTIME)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(serializable, handle, indent=2)
        os.replace(temp_path, STATE_FILE)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def restore_state() -> None:
    global tasks, priorities, plans, plan_items, plan_item_tasks, approvals, notifications
    if not STATE_FILE.exists():
        return
    try:
        with STATE_FILE.open("r", encoding="utf-8") as handle:
            state = json.load(handle)
        for name in ["tasks", "priorities", "plans", "plan_items", "plan_item_tasks", "approvals", "notifications"]:
            if name in state:
                globals()[name] = pd.DataFrame(state[name])
    except (OSError, json.JSONDecodeError):
        # A corrupt demo state should never prevent the API from starting.
        try:
            STATE_FILE.unlink(missing_ok=True)
        except OSError:
            pass


restore_state()


def generate_plan(horizon: str = "Weekly", focus_task_id: Optional[str] = None) -> Optional[str]:
    global plans, plan_items, plan_item_tasks
    horizon = horizon.title()
    if horizon not in {"Daily", "Weekly", "Monthly"}:
        raise HTTPException(400, "Horizon must be Daily, Weekly or Monthly")
    open_df = tasks[tasks.status.astype(str).str.lower().isin({"open", "pending", "planned"})].copy()
    if focus_task_id:
        focused = open_df[open_df.task_id.astype(str) == str(focus_task_id)]
        if focused.empty:
            raise HTTPException(404, "Focused task is no longer open")
    if open_df.empty:
        return None

    enriched: list[tuple[float, pd.Series]] = []
    for _, row in open_df.iterrows():
        p = priorities[priorities.task_id.astype(str) == str(row.task_id)]
        score = float(p.iloc[0].score_value) if not p.empty else score_task(row)["score"]
        enriched.append((score, row))
    enriched.sort(key=lambda item: (0 if focus_task_id and str(item[1].task_id) == str(focus_task_id) else 1, -item[0]))

    horizon_days = {"Daily": 1, "Weekly": 7, "Monthly": 28}[horizon]
    start_day = now_local().replace(hour=0, minute=0)
    planning_start = now_local() + timedelta(minutes=30)
    horizon_end = planning_start + timedelta(days=horizon_days)
    plan_id = next_id("PLAN", plans, "plan_id")
    job_id = next_id("OPT", plans, "optimization_job_id")
    item_rows: list[dict[str, Any]] = []
    map_rows: list[dict[str, Any]] = []

    grouped: dict[str, list[tuple[float, pd.Series]]] = {}
    for item in enriched:
        grouped.setdefault(str(item[1].corridor_id), []).append(item)

    # A plan item represents one coordinated corridor block. Keep the number of
    # corridor blocks realistic for the requested horizon instead of promising
    # more work than one day can physically contain. A focused worker request
    # always gets its corridor included first.
    ranked_corridors = sorted(grouped, key=lambda cid: max(score for score, _ in grouped[cid]), reverse=True)
    max_blocks = {"Daily": 3, "Weekly": 7, "Monthly": len(ranked_corridors)}[horizon]
    if focus_task_id:
        focused_rows = open_df[open_df.task_id.astype(str) == str(focus_task_id)]
        if not focused_rows.empty:
            focused_corridor = str(focused_rows.iloc[0].corridor_id)
            ranked_corridors = [focused_corridor] + [cid for cid in ranked_corridors if cid != focused_corridor]
    selected_corridors = ranked_corridors[:max_blocks]

    cursor = planning_start
    cursor = cursor.replace(second=0, microsecond=0)
    if cursor.minute % 30:
        cursor += timedelta(minutes=30 - cursor.minute % 30)
    for cid in selected_corridors:
        group = grouped[cid]
        # Departments execute compatible tasks in parallel inside the shared block.
        duration = max(int(row.estimated_duration_minutes) for _, row in group)
        work_start, work_end, protected_end, flags = find_safe_slot(cid, cursor, duration, horizon_end)
        departments = sorted({str(row.department_id) for _, row in group})
        flags["multi_department"] = len(departments) > 1
        flags["departments"] = [dep_name(x) for x in departments]
        flags["tasks_grouped"] = len(group)
        item_id = next_id("PI", plan_items, "plan_item_id")
        item_rows.append(
            {
                "plan_item_id": item_id,
                "plan_id": plan_id,
                "corridor_id": cid,
                "window_start": work_start.isoformat(timespec="minutes"),
                "window_end": work_end.isoformat(timespec="minutes"),
                "conflict_flags": json.dumps(flags),
                "controller_decision": "Pending",
                "decision_by_user_id": None,
                "decision_at": None,
                "version": 1,
            }
        )
        for _, task in group:
            map_rows.append({"plan_item_id": item_id, "task_id": str(task.task_id)})
        cursor = max(cursor + timedelta(hours=1), protected_end + timedelta(minutes=20))

    plan_rows = pd.DataFrame(
        [
            {
                "plan_id": plan_id,
                "optimization_job_id": job_id,
                "horizon_type": horizon,
                "horizon_start": start_day.strftime("%Y-%m-%d"),
                "horizon_end": (horizon_end - timedelta(days=1)).strftime("%Y-%m-%d"),
                "generated_at": now_local().isoformat(timespec="seconds"),
                "status": "Pending Approval",
                "generated_by_model_version": "MODEL_OPT_v2",
            }
        ]
    )
    with STATE_LOCK:
        plans = pd.concat([plans, plan_rows], ignore_index=True)
        plan_items = pd.concat([plan_items, pd.DataFrame(item_rows)], ignore_index=True)
        plan_item_tasks = pd.concat([plan_item_tasks, pd.DataFrame(map_rows)], ignore_index=True)
        persist_state()
    return plan_id


@app.get("/api/health")
def health():
    return {"status": "ok", "model": "RailBlock AI demo", "version": app.version, "timestamp": now_local().isoformat()}


@app.get("/api/meta")
def meta():
    return {
        "departments": [clean_record(x) for x in deps.to_dict("records")],
        "corridors": [clean_record(x) for x in corridors.to_dict("records")],
        "assets": [clean_record(x) for x in assets.to_dict("records")],
        "credentials": [{"email": email, "role": cfg["role"]} for email, cfg in CREDENTIALS.items()],
    }


@app.post("/api/login")
def login(req: LoginRequest):
    key = req.email.strip().lower()
    requested_role = req.role.strip().lower()
    if requested_role not in ALLOWED_ROLES:
        raise HTTPException(400, "Invalid role")
    cfg = CREDENTIALS.get(key)
    if not cfg or req.password != PASSWORD:
        raise HTTPException(401, "Invalid demo credentials")
    if cfg["role"] != requested_role:
        raise HTTPException(403, f"This demo account belongs to the {cfg['role']} role")
    if requested_role == "department":
        if req.department_id not in DEPARTMENT_IDS:
            raise HTTPException(400, "Choose one of the three maintenance departments")
        dep_id = req.department_id
    else:
        dep_id = cfg["department_id"]
    return {
        "token": uuid.uuid4().hex,
        "user": {
            "email": key,
            "name": cfg["name"],
            "role": requested_role,
            "department_id": dep_id,
            "department_name": dep_name(dep_id) if dep_id else None,
        },
    }


@app.get("/api/dashboard/{role}")
def dashboard(role: str, department_id: Optional[str] = None):
    role = role.lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(400, "Invalid dashboard role")
    df = tasks.copy()
    if role == "department":
        if department_id not in DEPARTMENT_IDS:
            raise HTTPException(400, "Valid department_id is required")
        df = df[df.department_id == department_id]
    total = len(df)
    critical = sum(score_task(row)["score"] >= 80 for _, row in df.iterrows())
    overdue = sum(pd.to_datetime(row.due_by_date, errors="coerce") < pd.Timestamp.now().normalize() for _, row in df.iterrows())
    pending = int(df.status.astype(str).str.lower().isin({"open", "pending", "planned"}).sum())
    grouped = []
    for cid, group in df.groupby("corridor_id"):
        grouped.append(
            {
                "corridor_id": cid,
                "corridor": corridor_name(str(cid)),
                "tasks": len(group),
                "departments": len(group.department_id.unique()),
                "priority": round(max(score_task(row)["score"] for _, row in group.iterrows()), 1),
            }
        )
    return {
        "kpis": {
            "total_tasks": total,
            "critical": critical,
            "overdue": overdue,
            "pending": pending,
            "completion": round(100 * (1 - pending / max(1, total)), 1),
        },
        "tasks": task_records(department_id if role == "department" else None),
        "corridor_groups": sorted(grouped, key=lambda x: x["priority"], reverse=True),
        "department_backlog": [
            {"department_id": d.department_id, "department": d.department_name, "backlog": int((tasks.department_id == d.department_id).sum())}
            for _, d in deps.iterrows()
        ],
        "plans": [clean_record(x) for x in plans.tail(10).to_dict("records")],
        "plan_items": [clean_record(x) for x in plan_items.tail(30).to_dict("records")],
    }


@app.get("/api/tasks")
def get_tasks(department_id: Optional[str] = None):
    if department_id and department_id not in DEPARTMENT_IDS:
        raise HTTPException(400, "Unknown department")
    return task_records(department_id)


@app.post("/api/submissions")
def create_submission(req: SubmissionRequest):
    global tasks, priorities, notifications
    validate_references(req.department_id, req.corridor_id, req.asset_id)
    task_id = next_id("TASK", tasks, "task_id")
    submission_id = next_id("SUB", tasks, "submission_id")
    today = now_local().date()
    due = today + timedelta(days=3 if req.severity == "Critical" else 7)
    new = {
        "task_id": task_id,
        "submission_id": submission_id,
        "department_id": req.department_id,
        "source_system_id": "SRC001",
        "corridor_id": req.corridor_id,
        "asset_id": req.asset_id,
        "defect_code": "WEB-REQ",
        "severity_class": req.severity,
        "reported_date": str(today),
        "due_by_date": str(due),
        "estimated_duration_minutes": req.estimated_duration_minutes,
        "status": "Open",
        "description": req.description.strip(),
    }
    with STATE_LOCK:
        tasks = pd.concat([tasks, pd.DataFrame([new])], ignore_index=True)
        calc = score_task(pd.Series(new))
        priorities = pd.concat(
            [
                priorities,
                pd.DataFrame(
                    [
                        {
                            "priority_score_id": next_id("PSC", priorities, "priority_score_id"),
                            "task_id": task_id,
                            "score_value": calc["score"],
                            "score_breakdown": json.dumps(calc["breakdown"]),
                            "model_version_id": "MODEL_PRIORITY_v2",
                            "computed_at": now_local().isoformat(timespec="seconds"),
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )
        persist_state()

    # The request is not considered complete until a safe controller-review block exists.
    plan_id = generate_plan("Weekly", focus_task_id=task_id)
    candidates = plan_items[(plan_items.plan_id == plan_id) & (plan_items.corridor_id == req.corridor_id)] if plan_id else pd.DataFrame()
    plan_item = clean_record(candidates.iloc[0].to_dict()) if not candidates.empty else None
    with STATE_LOCK:
        notifications = pd.concat(
            [
                notifications,
                pd.DataFrame(
                    [
                        {
                            "notification_id": next_id("NOT", notifications, "notification_id"),
                            "recipient_role": "controller",
                            "recipient_user_id": "USR014",
                            "notification_type": "PLAN_REVIEW",
                            "title": "New AI-optimized maintenance block",
                            "message": f"{task_id} was scored at {calc['score']} and routed for human approval.",
                            "reference_id": plan_id,
                            "created_at": now_local().isoformat(timespec="seconds"),
                            "read_at": None,
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )
        persist_state()
    return {
        "task": {**new, "priority": calc},
        "optimization": {
            "completed": bool(plan_id and plan_item),
            "plan_id": plan_id,
            "plan_item": plan_item,
            "controller_queue": bool(plan_item),
        },
        "message": "Request scored and an optimized controller-review block was generated.",
    }


@app.post("/api/optimize")
def optimize(horizon: str = "Weekly"):
    plan_id = generate_plan(horizon)
    if not plan_id:
        raise HTTPException(400, "No open tasks available for optimization")
    item_view = plan_items[plan_items.plan_id == plan_id].copy()
    return {
        "plan_id": plan_id,
        "horizon": horizon.title(),
        "items": [clean_record(x) for x in item_view.to_dict("records")],
        "message": "Optimized plan generated with cross-department grouping, train conflict checks and ±10 minute safety buffers.",
    }


@app.get("/api/plans")
def get_plans(horizon: Optional[str] = None):
    p = plans.copy()
    if horizon:
        horizon = horizon.title()
        p = p[p.horizon_type.astype(str).str.title() == horizon]
    out = []
    for _, row in p.sort_values("generated_at", ascending=False).iterrows():
        items = plan_items[plan_items.plan_id.astype(str) == str(row.plan_id)]
        out.append(
            {
                **clean_record(row.to_dict()),
                "item_count": len(items),
                "approved": int((items.controller_decision.astype(str).str.lower() == "approved").sum()),
                "items": [clean_record(x) for x in items.to_dict("records")],
            }
        )
    return out


@app.get("/api/approvals")
def get_approvals():
    pending = plan_items[plan_items.controller_decision.astype(str).str.lower() == "pending"].copy()
    out = []
    for _, item in pending.sort_values("plan_id", ascending=False).iterrows():
        mapped = plan_item_tasks[plan_item_tasks.plan_item_id.astype(str) == str(item.plan_item_id)]
        ts = tasks[tasks.task_id.astype(str).isin(mapped.task_id.astype(str).tolist())]
        flags = {}
        try:
            flags = json.loads(item.conflict_flags) if item.conflict_flags else {}
        except (TypeError, json.JSONDecodeError):
            flags = {}
        out.append(
            {
                **clean_record(item.to_dict()),
                "corridor_name": corridor_name(str(item.corridor_id)),
                "departments": [dep_name(str(x)) for x in ts.department_id.unique()],
                "safety_start": flags.get("protected_start"),
                "safety_end": flags.get("protected_end"),
                "tasks": [
                    {
                        "task_id": r.task_id,
                        "description": r.description,
                        "severity": r.severity_class,
                        "department": dep_name(str(r.department_id)),
                        "score": score_task(r)["score"],
                    }
                    for _, r in ts.iterrows()
                ],
            }
        )
    return out


@app.post("/api/approvals")
def decide(req: DecisionRequest):
    global plan_items, plans, tasks, approvals, notifications
    matches = plan_items[plan_items.plan_item_id.astype(str) == str(req.plan_item_id)]
    if matches.empty:
        raise HTTPException(404, "Plan item not found")
    current = str(matches.iloc[0].controller_decision).title()
    if current != "Pending":
        raise HTTPException(409, f"This plan item has already been {current.lower()}")
    mask = plan_items.plan_item_id.astype(str) == str(req.plan_item_id)
    pid = str(matches.iloc[0].plan_id)
    mapped = plan_item_tasks[plan_item_tasks.plan_item_id.astype(str) == str(req.plan_item_id)]
    task_ids = mapped.task_id.astype(str).tolist()
    with STATE_LOCK:
        plan_items.loc[mask, "controller_decision"] = req.decision
        plan_items.loc[mask, "decision_by_user_id"] = "USR_CONTROLLER"
        plan_items.loc[mask, "decision_at"] = now_local().isoformat(timespec="seconds")
        plan_items.loc[mask, "version"] = pd.to_numeric(plan_items.loc[mask, "version"], errors="coerce").fillna(1).astype(int) + 1
        if req.decision == "Approved":
            plans.loc[plans.plan_id.astype(str) == pid, "status"] = "Approved & Dispatched"
            task_mask = tasks.task_id.astype(str).isin(task_ids)
            tasks.loc[task_mask, "status"] = "Scheduled"
        approval_row = {
            "approval_id": next_id("APR", approvals, "approval_id"),
            "plan_id": pid,
            "plan_version_id": 1,
            "plan_item_id": req.plan_item_id,
            "decision_by_user_id": "USR_CONTROLLER",
            "authority_level": 2,
            "decision": req.decision,
            "reason": req.reason,
            "decision_at": now_local().isoformat(timespec="seconds"),
        }
        approvals = pd.concat([approvals, pd.DataFrame([approval_row])], ignore_index=True)
        notifications = pd.concat(
            [
                notifications,
                pd.DataFrame(
                    [
                        {
                            "notification_id": next_id("NOT", notifications, "notification_id"),
                            "recipient_role": "department",
                            "recipient_user_id": None,
                            "notification_type": "DISPATCH" if req.decision == "Approved" else "REVIEW_UPDATE",
                            "title": "Maintenance block dispatched" if req.decision == "Approved" else "Maintenance block rejected",
                            "message": f"Plan {pid} / {req.plan_item_id}: {req.decision}.",
                            "reference_id": req.plan_item_id,
                            "created_at": now_local().isoformat(timespec="seconds"),
                            "read_at": None,
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )
        persist_state()
    return {
        "ok": True,
        "message": f"Plan item {req.plan_item_id} {req.decision.lower()}. Departments have been updated.",
        "plan_id": pid,
    }


@app.get("/api/notifications")
def get_notifications():
    return [clean_record(x) for x in notifications.tail(30).to_dict("records")]


@app.get("/api/analytics")
def analytics(role: str = "worker", department_id: Optional[str] = None):
    profiles = {
        "worker": ({"critical": 28, "high": 32, "medium": 34, "low": 34}, "Worker field workload", "Broad field queue containing incoming maintenance requests."),
        "controller": ({"critical": 14, "high": 22, "medium": 24, "low": 26}, "Controller network workload", "Approval-ready and high-impact work across the network."),
        "department": ({
            "DPT001": {"critical": 7, "high": 11, "medium": 12, "low": 16},
            "DPT002": {"critical": 5, "high": 9, "medium": 10, "low": 10},
            "DPT003": {"critical": 4, "high": 7, "medium": 8, "low": 9},
        }, "Department execution workload", "Department-scoped maintenance workload."),
        "admin": ({"critical": 44, "high": 53, "medium": 58, "low": 55}, "System-wide intelligence workload", "Enterprise view combining operations, planning and governance signals."),
    }
    role = role.lower()
    if role not in profiles:
        raise HTTPException(400, "Invalid analytics role")
    profile = profiles[role]
    if role == "department":
        if department_id not in DEPARTMENT_IDS:
            raise HTTPException(400, "Valid department_id is required")
        distribution = profile[0].get(department_id, profile[0]["DPT001"])
    else:
        distribution = profile[0]
    df = tasks.copy()
    if role == "department":
        df = df[df.department_id == department_id]
    department_rows = []
    for d in deps.department_id:
        dg = df[df.department_id == d]
        department_rows.append({
            "department": dep_name(str(d)),
            "tasks": int(len(dg)),
            "avg_score": round(sum(score_task(row)["score"] for _, row in dg.iterrows()) / max(1, len(dg)), 1),
        })
    return {
        "priority_distribution": distribution,
        "profile_label": profile[1],
        "profile_note": profile[2],
        "department": department_rows,
        "corridor": [
            {
                "corridor": corridor_name(str(c)),
                "tasks": int((df.corridor_id == c).sum()),
                "trains": float(corridors[corridors.corridor_id == c].avg_daily_trains.iloc[0]),
            }
            for c in corridors.corridor_id
        ],
        "source_task_count": len(df),
    }
