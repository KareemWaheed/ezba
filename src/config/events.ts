/**
 * Rush event flavours. `weight` sets how often each is picked; `when` limits it to a real-world
 * time (the UI passes the device clock into the sim; the simulator uses a fixed clock).
 */
export interface Clock {
  /** 0 = Sunday ... 4 = Thursday ... 6 = Saturday. */
  weekday: number;
  hour: number;
  ramadan: boolean;
}

export interface RushKind {
  id: string;
  icon: string;
  /** Banner text (Egyptian Arabic). */
  title: string;
  weight: number;
  when?: (c: Clock) => boolean;
  /** 'cafe' rushes hit the café instead of the shop (only when the café is open). */
  target?: 'cafe';
}

export const RUSH_KINDS: readonly RushKind[] = [
  { id: 'bus', icon: '🚌', title: 'باص سياح جاي!', weight: 3 },
  { id: 'market', icon: '🧺', title: 'سوق الخميس!', weight: 6, when: (c) => c.weekday === 4 },
  { id: 'market-any', icon: '🧺', title: 'يوم السوق!', weight: 1 },
  { id: 'school', icon: '🎒', title: 'المدارس خرّجت!', weight: 2, when: (c) => c.hour >= 13 && c.hour <= 15 },
  { id: 'iftar', icon: '🌙', title: 'زحمة قبل الفطار!', weight: 8, when: (c) => c.ramadan && c.hour >= 16 && c.hour <= 19 },
  { id: 'breakfast', icon: '🍳', title: 'زحمة الفطار في الكافيه!', weight: 6, target: 'cafe', when: (c) => c.hour >= 6 && c.hour <= 11 },
  { id: 'cafe-crowd', icon: '☕', title: 'الكافيه اتملى!', weight: 2, target: 'cafe' },
];

/**
 * Approximate first/last day of Ramadan (Gregorian, local), enough for a seasonal event.
 * Add years as needed.
 */
const RAMADAN: readonly [string, string][] = [
  ['2026-02-18', '2026-03-19'],
  ['2027-02-08', '2027-03-09'],
  ['2028-01-28', '2028-02-26'],
  ['2029-01-16', '2029-02-14'],
];

export function clockFromDate(d: Date): Clock {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { weekday: d.getDay(), hour: d.getHours(), ramadan: RAMADAN.some(([a, b]) => iso >= a && iso <= b) };
}
