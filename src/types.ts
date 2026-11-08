export const INTENTS = ['got_it', 'no', 'help', 'option_left', 'option_right', 'later', 'unknown'] as const;
export type Intent = (typeof INTENTS)[number];

export type StateName =
  | 'IDLE' // before the chime, or waiting after "later"
  | 'START'
  | 'ITEM'
  | 'CHOICE'
  | 'CONFIRM'
  | 'RECAP'
  | 'NIGHT_DONE' // packed, waiting for the morning
  | 'MORNING'
  | 'DOOR_EMPTY'
  | 'DOOR_KEYS'
  | 'DONE'
  | 'ALERT';

export interface Item {
  name: string;
  /** Staff-approved alternatives, in order. Only the first two are offered. */
  alternatives: string[];
}

export interface Persona {
  id: string;
  userName: string;
  staffName: string;
  activity: {
    name: string;
    day: string;
    time: string;
    pickupTime: string;
    prepTime: string;
  };
  items: Item[];
  rainItem: Item;
  safetyCases: string[];
}

export interface Mock {
  rain: boolean;
  planChange: boolean;
}

export type Mode = 'rules' | 'genai';

export interface Settings {
  mode: Mode;
  listenSeconds: number; // 5 to 15, default 8
  voiceRate: number;
  voiceVolume: number;
  captions: boolean;
  confidenceThreshold: number; // default 0.7
  autoListen: boolean;
}

export type InputType = 'button' | 'key' | 'speech' | 'typed' | 'timeout' | 'system' | 'test';

export type InterpretPath = 'button' | 'rules' | 'genai' | 'genai_error' | 'genai_low_confidence' | 'not_allowed';

export interface Interpretation {
  intent: Intent;
  confidence: number;
  path: InterpretPath;
  /** What the matcher or model returned before the allowed/threshold rules. */
  rawIntent?: Intent;
  error?: string;
  latencyMs?: number;
}

export interface Options {
  left?: string;
  right?: string;
}
