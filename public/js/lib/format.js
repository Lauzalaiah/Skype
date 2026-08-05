/** Mise en forme des messages : émoticônes, Markdown léger, liens, mentions. */
import { escapeHtml } from './dom.js';

/* Émoticônes historiques, redessinées : « (y) », « :) », « (rofl) »… */
export const EMOTICONS = {
  ':)': '🙂', ':-)': '🙂', ':D': '😃', ':-D': '😃', ':d': '😃',
  ':(': '🙁', ':-(': '🙁', ';)': '😉', ';-)': '😉',
  ':P': '😛', ':-P': '😛', ':p': '😛', ':O': '😮', ':-O': '😮', ':o': '😮',
  ":'(": '😢', ':|': '😐', ':-|': '😐', ':^)': '🤔', '8)': '😎', 'B)': '😎',
  ':*': '😘', ':-*': '😘', 'xD': '😆', 'XD': '😆', '>:(': '😠', ':/': '😕', ':-/': '😕',
  '(y)': '👍', '(Y)': '👍', '(n)': '👎', '(N)': '👎',
  '(h)': '❤️', '(H)': '❤️', '(l)': '❤️', '(L)': '❤️', '(u)': '💔', '(U)': '💔',
  '(rofl)': '🤣', '(lol)': '😂', '(giggle)': '🤭', '(chuckle)': '😄',
  '(blush)': '😊', '(wondering)': '🤨', '(sleepy)': '😴', '(dull)': '😑',
  '(inlove)': '😍', '(cool)': '😎', '(mad)': '😠', '(angry)': '😡',
  '(puke)': '🤮', '(sick)': '🤢', '(angel)': '😇', '(devil)': '😈', '(devil2)': '👿',
  '(nerd)': '🤓', '(ninja)': '🥷', '(sweat)': '😅', '(speechless)': '😶',
  '(kiss)': '😘', '(yawn)': '🥱', '(worry)': '😟', '(facepalm)': '🤦',
  '(think)': '🤔', '(shock)': '😱', '(cry)': '😢', '(sad)': '😞', '(happy)': '😄',
  '(wink)': '😉', '(tongueout)': '😛', '(smirk)': '😏', '(mmm)': '😋',
  '(clap)': '👏', '(wave)': '👋', '(hi)': '👋', '(punch)': '👊', '(muscle)': '💪',
  '(pray)': '🙏', '(highfive)': '🙌', '(ok)': '👌', '(handshake)': '🤝', '(fingerscrossed)': '🤞',
  '(party)': '🎉', '(cake)': '🎂', '(gift)': '🎁', '(champagne)': '🍾',
  '(beer)': '🍺', '(drink)': '🍸', '(coffee)': '☕', '(pizza)': '🍕', '(burger)': '🍔',
  '(xmas)': '🎄', '(fireworks)': '🎆', '(balloon)': '🎈',
  '(*)': '⭐', '(sun)': '☀️', '(rain)': '🌧️', '(snow)': '❄️', '(moon)': '🌙',
  '(music)': '🎵', '(film)': '🎬', '(phone)': '📱', '(computer)': '💻',
  '(mail)': '✉️', '(clock)': '🕐', '(bomb)': '💣', '(idea)': '💡', '(rocket)': '🚀',
  '(car)': '🚗', '(plane)': '✈️', '(football)': '⚽', '(finger)': '🖕',
  '(cat)': '🐱', '(dog)': '🐶', '(monkey)': '🐵', '(bear)': '🐻', '(penguin)': '🐧',
  '(unicorn)': '🦄', '(poop)': '💩', '(fire)': '🔥', '(100)': '💯',
  '(brokenheart)': '💔', '(sparklingheart)': '💖', '(hug)': '🤗', '(rose)': '🌹',
  '(skip)': '💙', '(flag)': '🏳️', '(hearteyes)': '😍', '(zzz)': '💤',
};

const EMOTICON_PATTERN = new RegExp(
  Object.keys(EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
);

const URL_PATTERN = /\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"])|(\bwww\.[^\s<]+[^\s<.,;:!?)\]}'"])/gi;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const MENTION_PATTERN = /@([a-z][a-z0-9._-]{2,31})\b/gi;

/** Une chaîne composée uniquement d'émojis (max 3) s'affiche en grand. */
export function isJumboEmoji(text) {
  const stripped = String(text).replace(/\s/g, '');
  if (!stripped) return false;
  const graphemes = [...stripped];
  if (graphemes.length > 8) return false;
  const emojiOnly = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍)+$/u;
  return emojiOnly.test(stripped) && [...stripped.matchAll(/\p{Extended_Pictographic}/gu)].length <= 3;
}

/**
 * Convertit le texte d'un message en HTML sûr.
 * Ordre : échappement → blocs de code → mise en forme → liens → émoticônes.
 */
export function formatMessage(text, { mentions = [], currentUserName = '', emoticons = true } = {}) {
  let html = escapeHtml(text ?? '');

  // Les blocs de code sont mis de côté pour échapper au reste des règles.
  const vault = [];
  const stash = (content) => {
    vault.push(content);
    return `\u0000${vault.length - 1}\u0000`;
  };

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => stash(`<pre><code>${code.replace(/^\n/, '')}</code></pre>`));
  html = html.replace(/(?:^|(?<=\s))`([^`\n]+)`(?=\s|$|[.,!?;:)])/g, (_, code) => stash(`<code>${code}</code>`));
  html = html.replace(/\{code\}([\s\S]*?)\{\/code\}/g, (_, code) => stash(`<pre><code>${code}</code></pre>`));

  // Mise en forme façon Skip : *gras*, _italique_, ~barré~, !!monospace!!
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?;:)]|$)/g, '$1<strong>$2</strong>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,!?;:)]|$)/g, '$1<s>$2</s>');
  html = html.replace(/!!([^!\n]+)!!/g, '<code>$1</code>');
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

  // Liens
  html = html.replace(URL_PATTERN, (match) => {
    const href = match.startsWith('http') ? match : `https://${match}`;
    return stash(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${match}</a>`);
  });
  html = html.replace(EMAIL_PATTERN, (match) => stash(`<a href="mailto:${match}">${match}</a>`));

  // Mentions
  html = html.replace(MENTION_PATTERN, (match, name) => {
    const known = mentions.some((m) => m.pseudo === name.toLowerCase() || m.id === name);
    if (!known) return match;
    const isMe = name.toLowerCase() === String(currentUserName).toLowerCase();
    return stash(`<span class="mention${isMe ? ' mention--me' : ''}" data-mention="${name.toLowerCase()}">@${name}</span>`);
  });

  // Émoticônes
  if (emoticons) html = html.replace(EMOTICON_PATTERN, (match) => EMOTICONS[match] || match);

  // Réinsertion des morceaux protégés
  html = html.replace(/\u0000(\d+)\u0000/g, (_, index) => vault[Number(index)]);

  return html;
}

/** Version texte brut, pour les aperçus de la liste de conversations. */
/**
 * Libellé d'aperçu d'une pièce jointe, pour la liste des conversations comme
 * pour la citation d'un message. Défini ici une seule fois : la liste et le fil
 * calculaient auparavant ce texte chacun de leur côté, et un ajout dans l'un
 * ne se voyait pas dans l'autre.
 */
export function apercuPieceJointe(message) {
  const first = message?.attachments?.[0];
  if (!first) return '';
  if (first.mime?.startsWith('image/')) return '📷 Photo';
  if (first.mime?.startsWith('audio/')) return message.voicemail ? '📞 Messagerie vocale' : '🎤 Message vocal';
  if (first.mime?.startsWith('video/')) return '🎬 Vidéo';
  return `📎 ${first.name}`;
}

export function plainPreview(text, maxLength = 90) {
  let out = String(text ?? '')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  out = out.replace(EMOTICON_PATTERN, (m) => EMOTICONS[m] || m);
  return out.length > maxLength ? out.slice(0, maxLength - 1) + '…' : out;
}

export const emoticonize = (text) => String(text).replace(EMOTICON_PATTERN, (m) => EMOTICONS[m] || m);

/** Initiales pour les avatars sans photo. */
export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}

/** Couleur d'avatar déterministe, dérivée de l'identifiant. */
export function colorFor(seed) {
  const palette = ['#5A4FE0', '#7B68EE', '#FF6B6B', '#20C997', '#F59E0B', '#EC4899', '#0EA5E9', '#8B5CF6', '#14B8A6', '#F97316'];
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function formatBytes(bytes) {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Extrait les mentions « @pseudo » d'un texte. */
export const extractMentions = (text, members) =>
  [...String(text).matchAll(MENTION_PATTERN)]
    .map((match) => members.find((m) => m.pseudo === match[1].toLowerCase()))
    .filter(Boolean)
    .map((m) => m.id);

/** Première URL du texte, pour l'aperçu de lien. */
export function firstUrl(text) {
  const match = String(text).match(URL_PATTERN);
  if (!match) return null;
  const url = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
