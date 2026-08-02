/** Formatage des dates et heures, en français par défaut. */

let locale = 'fr-FR';
export const setLocale = (value) => {
  locale = value;
};

const fmt = (options) => new Intl.DateTimeFormat(locale, options);

export const timeOf = (ts) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
export const dateOf = (ts) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
export const dateTimeOf = (ts) => fmt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export const isToday = (ts) => daysBetween(ts, Date.now()) === 0;
export const isYesterday = (ts) => daysBetween(ts, Date.now()) === 1;
export const isSameDay = (a, b) => daysBetween(a, b) === 0;

/** Étiquette de séparateur de jour : « Aujourd'hui », « Hier », « lundi 3 mars ». */
export function dayLabel(ts) {
  const diff = daysBetween(ts, Date.now());
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff < 7) return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts));
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return fmt({ weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(new Date(ts));
}

/** Horodatage court pour la liste des conversations. */
export function shortTime(ts) {
  if (!ts) return '';
  const diff = daysBetween(ts, Date.now());
  if (diff === 0) return timeOf(ts);
  if (diff === 1) return 'Hier';
  if (diff < 7) return fmt({ weekday: 'short' }).format(new Date(ts)).replace('.', '');
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return sameYear
    ? fmt({ day: 'numeric', month: 'numeric' }).format(new Date(ts))
    : fmt({ day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(ts));
}

/** Durée relative : « à l'instant », « il y a 5 min », « il y a 3 j ». */
export function relative(ts) {
  if (!ts) return '';
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 45) return "à l'instant";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' });
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(-Math.round(seconds / size), unit);
  }
  return rtf.format(-seconds, 'second');
}

/** Texte de présence : « En ligne », « Vu il y a 5 min ». */
export function presenceLabel(status, lastSeen) {
  const labels = {
    online: 'En ligne',
    away: 'Absent',
    busy: 'Ne pas déranger',
    invisible: 'Invisible',
  };
  if (labels[status]) return labels[status];
  if (!lastSeen) return 'Hors ligne';
  const seconds = (Date.now() - lastSeen) / 1000;
  if (seconds < 90) return 'Vu à l’instant';
  if (seconds < 86400 * 7) return `Vu ${relative(lastSeen)}`;
  return `Vu le ${dateOf(lastSeen)}`;
}

/** Les messages du même auteur envoyés à moins de 5 min d'écart sont groupés. */
export const shouldGroup = (previous, message) =>
  !!previous &&
  previous.senderId === message.senderId &&
  previous.type !== 'system' &&
  message.type !== 'system' &&
  message.type !== 'call' &&
  previous.type !== 'call' &&
  message.createdAt - previous.createdAt < 5 * 60000 &&
  isSameDay(previous.createdAt, message.createdAt);
