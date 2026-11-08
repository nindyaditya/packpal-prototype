import { useState } from 'react';
import { nightItems } from '../machine/machine';
import { prompts, wordCount } from '../machine/prompts';
import type { Item, Persona } from '../types';
import type { PackPal } from '../usePackPal';
import { LogPanel } from './LogPanel';

type Tab = 'run' | 'setup' | 'log';

export function StaffScreen({ pp }: { pp: PackPal }) {
  const [tab, setTab] = useState<Tab>('run');
  const open = pp.alerts.filter((a) => !a.resolved);

  return (
    <section className="panel staff-panel" aria-labelledby="staff-title">
      <header className="panel-head">
        <div>
          <h2 id="staff-title">Staff</h2>
          <p className="muted">{pp.persona.staffName}'s screen: setup, alerts, summaries</p>
        </div>
        {open.length > 0 && <span className="badge-alert">{open.length} alert{open.length > 1 ? 's' : ''}</span>}
      </header>

      <div className="tabs" role="tablist">
        {(
          [
            ['run', 'Run & alerts'],
            ['setup', 'Setup'],
            ['log', 'Log & evaluation'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'run' && <RunTab pp={pp} />}
      {tab === 'setup' && <SetupTab pp={pp} />}
      {tab === 'log' && <LogPanel pp={pp} />}
    </section>
  );
}

function RunTab({ pp }: { pp: PackPal }) {
  const { mock, setMock, ctx, persona } = pp;
  const open = pp.alerts.filter((a) => !a.resolved);
  const canChime = ['IDLE', 'NIGHT_DONE', 'DONE'].includes(ctx.state);

  return (
    <div className="stack">
      <div className="card">
        <h3>Mock controls</h3>
        <div className="row wrap">
          <label className="toggle">
            <input type="checkbox" checked={mock.rain} onChange={(e) => setMock({ ...mock, rain: e.target.checked })} />
            <span>Rain forecast</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={mock.planChange} onChange={(e) => setMock({ ...mock, planChange: e.target.checked })} />
            <span>Plan change</span>
          </label>
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => pp.send({ type: 'CHIME' })} disabled={!canChime}>
            Chime now (prep time {persona.activity.prepTime})
          </button>
          <button className="btn" onClick={() => pp.send({ type: 'SIMULATE_MORNING' })} disabled={ctx.state === 'ALERT'}>
            Simulate tomorrow morning
          </button>
          <button className="btn ghost" onClick={pp.reset}>
            Reset routine
          </button>
        </div>
        <p className="small muted">
          State <code>{ctx.state}</code>
          {ctx.night && (
            <>
              {' '}
              · last night: rain {ctx.night.rain ? 'on' : 'off'}, plan change {ctx.night.planChange ? 'on' : 'off'}
            </>
          )}
          {ctx.reminderAt && ctx.state === 'IDLE' && <> · reminder at {new Date(ctx.reminderAt).toTimeString().slice(0, 5)} (use Chime now to skip ahead)</>}
        </p>
      </div>

      <div className={`card ${open.length ? 'card-alert' : ''}`} aria-live="polite">
        <h3>Alerts</h3>
        {pp.alerts.length === 0 && <p className="muted small">No alerts.</p>}
        <ul className="list">
          {pp.alerts.slice(0, 8).map((a) => (
            <li key={a.id} className={a.resolved ? 'resolved' : ''}>
              <div>
                <strong>{a.reason}</strong>
                <div className="small muted">
                  {a.persona} · {new Date(a.time).toLocaleTimeString()} {a.blocking && !a.resolved && '· PackPal is paused'}
                </div>
              </div>
              {!a.resolved && (
                <button className="btn small-btn" onClick={() => pp.resolveAlert(a.id)}>
                  {a.blocking ? 'Handled, resume' : 'Handled'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>Summaries</h3>
        <p className="small muted">
          {pp.summariesOn
            ? `${persona.userName} has turned summaries on.`
            : `${persona.userName} has not turned summaries on, so none are sent.`}
        </p>
        <ul className="list">
          {pp.summaries.slice(0, 5).map((s) => (
            <li key={s.id}>
              <div>
                <div>{s.text}</div>
                <div className="small muted">{new Date(s.time).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <SettingsCard pp={pp} />
    </div>
  );
}

function SettingsCard({ pp }: { pp: PackPal }) {
  const { settings, setSettings } = pp;
  return (
    <div className="card">
      <h3>Voice and listening</h3>
      <div className="grid2">
        <label>
          <span>Listening window: {settings.listenSeconds}s</span>
          <input type="range" min={5} max={15} step={1} value={settings.listenSeconds} onChange={(e) => setSettings({ ...settings, listenSeconds: +e.target.value })} />
        </label>
        <label>
          <span>Voice rate: {settings.voiceRate.toFixed(2)}</span>
          <input type="range" min={0.5} max={1.5} step={0.05} value={settings.voiceRate} onChange={(e) => setSettings({ ...settings, voiceRate: +e.target.value })} />
        </label>
        <label>
          <span>Volume: {Math.round(settings.voiceVolume * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume} onChange={(e) => setSettings({ ...settings, voiceVolume: +e.target.value })} />
        </label>
        <label>
          <span>GenAI confidence threshold: {settings.confidenceThreshold.toFixed(2)}</span>
          <input type="range" min={0.3} max={0.95} step={0.05} value={settings.confidenceThreshold} onChange={(e) => setSettings({ ...settings, confidenceThreshold: +e.target.value })} />
        </label>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={settings.captions} onChange={(e) => setSettings({ ...settings, captions: e.target.checked })} />
        <span>Show captions on the ready spot (turn off for an audio-only test)</span>
      </label>
    </div>
  );
}

function SetupTab({ pp }: { pp: PackPal }) {
  const p = pp.persona;
  const set = (patch: Partial<Persona>) => pp.updatePersona({ ...p, ...patch });
  const setActivity = (patch: Partial<Persona['activity']>) => set({ activity: { ...p.activity, ...patch } });

  const setItem = (i: number, item: Item) => set({ items: p.items.map((x, j) => (j === i ? item : x)) });
  const move = (i: number, d: number) => {
    const items = [...p.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    set({ items });
  };

  // Show any generated line that breaks the 10-word rule.
  const lines = [
    prompts.start(p.activity.name),
    ...nightItems(p, { rain: true, planChange: false }).flatMap((it) => {
      const [l, r] = it.alternatives;
      return [prompts.item(it.name), l ? (r ? prompts.choiceTwo(it.name, l, r, p.staffName) : prompts.choiceOne(it.name, l, p.staffName)) : ''];
    }),
    prompts.recap(nightItems(p, { rain: true, planChange: false }).map((i) => i.name)),
    prompts.done(p.activity.name),
  ].filter(Boolean);
  const long = lines.filter((l) => wordCount(l) > 10);

  return (
    <div className="stack">
      <div className="card">
        <h3>Activity</h3>
        <div className="grid2">
          <Field label="Activity" value={p.activity.name} onChange={(v) => setActivity({ name: v })} />
          <Field label="Day" value={p.activity.day} onChange={(v) => setActivity({ day: v })} />
          <Field label="Start time" type="time" value={p.activity.time} onChange={(v) => setActivity({ time: v })} />
          <Field label="Pickup time" type="time" value={p.activity.pickupTime} onChange={(v) => setActivity({ pickupTime: v })} />
          <Field label="Preparation time (chime)" type="time" value={p.activity.prepTime} onChange={(v) => setActivity({ prepTime: v })} />
          <Field label="Support worker" value={p.staffName} onChange={(v) => set({ staffName: v })} />
        </div>
      </div>

      <div className="card">
        <h3>Items, in order</h3>
        <p className="small muted">Alternatives are offered in order; only the first two are offered. PackPal never offers anything not listed here.</p>
        <ol className="items">
          {p.items.map((it, i) => (
            <li key={i}>
              <ItemRow item={it} onChange={(x) => setItem(i, x)} />
              <div className="row tight">
                <button className="btn icon" aria-label={`Move ${it.name} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button className="btn icon" aria-label={`Move ${it.name} down`} onClick={() => move(i, 1)} disabled={i === p.items.length - 1}>
                  ↓
                </button>
                <button className="btn icon" aria-label={`Remove ${it.name}`} onClick={() => set({ items: p.items.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button className="btn" onClick={() => set({ items: [...p.items, { name: 'new item', alternatives: [] }] })}>
          Add item
        </button>
      </div>

      <div className="card">
        <h3>Rain item (added by rule when rain is forecast)</h3>
        <ItemRow item={p.rainItem} onChange={(x) => set({ rainItem: x })} />
      </div>

      <div className="card">
        <h3>Safety cases that alert staff</h3>
        <ul className="small">
          {p.safetyCases.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="small muted">Transport, keys and safety situations are always handed to staff. PackPal gives no advice on feelings, health or behaviour.</p>
      </div>

      {long.length > 0 && (
        <div className="card card-warn">
          <h3>Lines over 10 words</h3>
          <ul className="small">
            {long.map((l) => (
              <li key={l}>
                “{l}” ({wordCount(l)} words)
              </li>
            ))}
          </ul>
          <p className="small muted">Shorten item or alternative names to keep every line at 10 words or fewer.</p>
        </div>
      )}

      <button className="btn ghost" onClick={() => pp.restorePersona(p.id)}>
        Restore {p.userName}'s setup from config/{p.id}.json
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ItemRow({ item, onChange }: { item: Item; onChange: (i: Item) => void }) {
  // Edit alternatives as free text; parse into the ordered list on blur.
  const [draft, setDraft] = useState(item.alternatives.join(', '));
  const [prev, setPrev] = useState(item.alternatives);
  if (prev !== item.alternatives) {
    setPrev(item.alternatives);
    setDraft(item.alternatives.join(', '));
  }
  const commit = () =>
    onChange({
      ...item,
      alternatives: draft
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  return (
    <div className="item-row">
      <label>
        <span className="small">Item</span>
        <input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} />
      </label>
      <label>
        <span className="small">Alternatives, in order (comma separated)</span>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="none" />
      </label>
    </div>
  );
}
