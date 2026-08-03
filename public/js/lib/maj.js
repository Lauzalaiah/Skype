/**
 * Bandeau de mise à jour de l'application de bureau.
 *
 * L'interface est la même partout : dans un navigateur, `window.skypeMaj`
 * n'existe pas et ce module ne fait rien — le service worker se charge déjà
 * de rafraîchir la version web. Le bandeau n'apparaît donc que dans
 * l'application installée, et seulement quand il y a réellement quelque chose
 * à annoncer.
 */
import { el } from './dom.js';
import { icon } from './icons.js';

const LIBELLES = {
  telechargement: (v) => `Téléchargement de la version ${v}…`,
  prete: (v) => `Skype ${v} est prêt à être installé.`,
  manuel: (v) => `Skype ${v} est disponible.`,
};

let bandeau = null;

function fermer() {
  if (!bandeau) return;
  bandeau.remove();
  bandeau = null;
}

/** Les versions écartées d'un geste ne reviennent pas à chaque rechargement. */
const ecartee = (version) => sessionStorage.getItem('maj-ecartee') === version;
const ecarter = (version) => sessionStorage.setItem('maj-ecartee', version || '');

function afficher(etat, pont) {
  const { phase, version } = etat || {};

  if (!LIBELLES[phase] || !version || ecartee(version)) return fermer();

  const texte = LIBELLES[phase](version);
  if (bandeau?.dataset.phase === phase && bandeau.dataset.version === version) return;
  fermer();

  const actions = [];

  if (phase === 'prete') {
    actions.push(el('button.maj__lien', {
      text: 'Nouveautés',
      onclick: () => pont.ouvrirNouveautes(),
    }));
    actions.push(el('button.maj__action', {
      text: 'Redémarrer maintenant',
      onclick: () => pont.installer(),
    }));
  }

  if (phase === 'manuel') {
    // macOS : l'application ne peut pas se remplacer elle-même sans
    // signature Apple. On envoie donc vers la page de téléchargement.
    actions.push(el('button.maj__action', {
      text: 'Télécharger',
      onclick: () => pont.ouvrirNouveautes(),
    }));
  }

  bandeau = el('div.maj', { role: 'status', 'data-phase': phase, 'data-version': version }, [
    el('span.maj__point'),
    el('span.maj__texte', { text: texte }),
    ...actions,
    phase === 'telechargement' ? null : el('button.maj__fermer', {
      'aria-label': 'Masquer',
      onclick: () => { ecarter(version); fermer(); },
    }, icon('close', 'icon icon--sm')),
  ]);

  document.body.append(bandeau);
}

export function surveillerMisesAJour() {
  const pont = globalThis.skypeMaj;
  if (!pont?.surEtat) return;   // version web : rien à surveiller ici
  pont.surEtat((etat) => afficher(etat, pont));
}
