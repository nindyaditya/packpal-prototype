import { useState } from 'react';
import testset from '../../config/testset.json';
import { interpret } from '../intent/interpret';
import { downloadCSV, type LogEntry, statsByMode } from '../log/log';
import type { Intent, Mode, Options, StateName } from '../types';
import type { PackPal } from '../usePackPal';

interface Case {
  state: string;
  transcript: string;
  expected: Intent;
}
const SET = testset as unknown as { states: Record<string, { allowed: Intent[]; options: Options }>; cases: Case[] };

interface RunResult {
  mode: Mode;
  total: number;
  correct: number;
  failed: number; // returned unknown when a real intent was expected
  wrongAccepted: number; // returned a different real intent: worse than a repeat
  errors: number;
  misses: { c: Case; got: Intent; path: string }[];
}

export function LogPanel({ pp }: { pp: PackPal }) {
  const [filter, setFilter] = useState<'all' | 'live' | 'test'>('all');
  const [running, setRunning] = useState<Mode | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Partial<Record<Mode, RunResult>>>({});
  const stats = statsByMode(pp.log);
  const rows = pp.log.filter((e) => (filter === 'all' ? true : filter === 'test' ? e.inputType === 'test' : e.inputType !== 'test'));

  async function runSet(mode: Mode) {
    setRunning(mode);
    setProgress(0);
    const session = `test-${mode}-${Date.now().toString(36)}`;
    const entries: LogEntry[] = [];
    const res: RunResult = { mode, total: 0, correct: 0, failed: 0, wrongAccepted: 0, errors: 0, misses: [] };
    // Small batches keep the GenAI run quick without flooding the server.
    const BATCH = mode === 'genai' ? 4 : 50;
    for (let i = 0; i < SET.cases.length; i += BATCH) {
      const chunk = SET.cases.slice(i, i + BATCH);
      const outs = await Promise.all(
        chunk.map((c) => {
          const st = SET.states[c.state];
          return interpret({ transcript: c.transcript, state: c.state, options: st.options, allowed: st.allowed, mode, threshold: pp.settings.confidenceThreshold }).then((o) => ({ c, o }));
        }),
      );
      for (const { c, o } of outs) {
        res.total++;
        if (o.intent === c.expected) res.correct++;
        else if (o.intent === 'unknown') res.failed++;
        else res.wrongAccepted++;
        if (o.path === 'genai_error') res.errors++;
        if (o.intent !== c.expected) res.misses.push({ c, got: o.intent, path: o.path });
        entries.push({
          id: pp.nextId(),
          time: new Date().toISOString(),
          session,
          persona: 'testset',
          mode,
          state: c.state as StateName,
          prompt: '[scripted test]',
          reply: c.transcript,
          inputType: 'test',
          intent: o.intent,
          rawIntent: o.rawIntent ?? o.intent,
          confidence: +o.confidence.toFixed(2),
          path: o.path,
          result: o.intent === c.expected ? 'correct' : o.intent === 'unknown' ? 'failed' : 'wrong_accepted',
          nextState: c.state as StateName,
          said: '',
          failed: o.intent === 'unknown' && c.expected !== 'unknown',
          latencyMs: o.latencyMs ?? '',
          error: o.error ?? '',
          expected: c.expected,
        });
      }
      setProgress(Math.min(SET.cases.length, i + BATCH));
    }
    pp.appendLog(entries);
    setResults((r) => ({ ...r, [mode]: res }));
    setRunning(null);
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>Mode comparison</h3>
        <table className="table compact">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Rules-only</th>
              <th>GenAI</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Live sessions', 'sessions'],
                ['Live exchanges', 'exchanges'],
                ['Failed exchanges', 'failed'],
                ['Button fallback reached', 'buttonFallback'],
                ['Staff alerts', 'alerts'],
                ['Turns per packed item', 'turnsPerItem'],
                ['Test set: replies run', 'testTotal'],
                ['Test set: failed (unknown)', 'testFailed'],
                ['Test set: wrong intents accepted', 'wrongAccepted'],
              ] as const
            ).map(([label, k]) => (
              <tr key={k}>
                <td>{label}</td>
                <td>{stats.rules[k]}</td>
                <td>{stats.genai[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Live rows count real turns (buttons, keys, speech, typed); test-set rows are counted apart. A wrong “got it” is worse than a repeat, so wrong intents are reported on their own.</p>
      </div>

      <div className="card">
        <h3>Scripted test set</h3>
        <p className="small muted">
          {SET.cases.length} short replies across {Object.keys(SET.states).length} states, including off-script ones, from <code>config/testset.json</code>. Runs through the interpreter only (no speech) and logs every result.
        </p>
        <div className="row wrap">
          <button className="btn" disabled={!!running} onClick={() => void runSet('rules')}>
            Run in rules-only mode
          </button>
          <button className="btn primary" disabled={!!running || pp.genaiAvailable === false} onClick={() => void runSet('genai')}>
            Run in GenAI mode
          </button>
          {running && (
            <span className="small">
              Running {running}: {progress}/{SET.cases.length}
            </span>
          )}
        </div>
        {pp.genaiAvailable === false && <p className="small warn">GenAI mode needs ANTHROPIC_API_KEY in .env on the server. See README.</p>}
        {(['rules', 'genai'] as Mode[]).map((m) => {
          const r = results[m];
          if (!r) return null;
          return (
            <details key={m} className="result">
              <summary>
                <strong>{m === 'rules' ? 'Rules-only' : 'GenAI'}</strong>: {r.correct}/{r.total} correct · {r.failed} failed (unknown) · {r.wrongAccepted} wrong accepted
                {r.errors ? ` · ${r.errors} errors` : ''}
              </summary>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Reply</th>
                    <th>Expected</th>
                    <th>Got</th>
                  </tr>
                </thead>
                <tbody>
                  {r.misses.map(({ c, got, path }, i) => (
                    <tr key={i} className={got === 'unknown' ? '' : 'bad'}>
                      <td>{c.state}</td>
                      <td>“{c.transcript}”</td>
                      <td>{c.expected}</td>
                      <td>
                        {got} <span className="muted small">{path}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>

      <div className="card">
        <div className="row spread">
          <h3>Event log ({pp.log.length})</h3>
          <div className="row tight">
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter log">
              <option value="all">All turns</option>
              <option value="live">Live only</option>
              <option value="test">Test set only</option>
            </select>
            <button className="btn" onClick={() => downloadCSV(rows)} disabled={!rows.length}>
              Export CSV
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm('Clear the log, alerts and summaries stored in this browser?')) pp.clearAll();
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table compact log">
            <thead>
              <tr>
                <th>Time</th>
                <th>Mode</th>
                <th>State</th>
                <th>Prompt</th>
                <th>Reply</th>
                <th>Input</th>
                <th>Intent</th>
                <th>Conf.</th>
                <th>Path</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(-200)
                .reverse()
                .map((e) => (
                  <tr key={e.id} className={e.failed ? 'failed' : ''}>
                    <td>{new Date(e.time).toLocaleTimeString()}</td>
                    <td>{e.mode}</td>
                    <td>{e.state}</td>
                    <td>{e.prompt}</td>
                    <td>{e.reply}</td>
                    <td>{e.inputType}</td>
                    <td>{e.intent}</td>
                    <td>{e.confidence}</td>
                    <td>{e.path}</td>
                    <td>
                      {e.result} → {e.nextState}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Stored only in this browser. No audio is stored, only transcripts. Showing the latest 200 rows; the CSV has all of them.</p>
      </div>
    </div>
  );
}
