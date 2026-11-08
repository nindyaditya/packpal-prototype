// Rules-only interpreter: a fixed phrase list. No server needed.

import type { Intent, Options } from '../types';

export const PHRASES: Record<Exclude<Intent, 'unknown' | 'option_left' | 'option_right'>, string[]> = {
  got_it: ['yes', 'yeah', 'yep', 'yup', 'got it', 'i got it', 'ok', 'okay', 'done', 'now', 'ready', 'sure', 'found it', 'have it', 'i have it', 'yes please', 'all right', 'alright'],
  no: ['no', 'nope', 'nah', 'no thanks', 'not got it', "don't have it", 'do not have it', "can't find it", 'cannot find it', 'missing', 'lost it', "it's not here", 'not here'],
  help: ['help', 'help me', 'rina', 'ask rina', 'get rina', 'marcus', 'ask marcus', 'staff'],
  later: ['later', 'not now', 'wait', 'in a bit', 'after'],
};

const LEFT_WORDS = ['left', 'circle', 'first', 'the first one'];
const RIGHT_WORDS = ['right', 'square', 'second', 'the second one'];

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when `phrase` appears in `text` as whole words. */
function containsPhrase(text: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  return ` ${text} `.includes(` ${p} `);
}

/**
 * Longest matching phrase wins ("not now" beats "now"). If two different
 * intents tie for longest, the reply is ambiguous and returns unknown.
 */
export function matchRules(transcript: string, options: Options = {}): Intent {
  const text = normalize(transcript);
  if (!text) return 'unknown';
  const table: [Intent, string[]][] = [
    ...(Object.entries(PHRASES) as [Intent, string[]][]),
    ['option_left', [...LEFT_WORDS, ...(options.left ? [options.left] : [])]],
    ['option_right', [...RIGHT_WORDS, ...(options.right ? [options.right] : [])]],
  ];
  let best: { intent: Intent; len: number } | null = null;
  let tie = false;
  for (const [intent, phrases] of table) {
    for (const phrase of phrases) {
      if (!containsPhrase(text, phrase)) continue;
      const len = normalize(phrase).length;
      if (!best || len > best.len) {
        best = { intent, len };
        tie = false;
      } else if (len === best.len && best.intent !== intent) {
        tie = true;
      }
    }
  }
  if (!best || tie) return 'unknown';
  return best.intent;
}
