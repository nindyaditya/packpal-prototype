// Friendly icons for item names. Purely visual; PackPal's words never use them.
const ICONS: [RegExp, string][] = [
  [/umbrella/, '☂️'],
  [/rain ?coat|coat|jacket/, '🧥'],
  [/hood|jumper|sweat/, '🧶'],
  [/rain hat|hat|cap/, '🧢'],
  [/towel/, '🏖️'],
  [/swim|costume/, '🩱'],
  [/goggle/, '🥽'],
  [/apron/, '🥼'],
  [/lunch box|lunch|sandwich/, '🥪'],
  [/money|cash|purse|wallet/, '👛'],
  [/pass|ticket|card/, '🎫'],
  [/key/, '🔑'],
  [/phone/, '📱'],
  [/water|bottle/, '🧴'],
  [/bag/, '🎒'],
];

export function itemIcon(name: string): string {
  const n = name.toLowerCase();
  return ICONS.find(([re]) => re.test(n))?.[1] ?? '📦';
}
