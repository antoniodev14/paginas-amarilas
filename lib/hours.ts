export const DAYS: { key: string; label: string }[] = [
  { key:'mon', label:'Lunes' }, { key:'tue', label:'Martes' }, { key:'wed', label:'Miércoles' },
  { key:'thu', label:'Jueves' }, { key:'fri', label:'Viernes' }, { key:'sat', label:'Sábado' },
  { key:'sun', label:'Domingo' },
];

export function isValidHHMM(s: string) {
  return /^\d{2}:\d{2}$/.test(s) && Number(s.slice(0,2)) < 24 && Number(s.slice(3,5)) < 60;
}
