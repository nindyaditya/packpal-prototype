import { useEffect, useState } from 'react';
import { speechSupport } from '../speech/speech';
import type { Intent } from '../types';
import type { PackPal } from '../usePackPal';

interface ButtonDef {
  intent: Intent;
  label: string;
  className: string;
  keys: string;
}

const STATE_LABEL: Record<string, string> = {
  IDLE: 'Waiting',
  START: 'Getting ready',
  ITEM: 'Packing',
  CHOICE: 'Choosing',
  CONFIRM: 'Checking choice',
  RECAP: 'All packed',
  NIGHT_DONE: 'Packed for tomorrow',
  MORNING: 'Morning',
  DOOR_EMPTY: 'Door check',
  DOOR_KEYS: 'Door check',
  DONE: 'Off you go',
  ALERT: 'Staff called',
};

export function UserScreen({ pp }: { pp: PackPal }) {
  const { ctx, allowed, settings, status, caption, persona } = pp;
  const [typed, setTyped] = useState('');
  const choiceActive = ctx.state === 'CHOICE';

  const buttons: ButtonDef[] = [
    { intent: 'got_it', label: 'Got it', className: 'btn-got', keys: 'G or 1' },
    { intent: 'no', label: 'No', className: 'btn-no', keys: 'N or 2' },
    { intent: 'help', label: 'Help', className: 'btn-help', keys: 'H or 3' },
  ];

  // F13: keyboard shortcuts for all five buttons (and switch access).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Intent> = {
        g: 'got_it', '1': 'got_it',
        n: 'no', '2': 'no',
        h: 'help', '3': 'help',
        arrowleft: 'option_left', l: 'option_left', '4': 'option_left',
        arrowright: 'option_right', r: 'option_right', '5': 'option_right',
      };
      const intent = map[e.key.toLowerCase()];
      if (!intent) return;
      if (!pp.allowed.includes(intent)) return;
      e.preventDefault();
      pp.press(intent, 'key');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pp, choiceActive]);

  const canReply = allowed.length > 0;
  // A button works only when the current state accepts it; help always does.
  const enabled = (i: Intent) => canReply && allowed.includes(i);

  return (
    <section className="panel user-panel" aria-labelledby="user-title">
      <header className="panel-head">
        <div>
          <h2 id="user-title">Ready spot</h2>
          <p className="muted">What {persona.userName} sees and hears by the door</p>
        </div>
        <span className={`status status-${status}`} aria-live="polite">
          {status === 'speaking' ? 'Speaking' : status === 'listening' ? `Listening (${settings.listenSeconds}s)` : status === 'thinking' ? 'Thinking' : STATE_LABEL[ctx.state]}
        </span>
      </header>

      <div className={`device ${ctx.state === 'ALERT' ? 'device-alert' : ''}`}>
        <div className="speaker" aria-hidden="true">
          <span className={`pulse ${status === 'speaking' ? 'on' : ''} ${status === 'listening' ? 'listen' : ''}`} />
        </div>
        <div className="caption" aria-live="assertive" role="status">
          {settings.captions ? caption || <span className="muted">PackPal is quiet.</span> : <span className="muted">Captions off (audio-only test)</span>}
        </div>

        <div className="tray" aria-label="Packed on the ready spot">
          {ctx.packed.length === 0 ? (
            <span className="muted small">Nothing on the ready spot yet</span>
          ) : (
            ctx.packed.map((p, i) => (
              <span className="chip" key={`${p}-${i}`}>
                {p}
              </span>
            ))
          )}
        </div>

        <div className="buttons">
          <div className="buttons-main">
            {buttons.map((b) => (
              <button key={b.intent} className={`big-btn ${b.className}`} disabled={!enabled(b.intent)} onClick={() => pp.press(b.intent)} aria-keyshortcuts={b.keys}>
                <span className="big-label">{b.label}</span>
                <span className="key-hint">{b.keys}</span>
              </button>
            ))}
          </div>
          <div className="buttons-choice">
            <button
              className={`big-btn btn-left ${choiceActive && enabled('option_left') ? 'lit' : ''}`}
              disabled={!enabled('option_left')}
              onClick={() => pp.press('option_left')}
              aria-label={`Left circle${choiceActive && ctx.options.left ? `: ${ctx.options.left}` : ''}`}
            >
              <span className="shape circle" aria-hidden="true" />
              <span className="big-label">{choiceActive && ctx.options.left ? ctx.options.left : 'Left'}</span>
              <span className="key-hint">← or 4</span>
            </button>
            <button
              className={`big-btn btn-right ${choiceActive && enabled('option_right') ? 'lit' : ''}`}
              disabled={!enabled('option_right')}
              onClick={() => pp.press('option_right')}
              aria-label={`Right square${choiceActive && ctx.options.right ? `: ${ctx.options.right}` : ''}`}
            >
              <span className="shape square" aria-hidden="true" />
              <span className="big-label">{choiceActive && ctx.options.right ? ctx.options.right : 'Right'}</span>
              <span className="key-hint">→ or 5</span>
            </button>
          </div>
        </div>
      </div>

      <div className="user-controls">
        <form
          className="typed"
          onSubmit={(e) => {
            e.preventDefault();
            if (!typed.trim()) return;
            void pp.replyText(typed.trim(), 'typed');
            setTyped('');
          }}
        >
          <label htmlFor="typed-reply" className="small">
            Typed reply (testing stand-in for speech)
          </label>
          <div className="row">
            <input id="typed-reply" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder='e.g. "the coat one"' disabled={!canReply} autoComplete="off" />
            <button type="submit" className="btn" disabled={!canReply || !typed.trim()}>
              Say it
            </button>
          </div>
          {pp.lastHeard && <p className="small muted">Last heard: “{pp.lastHeard}”</p>}
        </form>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoListen}
            disabled={!speechSupport.stt}
            onChange={(e) => pp.setSettings({ ...settings, autoListen: e.target.checked })}
          />
          <span>
            Listen with the microphone after each prompt
            {!speechSupport.stt && <span className="muted"> (not supported in this browser, use Chrome or Edge)</span>}
          </span>
        </label>

        <label className="toggle owner">
          <input type="checkbox" checked={pp.summariesOn} onChange={(e) => pp.setSummariesOn(e.target.checked)} />
          <span>
            <strong>Send my summary to {persona.staffName}</strong>
            <span className="muted small"> Your choice. Off unless you turn it on.</span>
          </span>
        </label>
      </div>
    </section>
  );
}
