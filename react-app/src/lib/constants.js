export const BUSINESS_START = '09:30';
export const BUSINESS_END = '18:00';
export const SLOT_MINUTES = 30;
export const MAX_DAILY_HOURS = 4;

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(m) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

export function buildSlots() {
  const slots = [];
  for (let m = timeToMinutes(BUSINESS_START); m < timeToMinutes(BUSINESS_END); m += SLOT_MINUTES) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export const SLOTS = buildSlots();

export function fmtDate(d) {
  if (typeof d === 'string') return d;
  return d.toISOString().slice(0, 10);
}

export function fmtDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTime12(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function currentYearMonth(dateStr) {
  return (dateStr || fmtDate(new Date())).slice(0, 7);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

export function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return fmtDate(d);
}

export function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return fmtDate(d);
}

export function fmtMonthYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function getMonthGridRange(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const diffStart = startDay === 0 ? -6 : 1 - startDay;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() + diffStart);
  const lastDay = new Date(year, month + 1, 0);
  const endDay = lastDay.getDay();
  const diffEnd = endDay === 0 ? 0 : 7 - endDay;
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + diffEnd);
  return { start: fmtDate(gridStart), end: fmtDate(gridEnd) };
}

export function businessDaysBetween(startStr, endStr) {
  let count = 0;
  let d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
