// Every line PackPal says lives here, so wording stays fixed and easy to review.
// Rule: 10 words or fewer, plain words, same wording every time.

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const prompts = {
  start: (activity: string) => `Tomorrow is ${activity}. Let's get ready. Now or later?`,
  later: () => `Okay. I'll ask again in 30 minutes.`,
  item: (item: string) => `Find your ${item}. Got it?`,
  rainItem: (item: string) => `Rain tomorrow. Find your ${item}. Got it?`,
  choiceTwo: (item: string, left: string, right: string, staff: string) =>
    `No ${item}? ${cap(left)} or ${right}? Or ask ${staff}.`,
  choiceOne: (item: string, left: string, staff: string) => `No ${item}? Take ${left}? Or ask ${staff}.`,
  confirm: (choice: string) => `${cap(choice)}. Okay?`,
  recap: (items: string[]) => `${cap(items.join(', '))}. All ready.`,
  goodnight: () => `Good night. See you in the morning.`,
  morningPlan: (staff: string) => `Plan changed today. ${staff} will tell you more.`,
  morningRainOn: () => `Rain today. Let's add one thing.`,
  morningRainOff: () => `No rain today. Same plan.`,
  morningRainItem: (item: string) => `Find your ${item}. Got it?`,
  doorEmpty: () => `Is the ready spot empty?`,
  doorEmptyNo: () => `Put everything in your bag. Then press got it.`,
  doorKeys: () => `Do you have your keys?`,
  done: (activity: string) => `Have fun at ${activity}.`,
  alert: (staff: string) => `I'll get ${staff}.`,
  pressButton: () => `Press a button.`,
};

export const wordCount = (line: string) => line.trim().split(/\s+/).filter(Boolean).length;
