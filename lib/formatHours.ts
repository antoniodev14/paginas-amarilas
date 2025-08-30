import { DAYS } from './hours';

export function formatRange(r:{start:string; end:string}) {
  return `${r.start}–${r.end}`;
}

export function todayKey(date = new Date()): string {
  const dow = date.getDay(); // 0=Domingo
  return ['sun','mon','tue','wed','thu','fri','sat'][dow];
}

export function formatToday(opening: any) {
  const k = todayKey();
  const arr = Array.isArray(opening?.[k]) ? opening[k] as {start:string; end:string}[] : [];
  if (!arr.length) return 'Cerrado hoy';
  return `Hoy: ${arr.map(formatRange).join(', ')}`;
}

export function formatWeek(opening: any) {
  return DAYS.map(d => {
    const arr = Array.isArray(opening?.[d.key]) ? opening[d.key] as {start:string; end:string}[] : [];
    return `${d.label}: ${arr.length ? arr.map(formatRange).join(', ') : 'Cerrado'}`;
  });
}
