import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND } from "./brand.js";
import { useAuth, supabase } from "./account.js";
import Account from "./Account.jsx";
import Premium from "./Premium.jsx";
import { isPremium, checkPremiumOnce, syncAccount } from "./premium.js";
import * as api from "./api.js";

// ---------- what each kind of item holds ----------
const KINDS = {
  appointment: {
    label: "Appointments", one: "appointment", icon: "📅", who: "Who's taking them",
    fields: [
      { id: "title", label: "What it is", required: true, placeholder: "Heart doctor checkup" },
      { id: "date", label: "Date", type: "date" },
      { id: "time", label: "Time", type: "time" },
      { id: "place", label: "Where", placeholder: "Baylor Heart Clinic, 3rd floor" },
      { id: "with", label: "Doctor or provider", placeholder: "Dr. Patel" },
      { id: "notes", label: "Notes", type: "textarea", placeholder: "Bring the medicine list. Ask about the new swelling." },
    ],
  },
  medicine: {
    label: "Medicines", one: "medicine", icon: "💊", who: null,
    fields: [
      { id: "name", label: "Medicine name", required: true, placeholder: "Lisinopril" },
      { id: "dose", label: "Dose, as written on the label", placeholder: "10 mg, 1 tablet" },
      { id: "when", label: "When to take it", placeholder: "Every morning with breakfast" },
      { id: "purpose", label: "What it's for", placeholder: "Blood pressure" },
      { id: "prescriber", label: "Prescribed by", placeholder: "Dr. Patel" },
      { id: "pharmacy", label: "Pharmacy", placeholder: "Walgreens on Main St" },
      { id: "notes", label: "Notes", type: "textarea", placeholder: "Refill due mid-month" },
    ],
  },
  todo: {
    label: "To-dos", one: "to-do", icon: "✅", who: "Who's doing it",
    fields: [
      { id: "title", label: "What needs doing", required: true, placeholder: "Pick up groceries" },
      { id: "due", label: "Due date", type: "date" },
      { id: "notes", label: "Notes", type: "textarea" },
    ],
  },
};

const CARD_FIELDS = [
  { id: "person", label: "Name" },
  { id: "birth_date", label: "Date of birth", type: "date" },
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address", type: "textarea" },
  { id: "allergies", label: "Allergies", type: "textarea", placeholder: "Penicillin, shellfish" },
  { id: "conditions", label: "Health conditions", type: "textarea" },
  { id: "doctors", label: "Doctors and phone numbers", type: "textarea" },
  { id: "insurance", label: "Insurance (plan and member ID)", type: "textarea" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "hospital", label: "Preferred hospital" },
  { id: "contacts", label: "Emergency contacts", type: "textarea", placeholder: "Chris (son) 214-555-0100" },
  { id: "notes", label: "Other important notes", type: "textarea", placeholder: "Has a pacemaker. Uses a walker." },
];

// ---------- small helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function niceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (iso === isoToday()) return "Today";
  if (iso === isoIn(1)) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
function niceTime(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || "");
  if (!m) return "";
  const h = +m[1];
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
const apptKey = (i) => `${i.data.date || "9999-99-99"} ${i.data.time || "99:99"}`;

function Field({ f, value, onChange, idPrefix }) {
  const id = `${idPrefix}-${f.id}`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{f.label}{f.required && <span className="req" aria-hidden="true"> *</span>}</label>
      {f.type === "textarea" ? (
        <textarea id={id} rows={3} value={value || ""} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type={f.type || "text"} value={value || ""} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function MemberSelect({ id, label, members, value, onChange }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not decided yet</option>
        {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
      </select>
    </div>
  );
}

function ItemForm({ kind, item, members, onSave, onCancel, onDelete, busy }) {
  const k = KINDS[kind];
  const [data, setData] = useState(() => ({ ...(item?.data || {}) }));
  const [who, setWho] = useState(item?.assigned_to || "");
  const [error, setError] = useState("");
  const set = (id, v) => setData((d) => ({ ...d, [id]: v }));
  function submit(e) {
    e.preventDefault();
    const need = k.fields.find((f) => f.required);
    if (need && !String(data[need.id] || "").trim()) return setError(`Please add ${need.label.toLowerCase()}.`);
    setError("");
    onSave(data, who);
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{item ? `Edit ${k.one}` : `Add ${k.one === "appointment" ? "an" : "a"} ${k.one}`}</h2>
      {kind === "medicine" && <p className="muted small">For keeping track only. Always follow the label and the doctor's or pharmacist's directions.</p>}
      {k.fields.map((f) => <Field key={f.id} f={f} idPrefix={`f-${kind}`} value={data[f.id]} onChange={(v) => set(f.id, v)} />)}
      {k.who && <MemberSelect id={`f-${kind}-who`} label={k.who} members={members} value={who} onChange={setWho} />}
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        {item && <button type="button" className="link danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}

function ItemRow({ kind, item, members, onOpen, onToggle }) {
  const d = item.data;
  const person = members.find((m) => m.user_id === item.assigned_to);
  let line1 = d.title || d.name;
  let line2 = "";
  if (kind === "appointment") line2 = [niceDate(d.date), niceTime(d.time), d.place].filter(Boolean).join(" · ");
  if (kind === "medicine") line2 = [d.dose, d.when].filter(Boolean).join(" · ");
  if (kind === "todo") line2 = d.due ? `Due ${niceDate(d.due)}` : "";
  const overdue = kind === "todo" && !item.done && d.due && d.due < isoToday();
  return (
    <li className={`row${item.done ? " done" : ""}`}>
      {kind === "todo" && (
        <input type="checkbox" className="tick" checked={item.done} aria-label={`Mark "${line1}" done`} onChange={(e) => onToggle(item, e.target.checked)} />
      )}
      <button type="button" className="row-main" onClick={() => onOpen(item)}>
        <span className="row-title">{line1}</span>
        {line2 && <span className={`row-sub${overdue ? " overdue" : ""}`}>{line2}</span>}
        {person && <span className="row-who">{KINDS[kind].who}: {person.name}</span>}
      </button>
    </li>
  );
}

// ---------- the app ----------
export default function App() {
  const { ready, user } = useAuth();
  const [premium, setPremium] = useState(isPremium);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("home"); // home | circle | premium | settings
  const [circles, setCircles] = useState(null);
  const [limits, setLimits] = useState(null);
  const [circleId, setCircleId] = useState(null);
  const [circle, setCircle] = useState(null);
  const [tab, setTab] = useState("today");
  const [editing, setEditing] = useState(null); // { kind, item|null }
  const [cardEdit, setCardEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(window.location.search).get("join") || "");
  const [newName, setNewName] = useState("");
  const [myName, setMyName] = useState("");

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--main", BRAND.colors.main);
    root.setProperty("--main-2", BRAND.colors.mainHover);
    root.setProperty("--soft", BRAND.colors.soft);
    document.title = BRAND.name;
    checkPremiumOnce().then((status) => {
      setPremium(isPremium());
      if (status === "activated") setNotice("Premium is active. Thank you! Your circles can now have up to 10 members.");
      else if (status === "expired") setNotice("Your Premium plan has ended. Your circle and everything in it is still here.");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      syncAccount().then(() => setPremium(isPremium()));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, tab, editing, cardEdit]);

  const loadCircles = useCallback(async () => {
    try {
      const [list, lim] = await Promise.all([api.myCircles(), api.myLimits()]);
      setCircles(list);
      setLimits(lim);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (user) loadCircles();
    else { setCircles(null); setCircle(null); setView("home"); }
  }, [user, loadCircles]);

  const loadCircle = useCallback(async (id, quiet) => {
    try {
      const data = await api.getCircle(id);
      setCircle(data);
      if (!quiet) setError("");
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        setNotice(e.message);
        setView("home");
        setCircleId(null);
        loadCircles();
      } else if (!quiet) setError(e.message);
    }
  }, [loadCircles]);

  // Keep the circle fresh: everyone in the family sees changes within about 30 seconds.
  useEffect(() => {
    if (view !== "circle" || !circleId) return undefined;
    const refresh = () => { if (document.visibilityState === "visible" && !editing && !cardEdit) loadCircle(circleId, true); };
    const t = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [view, circleId, editing, cardEdit, loadCircle]);

  async function run(fn, done) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (done) await done(r);
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openCircle(id) {
    setCircleId(id);
    setCircle(null);
    setTab("today");
    setEditing(null);
    setCardEdit(null);
    setView("circle");
    loadCircle(id);
  }

  const members = circle?.members || [];
  const items = circle?.items || [];
  const isOwner = circle?.me?.role === "owner";
  const byKind = useMemo(() => {
    const out = { appointment: [], medicine: [], todo: [] };
    items.forEach((i) => out[i.kind]?.push(i));
    out.appointment.sort((a, b) => apptKey(a).localeCompare(apptKey(b)));
    out.todo.sort((a, b) => (a.done - b.done) || String(a.data.due || "9999").localeCompare(String(b.data.due || "9999")));
    out.medicine.sort((a, b) => String(a.data.name).localeCompare(String(b.data.name)));
    return out;
  }, [items]);

  const saveItem = (kind, item) => (data, who) => run(
    () => (item
      ? api.updateItem(item.id, { data: { ...data, _kind: kind }, set_assigned: !!KINDS[kind].who, assigned_to: who || null })
      : api.addItem(circleId, kind, data, who)),
    async () => { setEditing(null); setToast("Saved. Everyone in the circle will see it."); await loadCircle(circleId, true); },
  );
  const removeItem = (item) => {
    if (!window.confirm("Delete this for everyone in the circle?")) return;
    run(() => api.deleteItem(item.id), async () => { setEditing(null); await loadCircle(circleId, true); });
  };
  const toggleTodo = (item, done) => {
    setCircle((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    api.updateItem(item.id, { done }).catch((e) => { setError(e.message); loadCircle(circleId, true); });
  };

  const inviteLink = circle ? `${window.location.origin}${window.location.pathname}?join=${circle.circle.invite_code}` : "";
  async function shareInvite() {
    const text = `Join our family care circle for ${circle.circle.name} on ${BRAND.name}. Open this link and sign in with a free CashCow account: ${inviteLink} (invite code ${circle.circle.invite_code})`;
    if (navigator.share) {
      try { await navigator.share({ title: BRAND.name, text }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(text); setToast("Invite copied. Paste it into a text or email."); } catch { setToast(`Invite code: ${circle.circle.invite_code}`); }
  }

  const today = isoToday();
  const weekOut = isoIn(7);
  const upcoming = byKind.appointment.filter((a) => a.data.date && a.data.date >= today && a.data.date <= weekOut);
  const openTodos = byKind.todo.filter((t) => !t.done);

  // ---------- screens ----------
  let body;
  if (!ready) {
    body = <section className="card"><p className="muted">Loading…</p></section>;
  } else if (view === "premium") {
    body = <Premium premium={premium} onBack={() => setView(circleId ? "circle" : "home")} />;
  } else if (view === "settings") {
    body = (
      <>
        <button type="button" className="link back" onClick={() => setView(circleId ? "circle" : "home")}>← Back</button>
        <Account premium={premium} />
      </>
    );
  } else if (!user) {
    body = (
      <>
        <section className="card hero">
          <h1>Care for someone, together</h1>
          <p>{BRAND.tagline}</p>
          <ul className="plain">
            <li>📅 Appointments, and who's driving</li>
            <li>💊 The medicine list, always up to date</li>
            <li>✅ Shared to-dos, so nothing falls through the cracks</li>
            <li>🆘 An emergency care card for the hospital</li>
          </ul>
          {joinCode && <p className="callout">You've been invited to a family circle. Sign in or create a free account to join.</p>}
        </section>
        <Account premium={premium} intro="Everyone in the circle signs in with a free CashCow account, so only your family can see your plan. The same account works in every CashCow app." />
      </>
    );
  } else if (view === "circle" && editing) {
    body = (
      <ItemForm kind={editing.kind} item={editing.item} members={members} busy={busy}
        onSave={saveItem(editing.kind, editing.item)} onCancel={() => setEditing(null)} onDelete={() => removeItem(editing.item)} />
    );
  } else if (view === "circle" && cardEdit) {
    body = (
      <form className="card form" onSubmit={(e) => { e.preventDefault(); run(() => api.saveCard(circleId, cardEdit), async () => { setCardEdit(null); setToast("Care card saved."); await loadCircle(circleId, true); }); }}>
        <h2>Edit the care card</h2>
        <p className="muted small">Everyone in the circle can see and update this. Medicines are added from the Medicines tab automatically.</p>
        {CARD_FIELDS.map((f) => <Field key={f.id} f={f} idPrefix="card" value={cardEdit[f.id]} onChange={(v) => setCardEdit((c) => ({ ...c, [f.id]: v }))} />)}
        <div className="button-row">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save card"}</button>
          <button type="button" className="btn-secondary" onClick={() => setCardEdit(null)}>Cancel</button>
        </div>
      </form>
    );
  } else if (view === "circle") {
    const card = circle?.circle?.card || {};
    body = !circle ? (
      <section className="card"><p className="muted">Loading your circle…</p></section>
    ) : (
      <>
        <button type="button" className="link back" onClick={() => { setView("home"); setCircleId(null); loadCircles(); }}>← All circles</button>
        <section className="card circle-head">
          <h1>{circle.circle.name}</h1>
          <p className="muted small">{members.length} {members.length === 1 ? "person" : "people"} · {members.map((m) => m.name).join(", ")}</p>
        </section>
        <nav className="tabs" aria-label="Circle sections">
          {[["today", "Today"], ["appointment", "📅 Appts"], ["medicine", "💊 Meds"], ["todo", "✅ To-dos"], ["card", "🆘 Card"], ["people", "👪 People"]].map(([id, name]) => (
            <button key={id} type="button" className={tab === id ? "tab on" : "tab"} aria-pressed={tab === id} onClick={() => setTab(id)}>{name}</button>
          ))}
        </nav>

        {tab === "today" && (
          <>
            <section className="card">
              <h2>Next 7 days</h2>
              {upcoming.length ? (
                <ul className="rows">{upcoming.map((i) => <ItemRow key={i.id} kind="appointment" item={i} members={members} onOpen={(it) => setEditing({ kind: "appointment", item: it })} />)}</ul>
              ) : <p className="muted">No appointments this week.</p>}
              <button type="button" className="btn-secondary" onClick={() => setEditing({ kind: "appointment", item: null })}>+ Add an appointment</button>
            </section>
            <section className="card">
              <h2>To-dos</h2>
              {openTodos.length ? (
                <ul className="rows">{openTodos.slice(0, 8).map((i) => <ItemRow key={i.id} kind="todo" item={i} members={members} onOpen={(it) => setEditing({ kind: "todo", item: it })} onToggle={toggleTodo} />)}</ul>
              ) : <p className="muted">Nothing on the list. Nice.</p>}
              <button type="button" className="btn-secondary" onClick={() => setEditing({ kind: "todo", item: null })}>+ Add a to-do</button>
            </section>
            <section className="card">
              <h2>Medicines</h2>
              {byKind.medicine.length ? (
                <ul className="rows">{byKind.medicine.map((i) => <ItemRow key={i.id} kind="medicine" item={i} members={members} onOpen={(it) => setEditing({ kind: "medicine", item: it })} />)}</ul>
              ) : <p className="muted">No medicines listed yet.</p>}
            </section>
          </>
        )}

        {["appointment", "medicine", "todo"].includes(tab) && (() => {
          const list = byKind[tab];
          const past = tab === "appointment" ? list.filter((a) => a.data.date && a.data.date < today) : [];
          const main = tab === "appointment" ? list.filter((a) => !past.includes(a)) : list;
          return (
            <section className="card">
              <div className="row-between">
                <h2>{KINDS[tab].label}</h2>
                <button type="button" className="btn-primary small-btn" onClick={() => setEditing({ kind: tab, item: null })}>+ Add</button>
              </div>
              {tab === "medicine" && <p className="muted small">For keeping track only. Always follow the label and the doctor's or pharmacist's directions.</p>}
              {main.length ? (
                <ul className="rows">{main.map((i) => <ItemRow key={i.id} kind={tab} item={i} members={members} onOpen={(it) => setEditing({ kind: tab, item: it })} onToggle={toggleTodo} />)}</ul>
              ) : <p className="muted">Nothing here yet. Tap Add to start.</p>}
              {past.length > 0 && (
                <details>
                  <summary>Past appointments ({past.length})</summary>
                  <ul className="rows">{[...past].reverse().map((i) => <ItemRow key={i.id} kind={tab} item={i} members={members} onOpen={(it) => setEditing({ kind: tab, item: it })} />)}</ul>
                </details>
              )}
            </section>
          );
        })()}

        {tab === "card" && (
          <>
            <section className="card care-card" aria-label="Emergency care card">
              <h2>🆘 Emergency care card</h2>
              {CARD_FIELDS.filter((f) => card[f.id]).length === 0 && <p className="muted">Nothing on the card yet. Add allergies, doctors, insurance and emergency contacts so anyone can help in a hurry.</p>}
              <dl>
                {CARD_FIELDS.filter((f) => card[f.id]).map((f) => (
                  <div key={f.id} className="card-line">
                    <dt>{f.label}</dt>
                    <dd>{f.type === "date" ? niceDate(card[f.id]) : card[f.id]}</dd>
                  </div>
                ))}
                {byKind.medicine.length > 0 && (
                  <div className="card-line">
                    <dt>Medicines</dt>
                    <dd>{byKind.medicine.map((m) => [m.data.name, m.data.dose, m.data.when].filter(Boolean).join(", ")).join("\n")}</dd>
                  </div>
                )}
              </dl>
              <p className="muted small card-foot">From {BRAND.name}, updated by the family. In an emergency, call 911.</p>
            </section>
            <div className="button-row">
              <button type="button" className="btn-primary" onClick={() => setCardEdit({ ...card })}>Edit card</button>
              <button type="button" className="btn-secondary" onClick={() => (premium || circle.limits?.premium ? window.print() : setView("premium"))}>
                Print card{!(premium || circle.limits?.premium) && <span className="pill-premium">Premium</span>}
              </button>
            </div>
          </>
        )}

        {tab === "people" && (
          <>
            <section className="card">
              <h2>People in this circle</h2>
              <ul className="rows">
                {members.map((m) => (
                  <li key={m.user_id} className="row">
                    <span className="row-main static">
                      <span className="row-title">{m.name}{m.user_id === circle.me.user_id ? " (you)" : ""}</span>
                      <span className="row-sub">{m.role === "owner" ? "Organizer" : "Family member"}</span>
                    </span>
                    {isOwner && m.role !== "owner" && (
                      <button type="button" className="link danger" onClick={() => window.confirm(`Remove ${m.name} from the circle?`) && run(() => api.removeMember(circleId, m.user_id), () => loadCircle(circleId, true))}>Remove</button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="muted small">
                {members.length} of {circle.limits?.max_members ?? 2} people.
                {!circle.limits?.premium && " The organizer's Premium raises the limit to 10."}
              </p>
            </section>
            <section className="card">
              <h2>Invite family</h2>
              <p>Share this invite. They open the link, sign in with a free CashCow account, and they're in.</p>
              <p className="invite-code" aria-label="Invite code">{circle.circle.invite_code}</p>
              <div className="button-row">
                <button type="button" className="btn-primary" onClick={shareInvite}>Share invite</button>
                {isOwner && <button type="button" className="link" onClick={() => window.confirm("Make a new code? The old one will stop working.") && run(() => api.newCode(circleId), () => loadCircle(circleId, true))}>New code</button>}
              </div>
              {!circle.limits?.premium && members.length >= (circle.limits?.max_members ?? 2) && (
                <p className="callout small">This circle is full on the free plan. {isOwner ? "Go Premium for up to 10 people." : "The organizer can go Premium for up to 10 people."}</p>
              )}
              {isOwner && !premium && <button type="button" className="btn-secondary" onClick={() => setView("premium")}>See Premium</button>}
            </section>
            <section className="card">
              <h2>{isOwner ? "Circle settings" : "Leave"}</h2>
              {isOwner ? (
                <>
                  <button type="button" className="link" onClick={() => { const n = window.prompt("New name for this circle", circle.circle.name); if (n) run(() => api.renameCircle(circleId, n), () => loadCircle(circleId, true)); }}>Rename circle</button>
                  <button type="button" className="link danger block" onClick={() => window.confirm("Delete this circle and everything in it for everyone? This can't be undone.") && run(() => api.deleteCircle(circleId), () => { setView("home"); setCircleId(null); loadCircles(); setToast("Circle deleted."); })}>Delete circle</button>
                </>
              ) : (
                <button type="button" className="link danger" onClick={() => window.confirm("Leave this circle? You'll need a new invite to come back.") && run(() => api.leaveCircle(circleId), () => { setView("home"); setCircleId(null); loadCircles(); })}>Leave this circle</button>
              )}
            </section>
          </>
        )}
      </>
    );
  } else {
    // home: my circles, create, join
    const owned = (circles || []).filter((c) => c.role === "owner").length;
    const canCreate = limits ? owned < limits.max_circles : true;
    body = (
      <>
        <section className="card hero">
          <h1>Your care circles</h1>
          <p className="muted">One shared plan per person you're caring for.</p>
          {circles === null ? <p className="muted">Loading…</p> : circles.length === 0 ? (
            <p>You're not in a circle yet. Start one below, or join with an invite code from family.</p>
          ) : (
            <ul className="circle-list">
              {circles.map((c) => (
                <li key={c.id}>
                  <button type="button" className="circle-btn" onClick={() => openCircle(c.id)}>
                    <strong>{c.name}</strong>
                    <span className="muted small">{c.members} {c.members === 1 ? "person" : "people"} · {c.role === "owner" ? "You organize" : "Member"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className="card form" onSubmit={(e) => { e.preventDefault(); if (!joinCode.trim() || !myName.trim()) return setError("Add the invite code and your name."); run(() => api.joinCircle(joinCode, myName), async (r) => { setJoinCode(""); window.history.replaceState(null, "", window.location.pathname); setToast(`You joined ${r.name}.`); await loadCircles(); openCircle(r.id); }); }}>
          <h2>Join a family circle</h2>
          <Field f={{ id: "code", label: "Invite code", placeholder: "8 letters and numbers" }} idPrefix="join" value={joinCode} onChange={(v) => setJoinCode(v.toUpperCase())} />
          <Field f={{ id: "name", label: "Your name, as the family knows you", placeholder: "Chris" }} idPrefix="join" value={myName} onChange={setMyName} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Joining…" : "Join circle"}</button>
        </form>

        <form className="card form" onSubmit={(e) => { e.preventDefault(); if (!canCreate) return setView("premium"); if (!newName.trim() || !myName.trim()) return setError("Add who you're caring for and your name."); run(() => api.createCircle(newName, myName), async (r) => { setNewName(""); await loadCircles(); openCircle(r.id); setTab("people"); setToast("Circle created. Now invite family."); }); }}>
          <h2>Start a new circle</h2>
          <Field f={{ id: "who", label: "Who are you caring for?", placeholder: "Mom" }} idPrefix="new" value={newName} onChange={setNewName} />
          <Field f={{ id: "me", label: "Your name, as the family knows you", placeholder: "Chris" }} idPrefix="new" value={myName} onChange={setMyName} />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create circle"}{!canCreate && <span className="pill-premium">Premium</span>}
          </button>
          {limits && <p className="muted small">You can organize {limits.max_circles === 1 ? "1 circle" : `up to ${limits.max_circles} circles`} with up to {limits.max_members} people each{limits.premium ? " (Premium)" : ". Premium: 3 circles, 10 people each"}.</p>}
        </form>

        {!premium && (
          <section className="card premium-teaser">
            <h2>Go Premium</h2>
            <p className="muted">Up to 10 family members per circle, up to 3 circles, and a printable emergency card. From $2.99 a month.</p>
            <button type="button" className="btn-primary" onClick={() => setView("premium")}>See plans</button>
          </section>
        )}

        <section className="card">
          <h2>🛡️ Protect them from scam calls</h2>
          <p className="muted">Older adults are a top target for scams. ScamShield, another CashCow app, checks a suspicious call, text or email in seconds.</p>
          <a className="btn-secondary link-btn" href="https://cashcowai.online/scamshield.html" target="_blank" rel="noopener noreferrer">Check out ScamShield</a>
        </section>

        <section className="card">
          <h2>💬 CashCow Community</h2>
          <p className="muted">Swap caregiving tips with other members. Uses your free CashCow account.</p>
          <a className="btn-secondary link-btn" href="https://cashcowai.online/community.html#general" target="_blank" rel="noopener noreferrer">Open the community</a>
        </section>
      </>
    );
  }

  return (
    <div className="app">
      <header className="top no-print">
        <button type="button" className="brand" onClick={() => { setView("home"); setCircleId(null); setEditing(null); setCardEdit(null); if (user) loadCircles(); }} aria-label={`${BRAND.name} home`}>
          <span className="logo" aria-hidden="true">♥</span>
          <span>{BRAND.name}</span>
        </button>
        {user && <button type="button" className="link light" onClick={() => setView("settings")}>Account</button>}
      </header>
      <main>
        {notice && (
          <div className="notice no-print" role="status">
            <span>{notice}</span>
            <button type="button" className="link" onClick={() => setNotice("")} aria-label="Dismiss">✕</button>
          </div>
        )}
        {error && <p className="error no-print" role="alert">{error}</p>}
        {body}
        <p className="disclaimer no-print">
          Your circle is private to the people in it. {BRAND.name} helps families keep track; it isn't medical advice.
          In an emergency, call 911. For a possible poisoning or medicine mistake, call Poison Help at 1-800-222-1222.
        </p>
      </main>
      {toast && <div className="toast no-print" role="status">{toast}</div>}
    </div>
  );
}
