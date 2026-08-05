/** Application du thème et des préférences d'affichage. */

const STORAGE_KEY = 'skip.appearance';

/** Applique thème, accent, taille de texte et densité au document. */
export function applyAppearance(settings = {}) {
  const root = document.documentElement;

  let theme = settings.theme || 'light';
  if (theme === 'system') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  root.dataset.theme = theme;
  root.dataset.accent = settings.accent || 'skip';
  root.dataset.fontSize = settings.fontSize || 'medium';
  root.dataset.layout = settings.layout || 'default';

  // Couleur de la barre système sur mobile.
  const themeColor = getComputedStyle(root).getPropertyValue('--accent').trim() || '#5A4FE0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#201f1e' : themeColor);

  // Conservé localement pour éviter le flash au prochain chargement.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: settings.theme || 'light',
      accent: settings.accent || 'skip',
      fontSize: settings.fontSize || 'medium',
      layout: settings.layout || 'default',
    }));
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

/** Restaure l'apparence enregistrée avant même la connexion. */
export function restoreAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) applyAppearance(saved);
  } catch {
    /* rien à restaurer */
  }
}

/** Suit le thème du système quand l'utilisateur a choisi « système ». */
export function watchSystemTheme(getSettings) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const settings = getSettings();
    if (settings?.theme === 'system') applyAppearance(settings);
  });
}

/** Bascule rapide clair/sombre (Ctrl+Maj+D). */
export function toggleDarkMode(settings) {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  applyAppearance(settings);
  return settings.theme;
}
