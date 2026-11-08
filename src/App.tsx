import { useEffect, useState } from 'react';
import { StaffScreen } from './screens/StaffScreen';
import { UserScreen } from './screens/UserScreen';
import { speechSupport } from './speech/speech';
import { usePackPal } from './usePackPal';

type View = 'split' | 'user' | 'staff';

export function App() {
  const pp = usePackPal();
  const [view, setView] = useState<View>(() => (window.innerWidth >= 1100 ? 'split' : 'user'));
  const openAlerts = pp.alerts.filter((a) => !a.resolved).length;

  useEffect(() => {
    document.title = `PackPal · ${pp.persona.userName}`;
  }, [pp.persona.userName]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ◐
          </span>
          <div>
            <h1>PackPal</h1>
            <p className="muted small">Prototype · fake persona data only</p>
          </div>
        </div>

        <div className="controls">
          <label className="inline">
            <span className="small">Persona</span>
            <select value={pp.personaId} onChange={(e) => pp.switchPersona(e.target.value)}>
              {Object.values(pp.personas).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.userName}: {p.activity.name}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented" role="radiogroup" aria-label="Interpreter mode">
            <button role="radio" aria-checked={pp.settings.mode === 'rules'} className={pp.settings.mode === 'rules' ? 'on' : ''} onClick={() => pp.setSettings({ ...pp.settings, mode: 'rules' })}>
              Rules-only
            </button>
            <button role="radio" aria-checked={pp.settings.mode === 'genai'} className={pp.settings.mode === 'genai' ? 'on' : ''} onClick={() => pp.setSettings({ ...pp.settings, mode: 'genai' })}>
              GenAI interpreter
            </button>
          </div>

          <div className="segmented" role="radiogroup" aria-label="Screen">
            {(['split', 'user', 'staff'] as View[]).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {v === 'split' ? 'Both' : v === 'user' ? 'User' : `Staff${openAlerts ? ` (${openAlerts})` : ''}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {pp.settings.mode === 'genai' && pp.genaiAvailable === false && (
        <p className="banner">
          GenAI mode is on but the server has no ANTHROPIC_API_KEY, so every spoken or typed reply counts as unknown. Buttons still work. Add the key to <code>.env</code> and restart.
        </p>
      )}
      {!speechSupport.tts && <p className="banner">This browser has no speech output. Captions still show every line.</p>}

      <main className={`layout layout-${view}`}>
        {view !== 'staff' && <UserScreen pp={pp} />}
        {view !== 'user' && <StaffScreen pp={pp} />}
      </main>
    </div>
  );
}
