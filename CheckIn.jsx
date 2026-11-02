import { useEffect, useState } from "react";
import { sendCheckIn } from "./api.js";

// One-tap check-ins. Works on first open, asks for location only when you tap,
// and if there's no signal the tap is saved and sent as soon as you're back online.
const MOODS = [[5, "😀", "Great"], [4, "🙂", "Good"], [3, "😐", "Okay"], [2, "😟", "Low"], [1, "😢", "Really low"]];
const MOOD_NAME = Object.fromEntries(MOODS.map(([v, e, n]) => [v, `${e} ${n}`]));
const QUEUE = "mcc-checkin-queue";
const LOC_PREF = "mcc-share-location";

const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20))); } catch { /* ignore */ } };

let flushing = false;
export async function flushQueue() {
  const q = readQueue();
  if (flushing || !q.length || !navigator.onLine) return 0;
  flushing = true;
  writeQueue([]);
  const left = [];
  let sent = 0;
  for (const job of q) {
    try { await sendCheckIn(job.circleId, job.payload); sent++; } catch (e) { if (!e.status) left.push(job); }
  }
  writeQueue([...left, ...readQueue()]);
  flushing = false;
  return sent;
}

function whereAmI() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  });
}

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!(s >= 0)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function describe(d) {
  if (d.status === "help") return "🆘 Needs help";
  if (d.status === "crisis") return "💜 Needs support now";
  if (d.status === "ok") return "✅ I'm OK";
  return MOOD_NAME[d.mood] || "Checked in";
}

export default function CheckIn({ circleId, checkins, onSent }) {
  const [shareLoc, setShareLoc] = useState(() => { try { return localStorage.getItem(LOC_PREF) !== "no"; } catch { return true; } });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [askedHelp, setAskedHelp] = useState(false);

  useEffect(() => {
    const go = () => flushQueue().then((n) => { if (n) { setMsg(`Sent ${n} saved check-in${n === 1 ? "" : "s"}.`); onSent && onSent(); } });
    go();
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, [onSent]);

  function toggleLoc(v) {
    setShareLoc(v);
    try { localStorage.setItem(LOC_PREF, v ? "yes" : "no"); } catch { /* ignore */ }
  }

  async function send(status, mood) {
    if (busy) return;
    setMsg("");
    if (status === "crisis") setCrisis(true);
    if (status === "help") setAskedHelp(true);
    setBusy(status === "mood" ? `mood${mood}` : status);
    const payload = { status, when: new Date().toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) };
    if (mood) payload.mood = mood;
    if (shareLoc && status !== "mood") {
      const loc = await whereAmI();
      if (loc) Object.assign(payload, loc);
    }
    try {
      if (!navigator.onLine) throw new Error("offline");
      const r = await sendCheckIn(circleId, payload);
      if (status === "mood") setMsg("Mood saved. Your circle can see it.");
      else setMsg(r.notified ? `Sent to ${r.notified} ${r.notified === 1 ? "person" : "people"} in your circle by email.` : "Saved. Your circle will see it in the app.");
      onSent && onSent();
    } catch (e) {
      if (e.status) setMsg(e.message);
      else {
        writeQueue([...readQueue(), { circleId, payload }]);
        setMsg("No signal right now. It's saved and will send as soon as you're back online.");
      }
    } finally {
      setBusy("");
    }
  }

  const recent = [...(checkins || [])].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5);

  return (
    <>
      <section className="card checkin">
        <h2>One-tap check-in</h2>
        <p className="muted small">Lets everyone in your circle know how you're doing. "I'm OK" and "I need help" are also emailed to them.</p>
        <div className="checkin-big">
          <button type="button" className="ck ok" disabled={!!busy} onClick={() => send("ok")}>{busy === "ok" ? "Sending…" : "✅ I'm OK"}</button>
          <button type="button" className="ck help" disabled={!!busy} onClick={() => send("help")}>{busy === "help" ? "Sending…" : "🆘 I need help"}</button>
        </div>
        <label className="toggle small">
          <input type="checkbox" checked={shareLoc} onChange={(e) => toggleLoc(e.target.checked)} />
          <span>Include my location with "I'm OK" and "I need help"</span>
        </label>
        {askedHelp && (
          <p className="callout-911">If this is an emergency, call <a href="tel:911"><strong>911</strong></a> now.</p>
        )}

        <h3 className="mood-title">How are you feeling?</h3>
        <div className="moods" role="group" aria-label="How are you feeling?">
          {MOODS.map(([v, e, n]) => (
            <button key={v} type="button" className="mood" disabled={!!busy} onClick={() => send("mood", v)} aria-label={n}>
              <span aria-hidden="true">{e}</span><span className="mood-name">{n}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ck crisis" disabled={!!busy} onClick={() => send("crisis")}>💜 I need support now</button>
        {msg && <p className="checkin-msg" role="status">{msg}</p>}
      </section>

      {crisis && (
        <section className="card crisis-card" role="alert">
          <h2>You don't have to go through this alone</h2>
          <p>Talk to a trained counselor right now, free and open 24 hours. We've also let your circle know you need support.</p>
          <div className="button-row">
            <a className="btn-primary" href="tel:988">📞 Call 988</a>
            <a className="btn-secondary" href="sms:988">💬 Text 988</a>
          </div>
          <p className="muted small">988 is the Suicide &amp; Crisis Lifeline in the U.S. Outside the U.S., call your local crisis line. If you're in danger right now, call <a href="tel:911">911</a>.</p>
          <button type="button" className="link" onClick={() => setCrisis(false)}>Close</button>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card">
          <h2>Recent check-ins</h2>
          <ul className="rows">
            {recent.map((c) => (
              <li key={c.id} className={`row checkin-row s-${c.data.status}`}>
                <span className="row-main static">
                  <span className="row-title">{c.data.name}: {describe(c.data)}</span>
                  <span className="row-sub">
                    {ago(c.updated_at)}{c.data.note ? ` · ${c.data.note}` : ""}
                    {c.data.lat != null && <> · <a href={`https://maps.google.com/?q=${c.data.lat},${c.data.lng}`} target="_blank" rel="noopener noreferrer">Map</a></>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
