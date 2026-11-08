import { useEffect, useState } from 'react';
import { speechSupport } from '../speech/speech';
import type { Intent } from '../types';
import type { PackPal } from '../usePackPal';

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'the browser blocked the microphone (allow it in the address bar, then reload)',
  'service-not-allowed': 'speech recognition is turned off in this browser',
  'audio-capture': 'no microphone was found',
  network: 'the browser could not reach its speech service (check your connection)',
  start_failed: 'listening could not start',
  restart_failed: 'listening stopped unexpectedly',
};

const STATE_LABEL: Record<string, string> = {
  IDLE: 'Waiting',
  START: 'Getting ready',
  ITEM: 'Packing',
  CHOICE: 'Choosing',
  CONFIRM: 'Checking choice',
  RECAP: 'All packed',
  NIGHT_DONE: 'Packed for tomorrow',
  MORNING: 'Morning news',
  DOOR_EMPTY: 'Door check',
  DOOR_KEYS: 'Door check',
  DONE: 'Off you go',
  ALERT: 'Staff called',
};

export function UserScreen({ pp }: { pp: PackPal }) {
  const { ctx, allowed, settings, status, caption, persona, mock } = pp;
  const [typed, setTyped] = useState('');
  const choiceActive = ctx.state === 'CHOICE';
  const canReply = allowed.length > 0;
  // A button works only when the current state accepts it; help always does.
  const enabled = (i: Intent) => canReply && allowed.includes(i);

  const morning = ctx.phase === 'morning' || ['MORNING', 'DOOR_EMPTY', 'DOOR_KEYS', 'DONE'].includes(ctx.state);
  const raining = morning && mock.rain;
  const ring =
    ctx.state === 'ALERT'
      ? 'alert'
      : status === 'speaking'
        ? 'speaking'
        : status === 'listening'
          ? 'listening'
          : status === 'thinking'
            ? 'thinking'
            : ctx.state === 'DONE'
              ? 'done'
              : 'idle';

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
  }, [pp]);

  const statusText =
    status === 'speaking' ? 'Speaking' : status === 'listening' ? `Listening · ${settings.listenSeconds}s` : status === 'thinking' ? 'Thinking' : STATE_LABEL[ctx.state];

  return (
    <section className="panel user-panel" aria-labelledby="user-title">
      <header className="panel-head">
        <div>
          <h2 id="user-title">{persona.userName}'s PackPal</h2>
          <p className="muted small">By the front door · what {persona.userName} hears and presses</p>
        </div>
      </header>

      <div className={`scene ${morning ? 'scene-morning' : 'scene-evening'} ${raining ? 'scene-rainy' : ''} ${ctx.state === 'ALERT' ? 'scene-alert' : ''}`}>
        {raining && <div className="rain" aria-hidden="true" />}
        {!morning && <div className="stars" aria-hidden="true" />}
        <div className={`sky-body ${morning ? 'sun' : 'moon'}`} aria-hidden="true" />

        <div className="scene-top">
          <span className="scene-time">{morning ? `${persona.activity.day} morning` : `Evening before ${persona.activity.day}`}</span>
          {!morning && mock.rain && <span className="scene-chip">🌧️ Rain tomorrow</span>}
          {raining && <span className="scene-chip">🌧️ Raining</span>}
          <span className={`scene-status ring-${ring}`} aria-live="polite">
            <span className="dot" aria-hidden="true" />
            {statusText}
          </span>
        </div>

        <div key={caption} className={`bubble ${caption && settings.captions ? '' : 'bubble-quiet'}`} aria-live="assertive" role="status">
          {settings.captions ? caption || 'PackPal is quiet.' : '🔈 Captions off (audio-only test)'}
        </div>

        <div className={`speaker ring-${ring}`} aria-hidden="true">
          <div className="speaker-ring" />
          <div className="speaker-grille" />
        </div>

        {ctx.state === 'DONE' && <div className="confetti" aria-hidden="true" />}
      </div>

      <div className="console" aria-label="PackPal buttons">
        <div className="console-row three">
          <PhysButton intent="got_it" label="Got it" keys="G · 1" cls="pb-got" enabled={enabled('got_it')} onPress={pp.press} />
          <PhysButton intent="no" label="No" keys="N · 2" cls="pb-no" enabled={enabled('no')} onPress={pp.press} />
          <PhysButton intent="help" label="Help" keys="H · 3" cls="pb-help" enabled={enabled('help')} onPress={pp.press} />
        </div>
        <div className="console-row two">
          <PhysButton
            intent="option_left"
            label="Left"
            keys="← · 4"
            cls={`pb-side ${choiceActive && enabled('option_left') ? 'lit' : ''}`}
            enabled={enabled('option_left')}
            onPress={pp.press}
            shape="circle"
            aria="Left circle"
          />
          <PhysButton
            intent="option_right"
            label="Right"
            keys="→ · 5"
            cls={`pb-side ${choiceActive && enabled('option_right') ? 'lit' : ''}`}
            enabled={enabled('option_right')}
            onPress={pp.press}
            shape="square"
            aria="Right square"
          />
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
          {pp.status === 'listening' ? (
            <p className="small heard" aria-live="polite">
              🎙️ Hearing: {pp.lastHeard ? `“${pp.lastHeard}”` : <span className="muted">nothing yet, speak after PackPal finishes</span>}
            </p>
          ) : (
            pp.lastHeard && <p className="small muted">Last heard: “{pp.lastHeard}”</p>
          )}
          {pp.micError && (
            <p className="small warn" role="alert">
              Microphone problem: {MIC_ERRORS[pp.micError] ?? pp.micError}. Buttons still work.{' '}
              <button type="button" className="linklike" onClick={pp.clearMicError}>
                Dismiss
              </button>
            </p>
          )}
        </form>

        <label className="toggle">
          <input type="checkbox" checked={settings.autoListen} disabled={!speechSupport.stt} onChange={(e) => pp.setSettings({ ...settings, autoListen: e.target.checked })} />
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

function PhysButton({
  intent,
  label,
  keys,
  cls,
  enabled,
  onPress,
  shape,
  aria,
}: {
  intent: Intent;
  label: string;
  keys: string;
  cls: string;
  enabled: boolean;
  onPress: (i: Intent, inputType?: 'button') => void;
  shape?: 'circle' | 'square';
  aria?: string;
}) {
  return (
    <button className={`pb ${cls}`} disabled={!enabled} onClick={() => onPress(intent)} aria-label={aria} aria-keyshortcuts={keys.replace(/ · /g, ' ')}>
      {shape && <span className={`pb-shape ${shape}`} aria-hidden="true" />}
      <span className="pb-label">{label}</span>
      <span className="pb-keys" aria-hidden="true">
        {keys}
      </span>
    </button>
  );
}
