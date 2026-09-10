import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, CalendarDays, Check, ChevronRight,
  Clock3, Database, Factory, Gauge, Home, Layers, LogOut, Menu, Network, RefreshCw,
  Send, Settings, ShieldCheck, Sparkles, TrainFront, TriangleAlert, Upload, Users,
  Workflow, X, Zap
} from 'lucide-react';
import './styles.css';
import loginBackground from './assets/login-background.jpeg';
import dashboardBanner from './assets/dashboard-banner.png';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const PASSWORD = '12345678';
const POLL_MS = 2000;

const roleMeta = {
  worker: { label: 'Worker', subtitle: 'Field Operations', accent: 'cyan' },
  controller: { label: 'Control Officer', subtitle: 'Network Command', accent: 'violet' },
  department: { label: 'Department', subtitle: 'Maintenance Planning', accent: 'green' },
  admin: { label: 'Admin', subtitle: 'System Intelligence', accent: 'amber' },
};

class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch(path, options = {}, timeout = 4500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      throw new ApiError(data?.detail || `Request failed (${response.status})`, response.status);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError('The server took too long to respond. Please retry.');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Backend is unavailable. Start the RailBlock backend and retry.');
  } finally {
    window.clearTimeout(timer);
  }
}

function useAsyncData(loader, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const reload = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const data = await loader();
      setState({ loading: false, data, error: '' });
      return data;
    } catch (error) {
      setState({ loading: false, data: null, error: error.message || 'Unable to load data.' });
      return null;
    }
  }, deps);
  useEffect(() => { let mounted = true; loader().then(data => mounted && setState({ loading: false, data, error: '' })).catch(error => mounted && setState({ loading: false, data: null, error: error.message || 'Unable to load data.' })); return () => { mounted = false; }; }, deps);
  return { ...state, reload };
}

function App() {
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('railblock_session') || 'null');
      return saved?.user && roleMeta[saved.user.role] ? saved : null;
    } catch { return null; }
  });
  const login = value => { localStorage.setItem('railblock_session', JSON.stringify(value)); setSession(value); };
  const logout = () => { localStorage.removeItem('railblock_session'); setSession(null); };
  return (
    <ErrorBoundary>
      {!session ? <Login onLogin={login} /> : <Shell session={session} logout={logout} />}
    </ErrorBoundary>
  );
}

function Login({ onLogin }) {
  const defaults = { worker: 'worker@gmail.com', controller: 'controlofficer@gmail.com', department: 'department@gmail.com', admin: 'admin@gmail.com' };
  const [role, setRole] = useState('worker');
  const [email, setEmail] = useState(defaults.worker);
  const [dept, setDept] = useState('DPT001');
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEmail(defaults[role]);
    setError('');
  }, [role]);

  useEffect(() => {
    let mounted = true;
    apiFetch('/meta').then(data => mounted && setDepartments(data.departments || [])).catch(() => mounted && setDepartments([]));
    return () => { mounted = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try {
      const data = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD, role, department_id: role === 'department' ? dept : null }),
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="login-page">
      <div className="login-image" style={{ backgroundImage: `linear-gradient(90deg,rgba(2,12,28,.96),rgba(2,12,28,.60),rgba(2,12,28,.18)),url(${loginBackground})` }} />
      <div className="login-grid" />
      <div className="login-brand"><div className="logo-mark"><TrainFront size={28} /></div><span>RailBlock <b>AI</b></span></div>
      <div className="login-copy">
        <div className="eyebrow">THEME 5 · MISSION ZERO DISRUPTION</div>
        <h1>Predict. Prevent.<br /><span>Keep India Moving.</span></h1>
        <p>AI-powered maintenance planning that connects field requests, priority intelligence, train traffic and cross-department block optimization.</p>
        <div className="login-stats"><span><strong>99%+</strong> planned reliability</span><span><strong>±10 min</strong> safety buffer</span><span><strong>3</strong> departments</span></div>
      </div>
      <form className="login-card glass" onSubmit={submit}>
        <div className="card-kicker"><Sparkles size={16} /> Secure Demo Access</div>
        <h2>Enter Command Center</h2><p className="muted">Choose your operational role to continue.</p>
        <div className="role-grid">
          {Object.entries(roleMeta).map(([key, meta]) => (
            <button type="button" key={key} className={`role-btn ${role === key ? `selected ${meta.accent}` : ''}`} onClick={() => setRole(key)}>
              <div>{key === 'worker' ? <Users size={19} /> : key === 'controller' ? <Network size={19} /> : key === 'department' ? <Factory size={19} /> : <Settings size={19} />}</div>
              <span>{meta.label}</span><small>{meta.subtitle}</small>
            </button>
          ))}
        </div>
        {role === 'department' && <label>Department<select value={dept} onChange={e => setDept(e.target.value)}>{departments.map(d => <option key={d.department_id} value={d.department_id}>{d.short_code} · {d.department_name}</option>)}</select></label>}
        <label>Demo Gmail<input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={PASSWORD} readOnly autoComplete="current-password" /></label>
        {error && <div className="error"><TriangleAlert size={16} />{error}</div>}
        <button className="primary full" disabled={loading}>{loading ? 'Authenticating…' : 'Enter RailBlock AI'} <ArrowRight size={18} /></button>
        <div className="demo-note">Demo password: <b>12345678</b> · no real credentials required</div>
      </form>
    </div>
  );
}

function Shell({ session, logout }) {
  const meta = roleMeta[session.user.role];
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState('overview');
  const [globalError, setGlobalError] = useState('');
  const nav = useMemo(() => {
    if (session.user.role === 'worker') return [['overview','Overview',Home],['tasks','My Tasks',Layers],['submit','Submit Request',Upload],['submissions','My Submissions',Send],['analytics','Analytics',BarChart3]];
    if (session.user.role === 'controller') return [['overview','Command Center',Home],['approval','Approval Queue',ShieldCheck],['plans','Block Plans',CalendarDays],['conflicts','Conflict Alerts',TriangleAlert],['analytics','Network Analytics',BarChart3]];
    if (session.user.role === 'department') return [['overview','Department Overview',Home],['backlog','Department Backlog',Layers],['plans','Daily / Weekly / Monthly',CalendarDays],['cross','Cross-Department Blocks',Network],['analytics','Department KPIs',Gauge]];
    return [['overview','System Overview',Home],['users','Users & Roles',Users],['data','Data Sources',Database],['health','Integration Health',Activity],['jobs','Optimization Jobs',Zap],['logs','Audit & System Logs',Workflow],['analytics','System Analytics',BarChart3],['settings','Configuration',Settings]];
  }, [session.user.role]);
  useEffect(() => { if (!nav.some(item => item[0] === page)) setPage('overview'); }, [nav, page]);

  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} theme-${meta.accent}`}>
      <aside className="sidebar">
        <div className="brand"><div className="logo-mark"><TrainFront size={22} /></div>{!collapsed && <div>RailBlock <b>AI</b><small>Mission Zero Disruption</small></div>}</div>
        <button className="collapse" onClick={() => setCollapsed(v => !v)} aria-label="Toggle sidebar"><Menu size={19} /></button>
        <div className="side-role"><span className="pulse-dot" />{!collapsed && <><b>{meta.label}</b><small>{session.user.department_name || meta.subtitle}</small></>}</div>
        <nav>{nav.map(([id,label,Icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => { setGlobalError(''); setPage(id); }} title={label}><Icon size={19} />{!collapsed && <span>{label}</span>}{page === id && !collapsed && <ChevronRight size={15} className="nav-arrow" />}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => window.alert('RailBlock AI v2.0 · Demo mode')}><ShieldCheck size={18} />{!collapsed && 'Safety status'}</button><button onClick={logout}><LogOut size={18} />{!collapsed && 'Sign out'}</button></div>
      </aside>
      <main className="main">
        <header className="topbar"><div><span className="breadcrumb">RAILBLOCK AI / {meta.label.toUpperCase()}</span><h1>{pageTitle(page, meta.label)}</h1></div><div className="top-actions"><span className="live"><i /> LIVE NETWORK</span><button className="icon-btn" onClick={() => window.location.reload()} aria-label="Refresh application"><RefreshCw size={18} /></button><div className="avatar">{initials(session.user.name)}</div></div></header>
        <div className="content"><ErrorBoundary key={page}>{globalError ? <RetryPanel message={globalError} onRetry={() => setGlobalError('')} /> : <Page page={page} session={session} onFatal={setGlobalError} />}</ErrorBoundary></div>
      </main>
    </div>
  );
}

function initials(name = '') { return name.split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase() || 'RB'; }
function pageTitle(page, role) { return ({ overview: role === 'Control Officer' ? 'Network Command Center' : role === 'Admin' ? 'System Intelligence' : 'Operational Dashboard', tasks:'My Tasks', submit:'Submit Maintenance Request', submissions:'My Submissions', analytics:'Analytics & KPIs', approval:'Human Approval Queue', plans:'Optimized Block Plans', conflicts:'Conflict & Risk Alerts', backlog:'Department Backlog', cross:'Cross-Department Coordination', users:'Users & Roles', data:'Data Sources', health:'Integration Health', jobs:'Optimization Jobs', logs:'Audit & System Logs', settings:'System Configuration' })[page] || 'Dashboard'; }

function Page({ page, session, onFatal }) {
  switch (page) {
    case 'submit': return <Submit session={session} />;
    case 'approval': return <Approval />;
    case 'plans': return <Plans role={session.user.role} department={session.user.department_id} />;
    case 'analytics': return <Analytics session={session} />;
    case 'tasks': return <TaskList department={session.user.department_id} />;
    case 'submissions': return <Submissions />;
    case 'backlog': return <Backlog />;
    case 'cross': return <CrossDepartment />;
    case 'conflicts': return <Conflicts />;
    case 'users': return <UsersPage />;
    case 'data': return <DataSources />;
    case 'health': return <Health />;
    case 'jobs': return <Jobs />;
    case 'logs': return <Logs />;
    case 'settings': return <SettingsPage />;
    default: return <Overview session={session} />;
  }
}

function Overview({ session }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const data = useAsyncData(() => apiFetch(`/dashboard/${session.user.role}?department_id=${encodeURIComponent(session.user.department_id || '')}`), [session.user.role, session.user.department_id]);
  async function generate() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await apiFetch('/optimize?horizon=Weekly', { method: 'POST' }); setMessage('AI plan generated successfully. Open Block Plans or Approval Queue to review it.'); await data.reload(); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  if (data.loading && !data.data) return <Loader />;
  if (data.error && !data.data) return <RetryPanel message={data.error} onRetry={data.reload} />;
  const d = data.data || { kpis: {}, tasks: [], corridor_groups: [] }; const k = d.kpis;
  return <>
    <section className="hero-panel" style={{ backgroundImage: `linear-gradient(90deg,rgba(4,17,38,.97) 0%,rgba(4,17,38,.88) 45%,rgba(4,17,38,.22) 100%),url(${dashboardBanner})` }}><div><div className="eyebrow">AI OPERATIONS LAYER</div><h2>{session.user.role === 'worker' ? 'From defect report to safe work' : session.user.role === 'controller' ? 'One command view. Every block.' : 'Predictive maintenance, connected.'}</h2><p>{session.user.role === 'worker' ? 'Submit a field issue and RailBlock AI will score urgency, assess traffic impact and push an optimized block upstream.' : session.user.role === 'controller' ? 'Review AI recommendations, resolve conflicts and give the human approval that dispatches work to departments.' : 'Coordinate people, assets, corridors and train windows through one intelligent planning layer.'}</p></div><div className="hero-chip"><div className="check-circle"><Check size={18} /></div><span><b>AI status: healthy</b><small>Optimization engine ready</small></span></div></section>
    {message && <div className={`inline-message ${message.includes('successfully') ? 'success' : 'warning'}`}>{message}</div>}
    <div className="kpi-grid"><Kpi label="Open / Active Tasks" value={k.pending ?? 0} icon={Layers} trend="Live dataset" /><Kpi label="Critical Priority" value={k.critical ?? 0} icon={AlertTriangle} trend="Needs attention" danger /><Kpi label="Overdue" value={k.overdue ?? 0} icon={Clock3} trend="Deadline pressure" /><Kpi label="Completion" value={`${k.completion ?? 0}%`} icon={Gauge} trend="Across visible tasks" /></div>
    <div className="section-head"><div><span className="eyebrow">INTELLIGENCE</span><h3>What needs attention now</h3></div>{(session.user.role === 'controller' || session.user.role === 'department') && <button className="primary" disabled={busy} onClick={generate}>{busy ? 'Optimizing…' : 'Generate AI Plan'} <Sparkles size={16} /></button>}</div>
    <div className="two-col"><PriorityBoard tasks={d.tasks} /><CorridorBoard groups={d.corridor_groups} /></div>
    <div className="section-head compact"><div><span className="eyebrow">WORKFLOW</span><h3>How RailBlock moves a request</h3></div></div><WorkflowSteps />
  </>;
}

function Kpi({ label, value, icon: Icon, trend, danger }) { return <div className={`kpi-card ${danger ? 'danger' : ''}`}><div className="kpi-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div></div>; }
function PriorityBoard({ tasks = [] }) { return <div className="panel"><div className="panel-title"><div><b>Priority radar</b><span>AI-ranked maintenance workload</span></div><span className="status-pill">MODEL v2</span></div><div className="priority-list">{tasks.slice(0, 6).map(t => <div className="priority-row" key={t.task_id}><div className={`score ${scoreClass(t.priority_score)}`}>{Math.round(t.priority_score)}</div><div className="task-main"><b>{t.description}</b><span>{t.task_id} · {t.corridor_name} · {t.department_name}</span></div><span className={`badge ${String(t.priority_band).toLowerCase()}`}>{t.priority_band}</span></div>)}</div>{tasks.length === 0 && <Empty title="No tasks in this view" text="Submit a maintenance request to populate the operational queue." />}</div>; }
function CorridorBoard({ groups = [] }) { return <div className="panel"><div className="panel-title"><div><b>Corridor pressure</b><span>Traffic-aware workload concentration</span></div><Network size={19} /></div>{groups.slice(0, 6).map(g => <div className="bar-row" key={g.corridor_id}><div><b>{g.corridor}</b><span>{g.tasks} tasks · {g.departments} dept.</span></div><div className="bar"><i style={{ width: `${Math.min(100, Number(g.priority) || 0)}%` }} /></div><strong>{Math.round(g.priority)}</strong></div>)}{groups.length === 0 && <Empty title="No corridor pressure" text="Current data contains no grouped maintenance work." />}</div>; }
function scoreClass(score) { const n = Number(score) || 0; return n >= 80 ? 'red' : n >= 60 ? 'amber' : n >= 35 ? 'blue' : 'green'; }
function WorkflowSteps() { const steps = [['01','Data ingestion','Requests + assets + timetable'],['02','Priority scoring','Severity + deadline + traffic'],['03','Optimization','Best block + resources'],['04','Human approval','Controller reviews'],['05','Dispatch','Departments execute safely']]; return <div className="workflow">{steps.map(([n,a,b],i)=><React.Fragment key={n}><div className="wf-step"><span>{n}</span><b>{a}</b><small>{b}</small></div>{i < steps.length - 1 && <ArrowRight className="wf-arrow" size={17} />}</React.Fragment>)}</div>; }
function Loader() { return <div className="loader"><div className="spinner" /><span>Loading RailBlock intelligence…</span></div>; }

function TaskList({ department }) { const data = useAsyncData(() => apiFetch(`/tasks?department_id=${encodeURIComponent(department || '')}`), [department]); if (data.loading && !data.data) return <Loader />; if (data.error && !data.data) return <RetryPanel message={data.error} onRetry={data.reload} />; const rows = data.data || []; return <TablePanel title="Maintenance tasks" subtitle="Every defect is traceable from source submission to planned block." columns={['Task','Description','Department','Corridor','Priority','Status']} rows={rows.map(t => [<b key="id">{t.task_id}</b>,t.description,t.department_name,t.corridor_name,<span key="p" className={`badge ${String(t.priority_band).toLowerCase()}`}>{Math.round(t.priority_score)} · {t.priority_band}</span>,<span key="s" className="status-text">{t.status}</span>])} onRefresh={data.reload} />; }
function TablePanel({ title, subtitle, columns, rows, onRefresh }) { return <div className="panel table-panel"><div className="panel-title"><div><b>{title}</b><span>{subtitle}</span></div>{onRefresh && <button className="icon-btn" onClick={onRefresh} aria-label="Refresh"><RefreshCw size={16} /></button>}</div><div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,i) => <tr key={i}>{row.map((x,j) => <td key={j}>{x}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="empty-table">No records found.</div></td></tr>}</tbody></table></div></div>; }

function Submit({ session }) {
  const meta = useAsyncData(() => apiFetch('/meta'), []);
  const [form, setForm] = useState({ department_id: session.user.department_id || 'DPT001', corridor_id: '', asset_id: '', severity: 'High', description: '', estimated_duration_minutes: 90 });
  const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
  const departments = meta.data?.departments || []; const corridors = meta.data?.corridors || []; const assets = meta.data?.assets || [];
  useEffect(() => { if (!corridors.length) return; setForm(f => ({ ...f, corridor_id: corridors.some(c => c.corridor_id === f.corridor_id) ? f.corridor_id : corridors[0].corridor_id })); }, [corridors.length]);
  const deptAssets = assets.filter(a => a.department_id === form.department_id && (!form.corridor_id || a.corridor_id === form.corridor_id));
  useEffect(() => { if (!deptAssets.length) return; setForm(f => ({ ...f, asset_id: deptAssets.some(a => a.asset_id === f.asset_id) ? f.asset_id : deptAssets[0].asset_id })); }, [form.department_id, form.corridor_id, assets.length]);
  if (meta.loading && !meta.data) return <Loader />; if (meta.error && !meta.data) return <RetryPanel message={meta.error} onRetry={meta.reload} />;
  async function submit() {
    if (busy) return;
    if (form.description.trim().length < 8) { setResult({ error: 'Please provide a useful problem description (at least 8 characters).' }); return; }
    if (!form.asset_id || !form.corridor_id) { setResult({ error: 'Select a valid corridor and asset before submitting.' }); return; }
    setBusy(true); setResult(null);
    try { setResult(await apiFetch('/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, worker_name: session.user.name }) }, 4500)); }
    catch (e) { setResult({ error: e.message }); }
    finally { setBusy(false); }
  }
  return <div className="form-layout"><div className="panel form-panel"><div className="panel-title"><div><b>New maintenance request</b><span>Field issue → AI scoring → optimized block → controller approval</span></div><div className="ai-tag"><Sparkles size={14} /> AI ANALYSIS ON</div></div><div className="form-grid"><label>Department<select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>{departments.map(d => <option key={d.department_id} value={d.department_id}>{d.short_code} · {d.department_name}</option>)}</select></label><label>Corridor<select value={form.corridor_id} onChange={e => setForm(f => ({ ...f, corridor_id: e.target.value }))}>{corridors.map(c => <option key={c.corridor_id} value={c.corridor_id}>{c.section_name} · {c.corridor_id}</option>)}</select></label><label>Asset<select value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))}>{deptAssets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.asset_id} · {a.asset_type}</option>)}</select></label><label>Severity<select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label>Estimated work duration (minutes)<input type="number" min="15" max="480" step="15" value={form.estimated_duration_minutes} onChange={e => setForm(f => ({ ...f, estimated_duration_minutes: Number(e.target.value) }))} /></label><label className="full-span">Problem description<textarea placeholder="Describe the defect, symptom, location and any immediate safety concern…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></label></div><button className="primary" disabled={busy} onClick={submit}>{busy ? 'Analysing & Optimizing…' : 'Analyse & Submit'} <Sparkles size={17} /></button></div>{result?.error ? <div className="panel ai-result error-result"><div className="result-head"><div className="alert-icon"><TriangleAlert /></div><div><span className="eyebrow">SUBMISSION ERROR</span><h3>{result.error}</h3></div></div><p>Nothing was silently discarded. Correct the input or verify that the backend is running, then retry.</p></div> : result ? <div className="panel ai-result"><div className="result-head"><div className="check-circle"><Check /></div><div><span className="eyebrow">AI DECISION</span><h3>Request accepted into planning</h3></div></div><div className={`big-score ${scoreClass(result.task.priority.score)}`}>{Math.round(result.task.priority.score)}<small>priority</small></div><div className="score-breakdown">{Object.entries(result.task.priority.breakdown).map(([k,v]) => <div key={k}><span>{k.replaceAll('_',' ')}</span><b>{v}</b></div>)}</div><p>{result.task.priority.reason}</p><div className="pipeline"><span className="done">Submitted</span><ArrowRight /><span className="done">Scored</span><ArrowRight /><span className="done">Optimized</span><ArrowRight /><span>Controller approval</span></div><div className="inline-message success">{result.optimization?.controller_queue ? 'Decision-ready block created and routed to the controller queue.' : 'Request accepted; open the controller queue to review the latest plan.'}</div></div> : <div className="panel explainer"><Sparkles size={22} /><h3>Why this matters</h3><p>RailBlock AI converts a field defect into an explainable planning decision using severity, due date, traffic, timetable constraints, corridor compatibility and a mandatory ±10 minute safety buffer.</p></div>}</div>;
}

function Approval() { const data = useAsyncData(() => apiFetch('/approvals'), []); useEffect(() => { const id = window.setInterval(data.reload, POLL_MS); return () => window.clearInterval(id); }, [data.reload]); if (data.loading && !data.data) return <Loader />; if (data.error && !data.data) return <RetryPanel message={data.error} onRetry={data.reload} />; const rows = data.data || []; return <div className="approval-grid">{rows.length === 0 ? <Empty title="No pending approvals" text="New worker requests and generated plans appear here automatically." /> : rows.map(item => <ApprovalCard key={item.plan_item_id} item={item} refresh={data.reload} />)}</div>; }
function ApprovalCard({ item, refresh }) { const [busy,setBusy] = useState(false); async function decide(decision) { if (busy) return; setBusy(true); try { await apiFetch('/approvals', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ plan_item_id:item.plan_item_id, decision, reason:'Reviewed for timetable conflict, safety buffer and cross-department feasibility.' }) }); await refresh(); } catch(e) { window.alert(`Approval update failed: ${e.message}`); } finally { setBusy(false); } } return <div className="panel approval-card"><div className="approval-top"><span className="badge amber">HUMAN REVIEW</span><span>{item.plan_item_id}</span></div><h3>{item.corridor_name}</h3><div className="window"><CalendarDays size={17}/><b>{fmt(item.window_start)} — {fmt(item.window_end)}</b><span>±10 min safety buffer</span></div><div className="dept-chips">{item.departments.map(d => <span key={d}><Factory size={14}/>{d.split('(')[0].trim()}</span>)}</div><div className="task-mini-list">{item.tasks.map(t => <div key={t.task_id}><span className={`score-dot ${scoreClass(t.score)}`} /><b>{t.description}</b><small>{t.department} · {t.severity} · {Math.round(t.score)} priority</small></div>)}</div><div className="approval-actions"><button className="ghost" disabled={busy} onClick={() => decide('Rejected')}><X size={16}/> Reject</button><button className="primary" disabled={busy} onClick={() => decide('Approved')}><Check size={16}/> Approve & Dispatch</button></div></div>; }

function Plans({ role, department }) { const [horizon,setHorizon] = useState('Weekly'); const data = useAsyncData(() => apiFetch(`/plans?horizon=${horizon}`), [horizon]); const tasksData = useAsyncData(() => apiFetch('/tasks'), []); const [busy,setBusy] = useState(false); async function optimize() { if(busy) return; setBusy(true); try { await apiFetch(`/optimize?horizon=${horizon}`, {method:'POST'}); await data.reload(); } catch(e) { window.alert(`Optimizer error: ${e.message}`); } finally { setBusy(false); } } if(data.loading&&!data.data)return <Loader/>; if(data.error&&!data.data)return <RetryPanel message={data.error} onRetry={data.reload}/>; if(tasksData.loading&&!tasksData.data)return <Loader/>; if(tasksData.error&&!tasksData.data)return <RetryPanel message={tasksData.error} onRetry={tasksData.reload}/>; const rows=data.data||[]; return <><div className="segmented"><button className={horizon==='Daily'?'active':''} onClick={()=>setHorizon('Daily')}>Daily</button><button className={horizon==='Weekly'?'active':''} onClick={()=>setHorizon('Weekly')}>Weekly</button><button className={horizon==='Monthly'?'active':''} onClick={()=>setHorizon('Monthly')}>Monthly</button>{(role==='controller'||role==='department')&&<button className="primary push" disabled={busy} onClick={optimize}><Sparkles size={15}/> {busy?'Optimizing…':'Run AI Optimizer'}</button>}</div>{rows.map(p=><div className="panel plan-panel" key={p.plan_id}><div className="panel-title"><div><b>{p.horizon_type} maintenance plan <span className="muted">· {p.plan_id}</span></b><span>{p.horizon_start} → {p.horizon_end} · {p.item_count} coordinated blocks</span></div><span className={`badge ${String(p.status).toLowerCase().includes('approved')?'green':'amber'}`}>{p.status}</span></div><div className="timeline">{p.items.map(item=><PlanItem key={item.plan_item_id} item={item} department={department} tasks={tasksData.data||[]}/>)}</div></div>)}{rows.length===0&&<Empty title={`No ${horizon.toLowerCase()} plans yet`} text="Run the AI optimizer to generate a safe plan from the maintenance dataset."/>}</>; }
function PlanItem({ item, department, tasks }) { const corridorTasks=tasks.filter(t=>t.corridor_id===item.corridor_id); const visible=corridorTasks.filter(t=>!department||t.department_id===department); return <div className="timeline-row"><div className="time-col"><b>{fmt(item.window_start,true)}</b><span>{fmt(item.window_end,true)}</span></div><div className="timeline-line"><i/><div/></div><div className="block-card"><div className="block-head"><div><b>{item.corridor_id}</b><span>{corridorTasks.slice(0,3).map(t=>t.department_name.split('(')[0].trim()).filter((x,i,a)=>a.indexOf(x)===i).join(' + ')||'Coordinated block'}</span></div><span className={`badge ${String(item.controller_decision).toLowerCase()==='approved'?'green':'amber'}`}>{item.controller_decision}</span></div><div className="block-meta"><span><Clock3 size={14}/> Work {fmt(item.window_start)}–{fmt(item.window_end)}</span><span><ShieldCheck size={14}/> Safety ±10 min</span><span><TrainFront size={14}/> Timetable checked</span></div><div className="task-pills">{visible.slice(0,5).map(t=><span key={t.task_id}>{t.task_id} · {t.description}</span>)}</div></div></div>; }
function fmt(value, dateOnly=false) { if(!value)return '—'; const d=new Date(value); if(Number.isNaN(d.getTime()))return String(value); return dateOnly?d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):d.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}); }

function Analytics({ session }) { const data=useAsyncData(()=>apiFetch(`/analytics?role=${session.user.role}&department_id=${encodeURIComponent(session.user.department_id||'')}`),[session.user.role,session.user.department_id]); if(data.loading&&!data.data)return <Loader/>; if(data.error&&!data.data)return <RetryPanel message={data.error} onRetry={data.reload}/>; const d=data.data; const distribution=d.priority_distribution||{}; const entries=Object.entries(distribution); const total=entries.reduce((sum,[,v])=>sum+Number(v||0),0); let cursor=0; const segments=[]; entries.forEach(([key,value])=>{const start=cursor; cursor += total ? Number(value)/total*100 : 0; segments.push(`${colorFor(key)} ${start}% ${cursor}%`);}); const gradient=`conic-gradient(${segments.join(',')})`; return <><div className="kpi-grid"><Kpi label="Critical" value={distribution.critical??0} icon={AlertTriangle} danger/><Kpi label="High" value={distribution.high??0} icon={Zap}/><Kpi label="Medium" value={distribution.medium??0} icon={Activity}/><Kpi label="Low" value={distribution.low??0} icon={Check}/></div><div className="analytics-role-banner"><Sparkles size={15}/><span><b>{d.profile_label}</b><small>{d.profile_note}</small></span><strong>{total} tasks in view</strong></div><div className="two-col"><div className="panel chart-panel"><div className="panel-title"><div><b>Priority distribution</b><span>Role-specific operational workload</span></div></div><div className="donut-wrap"><div className="donut" style={{background:gradient}}><div><b>{total}</b><small>tasks</small></div></div><div className="legend">{entries.map(([key,value])=><div key={key}><i className="legend-dot" style={{background:colorFor(key)}}/><span>{key}</span><b>{value} <small>({total?Math.round(Number(value)/total*100):0}%)</small></b></div>)}</div></div></div><div className="panel"><div className="panel-title"><div><b>Department load</b><span>Backlog vs average priority</span></div></div>{(d.department||[]).map(x=><div className="bar-row" key={x.department}><div><b>{x.department.split('(')[0]}</b><span>{x.tasks} tasks</span></div><div className="bar"><i style={{width:`${Math.min(100,Number(x.avg_score)||0)}%`}}/></div><strong>{x.avg_score}</strong></div>)}</div></div></>; }
function colorFor(key) { return ({critical:'#ff5377',high:'#ffbd59',medium:'#2e7bff',low:'#24e28a'})[key]||'#5cc8ff'; }
function Backlog(){const data=useAsyncData(()=>apiFetch('/dashboard/department?department_id=DPT001'),[]);if(data.loading&&!data.data)return <Loader/>;if(data.error&&!data.data)return <RetryPanel message={data.error} onRetry={data.reload}/>;const rows=data.data?.department_backlog||[];const icons=[Factory,Activity,Zap];const classes=['blue','violet','green'];return <div className="panel"><div className="panel-title"><div><b>Department backlog</b><span>Live work waiting across the three maintenance disciplines.</span></div><button className="icon-btn" onClick={data.reload} aria-label="Refresh backlog"><RefreshCw size={16}/></button></div><div className="dept-cards">{rows.map((row,i)=>{const Icon=icons[i%icons.length];return <div className={`dept-card ${classes[i%classes.length]}`} key={row.department_id}><Icon/><b>{row.department.split('(')[0].trim()}</b><span>{row.department}</span><strong>{row.backlog}</strong><small>tasks in queue</small></div>})}</div></div>}
function CrossDepartment(){return <div className="panel cross-panel"><div className="panel-title"><div><b>Multi-department maintenance blocks</b><span>This is the judge-facing differentiator: one safe corridor window, multiple teams, one coordinated plan.</span></div><Network/></div><div className="cross-visual"><div className="cross-node"><Factory/><b>AI Optimizer</b><small>groups compatible work</small></div><ArrowRight/><div className="corridor-node"><TrainFront/><b>Same corridor</b><small>one protected block</small></div><ArrowRight/><div className="teams"><span><Factory/>P.Way</span><span><Activity/>S&T</span><span><Zap/>TRD</span></div></div><div className="callout"><ShieldCheck/><div><b>Why grouping reduces disruption</b><p>Compatible work on the same corridor is grouped into one controller-approved block. The optimizer checks timetable pressure and preserves a 10-minute safety margin before and after execution.</p></div></div></div>}
function Conflicts(){return <div className="alert-grid"><AlertCard level="Resolved" title="Multi-department clash" text="Compatible P.Way, S&T and TRD work can share one protected corridor block when constraints permit."/><AlertCard level="Watch" title="High traffic corridor" text="The optimizer evaluates recurring timetable slots before selecting a maintenance window."/><AlertCard level="Action" title="Deadline pressure" text="Critical tasks due soon receive a priority uplift so planners see them first."/></div>}
function AlertCard({level,title,text}){return <div className="panel alert-card"><div className="alert-icon"><TriangleAlert size={20}/></div><div><span className="badge amber">{level}</span><h3>{title}</h3><p>{text}</p></div></div>}
function Submissions(){const data=useAsyncData(()=>apiFetch('/tasks'),[]);if(data.loading&&!data.data)return <Loader/>;if(data.error&&!data.data)return <RetryPanel message={data.error} onRetry={data.reload}/>;const rows=(data.data||[]).slice(-20).reverse().map(t=>[<b key="a">{t.submission_id}</b>,t.task_id,<span key="b" className="badge green">Validated</span>,t.reported_date,<span key="c" className="status-text">{String(t.status).toLowerCase()==='scheduled'?'Approved → scheduled':'AI scoring → planning'}</span>]);return <TablePanel title="Submission traceability" subtitle="Live requests linked to task, score and planning lifecycle." columns={['Submission','Task','Validation','Created','Next stage']} rows={rows} onRefresh={data.reload}/>} 
function UsersPage(){return <TablePanel title="Users & roles" subtitle="Demo role model used for the SIH prototype." columns={['User','Role','Authority','Scope']} rows={[['USR001 · Divya Rao','Department Supervisor','1','P.Way'],['USR010 · Karthik Kumar','Section Controller','2','Control'],['USR014 · Priya Reddy','Chief Controller/DOM','3','Network'],['USR015 · System Admin','Admin','4','System']]}/>} 
function DataSources(){return <div className="data-grid">{[['TMS','Track Management System','65 assets · maintenance inputs'],['SMMS','Signal Maintenance Management System','S&T maintenance inputs'],['TDMS','Traction Distribution Management System','TRD / traction inputs'],['Timetable','Traffic planning source','Recurring train slots'],['RailBlock DB','Optimization data layer','Plans · approvals · audit trail']].map(([a,b,c])=><div className="panel data-card" key={a}><div className="source-icon"><Database size={19}/></div><b>{a}</b><span>{b}</span><small>{c}</small><em>CONNECTED</em></div>)}</div>}
function Health(){return <div className="health-grid">{['TMS connector','SMMS connector','TDMS connector','Timetable feed','Optimization engine','Database'].map((x,i)=><div className="panel health-card" key={x}><div className="health-dot"/><div><b>{x}</b><span>Operational · latency {12+i*3}ms</span></div><Check size={18}/></div>)}</div>}
function Jobs(){return <TablePanel title="Optimization jobs" subtitle="Model execution history and solver health." columns={['Job','Horizon','Model','Solver','Status']} rows={[['OPTJOB001','Weekly','MODEL_OPT_v1','Feasible','Published'],['OPTJOB002','Monthly','MODEL_OPT_v1','Feasible','Published'],['LIVE-DEMO','On demand','MODEL_OPT_v2','Feasible','Ready']].map(r=>r.map((x,i)=>i===4?<span key={i} className="badge green">{x}</span>:x))}/>} 
function Logs(){return <TablePanel title="Audit & system logs" subtitle="Traceable actions for demonstrations and governance." columns={['Time','Actor','Action','Entity','Result']} rows={Array.from({length:7},(_,i)=>[`10 Sep 2026 21:${40+i}`,i%2?'AI Optimizer':'USR014',['Priority scored','Plan generated','Approval recorded','Notification sent'][i%4],['TASK000'+(i+1),'PLAN001','PI000'+(i+1)][i%3],<span key="x" className="badge green">Success</span>])}/>} 
function SettingsPage(){return <div className="two-col"><div className="panel settings-card"><div className="panel-title"><div><b>AI policy</b><span>Demo configuration</span></div></div><label>Priority model<select defaultValue="v2"><option value="v2">MODEL_PRIORITY_v2 · Traffic-aware</option></select></label><label>Optimizer<select defaultValue="v2"><option value="v2">MODEL_OPT_v2 · Constraint grouping</option></select></label><label>Safety buffer<input value="10 minutes before + 10 minutes after" readOnly/></label></div><div className="panel settings-card"><div className="panel-title"><div><b>Governance</b><span>Human-in-the-loop controls</span></div></div>{['Controller approval required','Cross-department grouping','Timetable conflict checks','Audit logging'].map(x=><div className="toggle-row" key={x}><span>{x}</span><b>ON</b></div>)}</div></div>}
function Empty({title,text}){return <div className="panel empty"><Sparkles size={24}/><h3>{title}</h3><p>{text}</p></div>}
function RetryPanel({message,onRetry}){return <div className="fatal-error"><div className="panel"><TriangleAlert size={25}/><h3>Could not load this section</h3><p>{message || 'Backend connection failed.'}</p><button className="primary" onClick={onRetry || (()=>window.location.reload())}>Retry</button></div></div>}
class ErrorBoundary extends React.Component { constructor(props){super(props);this.state={error:null};} static getDerivedStateFromError(error){return {error};} componentDidCatch(error,info){console.error('RailBlock UI error',error,info);} render(){if(this.state.error)return <div className="fatal-error"><div className="panel"><TriangleAlert size={28}/><h2>RailBlock recovered from a screen error</h2><p>{this.state.error?.message || 'Unexpected UI error'}</p><button className="primary" onClick={()=>this.setState({error:null})}>Retry screen</button><button className="ghost" onClick={()=>window.location.reload()}>Reload application</button></div></div>;return this.props.children;} }

createRoot(document.getElementById('root')).render(<App />);
