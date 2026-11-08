// Demo controls: things that happen in the world (weather, plans, time
// passing), not things staff or the user do. Kept apart from both screens.
// Settings (switches) and actions (buttons) are styled differently on purpose.

import type { PackPal } from '../usePackPal';

export function DemoBar({ pp }: { pp: PackPal }) {
  const { mock, setMock, ctx, persona } = pp;
  const canChime = ['IDLE', 'NIGHT_DONE', 'DONE'].includes(ctx.state);
  const reminder = ctx.reminderAt && ctx.state === 'IDLE' ? new Date(ctx.reminderAt).toTimeString().slice(0, 5) : null;

  return (
    <section className="demobar" aria-label="Demo controls">
      <div className="demobar-title">
        <span className="demobar-tag">Demo controls</span>
        <span className="small muted">Simulates the world around {persona.userName}</span>
      </div>

      <div className="demobar-section">
        <span className="demobar-label">Conditions</span>
        <div className="demobar-group" role="group" aria-label="Conditions">
          <Switch on={mock.rain} onChange={(rain) => setMock({ ...mock, rain })} icon="🌧️" label="Rain forecast" />
          <Switch on={mock.planChange} onChange={(planChange) => setMock({ ...mock, planChange })} icon="🚐" label="Plan change" />
        </div>
      </div>

      <div className="demobar-divider" aria-hidden="true" />

      <div className="demobar-section">
        <span className="demobar-label">Jump in time</span>
        <div className="demobar-group" role="group" aria-label="Jump in time">
          <button className="cta cta-evening" onClick={() => pp.send({ type: 'CHIME' })} disabled={!canChime}>
            <span className="cta-icon" aria-hidden="true">🌙</span>
            <span className="cta-text">
              Evening chime
              <span className="cta-sub">Starts packing · {persona.activity.prepTime}</span>
            </span>
            <span className="cta-arrow" aria-hidden="true">▶</span>
          </button>
          <button className="cta cta-morning" onClick={() => pp.send({ type: 'SIMULATE_MORNING' })} disabled={ctx.state === 'ALERT'}>
            <span className="cta-icon" aria-hidden="true">☀️</span>
            <span className="cta-text">
              Next morning
              <span className="cta-sub">Starts the door check</span>
            </span>
            <span className="cta-arrow" aria-hidden="true">▶</span>
          </button>
          <button className="reset-link" onClick={pp.reset}>
            ↺ Reset
          </button>
        </div>
      </div>

      <div className="demobar-state small">
        <code>{ctx.state}</code>
        {ctx.night && (
          <span className="muted">
            {' '}
            · last night: rain {ctx.night.rain ? 'on' : 'off'}, plan change {ctx.night.planChange ? 'on' : 'off'}
          </span>
        )}
        {reminder && <span className="muted"> · reminder at {reminder} (press Evening chime to skip ahead)</span>}
      </div>
    </section>
  );
}

function Switch({ on, onChange, icon, label }: { on: boolean; onChange: (v: boolean) => void; icon: string; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
      <span className="switch-state" aria-hidden="true">
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}
