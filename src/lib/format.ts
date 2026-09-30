/**
 * Arsenal Tools — formatage (miroir des helpers du front vanilla)
 */

const numberFmt = new Intl.NumberFormat("fr-FR");

/** 1104 → "1 104" */
export function fmt(n: number): string {
  return numberFmt.format(n);
}

/** Timestamp ms → "il y a 3 j", "à l'instant", … */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an(s)`;
}

/** Date → "YYYY-MM-DD" (clé du graphique analytics) */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Label du jour abrégé fr à partir d'une clé "YYYY-MM-DD" */
export function weekdayLabel(key: string): string {
  const d = new Date(key + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
}
