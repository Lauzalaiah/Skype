/**
 * Indicatifs téléphoniques et tarifs à la minute.
 *
 * Ce module est importé par le navigateur ET par le serveur : il ne contient
 * que des données et des fonctions pures, aucune dépendance au DOM. Le tarif
 * d'un appel est donc calculé côté serveur à partir du numéro lui-même, et
 * non d'après ce que le client prétend.
 *
 * Les tarifs sont ceux d'une démonstration, exprimés en euros par minute.
 */

export const PAYS = [
  { code: 'FR', nom: 'France', indicatif: '33', tarif: 0.021 },
  { code: 'BE', nom: 'Belgique', indicatif: '32', tarif: 0.024 },
  { code: 'CH', nom: 'Suisse', indicatif: '41', tarif: 0.029 },
  { code: 'LU', nom: 'Luxembourg', indicatif: '352', tarif: 0.028 },
  { code: 'MC', nom: 'Monaco', indicatif: '377', tarif: 0.038 },
  { code: 'DE', nom: 'Allemagne', indicatif: '49', tarif: 0.023 },
  { code: 'ES', nom: 'Espagne', indicatif: '34', tarif: 0.023 },
  { code: 'IT', nom: 'Italie', indicatif: '39', tarif: 0.022 },
  { code: 'PT', nom: 'Portugal', indicatif: '351', tarif: 0.025 },
  { code: 'GB', nom: 'Royaume-Uni', indicatif: '44', tarif: 0.024 },
  { code: 'IE', nom: 'Irlande', indicatif: '353', tarif: 0.026 },
  { code: 'NL', nom: 'Pays-Bas', indicatif: '31', tarif: 0.024 },
  { code: 'AT', nom: 'Autriche', indicatif: '43', tarif: 0.027 },
  { code: 'DK', nom: 'Danemark', indicatif: '45', tarif: 0.025 },
  { code: 'SE', nom: 'Suède', indicatif: '46', tarif: 0.025 },
  { code: 'NO', nom: 'Norvège', indicatif: '47', tarif: 0.028 },
  { code: 'FI', nom: 'Finlande', indicatif: '358', tarif: 0.029 },
  { code: 'IS', nom: 'Islande', indicatif: '354', tarif: 0.036 },
  { code: 'PL', nom: 'Pologne', indicatif: '48', tarif: 0.026 },
  { code: 'CZ', nom: 'Tchéquie', indicatif: '420', tarif: 0.027 },
  { code: 'SK', nom: 'Slovaquie', indicatif: '421', tarif: 0.031 },
  { code: 'HU', nom: 'Hongrie', indicatif: '36', tarif: 0.029 },
  { code: 'RO', nom: 'Roumanie', indicatif: '40', tarif: 0.028 },
  { code: 'BG', nom: 'Bulgarie', indicatif: '359', tarif: 0.030 },
  { code: 'GR', nom: 'Grèce', indicatif: '30', tarif: 0.028 },
  { code: 'HR', nom: 'Croatie', indicatif: '385', tarif: 0.032 },
  { code: 'SI', nom: 'Slovénie', indicatif: '386', tarif: 0.033 },
  { code: 'RS', nom: 'Serbie', indicatif: '381', tarif: 0.045 },
  { code: 'UA', nom: 'Ukraine', indicatif: '380', tarif: 0.048 },
  { code: 'RU', nom: 'Russie', indicatif: '7', tarif: 0.052 },
  { code: 'TR', nom: 'Turquie', indicatif: '90', tarif: 0.042 },

  { code: 'US', nom: 'États-Unis', indicatif: '1', tarif: 0.019 },
  { code: 'CA', nom: 'Canada', indicatif: '1', tarif: 0.019 },
  { code: 'MX', nom: 'Mexique', indicatif: '52', tarif: 0.034 },
  { code: 'BR', nom: 'Brésil', indicatif: '55', tarif: 0.038 },
  { code: 'AR', nom: 'Argentine', indicatif: '54', tarif: 0.041 },
  { code: 'CL', nom: 'Chili', indicatif: '56', tarif: 0.039 },
  { code: 'CO', nom: 'Colombie', indicatif: '57', tarif: 0.043 },
  { code: 'PE', nom: 'Pérou', indicatif: '51', tarif: 0.046 },
  { code: 'VE', nom: 'Venezuela', indicatif: '58', tarif: 0.055 },
  { code: 'UY', nom: 'Uruguay', indicatif: '598', tarif: 0.052 },
  { code: 'HT', nom: 'Haïti', indicatif: '509', tarif: 0.088 },

  { code: 'MA', nom: 'Maroc', indicatif: '212', tarif: 0.089 },
  { code: 'DZ', nom: 'Algérie', indicatif: '213', tarif: 0.092 },
  { code: 'TN', nom: 'Tunisie', indicatif: '216', tarif: 0.095 },
  { code: 'EG', nom: 'Égypte', indicatif: '20', tarif: 0.078 },
  { code: 'SN', nom: 'Sénégal', indicatif: '221', tarif: 0.110 },
  { code: 'CI', nom: 'Côte d’Ivoire', indicatif: '225', tarif: 0.115 },
  { code: 'CM', nom: 'Cameroun', indicatif: '237', tarif: 0.118 },
  { code: 'ML', nom: 'Mali', indicatif: '223', tarif: 0.122 },
  { code: 'CD', nom: 'Congo (RDC)', indicatif: '243', tarif: 0.125 },
  { code: 'NG', nom: 'Nigéria', indicatif: '234', tarif: 0.086 },
  { code: 'GH', nom: 'Ghana', indicatif: '233', tarif: 0.094 },
  { code: 'KE', nom: 'Kenya', indicatif: '254', tarif: 0.082 },
  { code: 'ZA', nom: 'Afrique du Sud', indicatif: '27', tarif: 0.058 },
  { code: 'MG', nom: 'Madagascar', indicatif: '261', tarif: 0.130 },
  { code: 'MU', nom: 'Maurice', indicatif: '230', tarif: 0.075 },

  { code: 'IL', nom: 'Israël', indicatif: '972', tarif: 0.034 },
  { code: 'LB', nom: 'Liban', indicatif: '961', tarif: 0.098 },
  { code: 'SA', nom: 'Arabie saoudite', indicatif: '966', tarif: 0.072 },
  { code: 'AE', nom: 'Émirats arabes unis', indicatif: '971', tarif: 0.079 },
  { code: 'QA', nom: 'Qatar', indicatif: '974', tarif: 0.081 },
  { code: 'IN', nom: 'Inde', indicatif: '91', tarif: 0.031 },
  { code: 'PK', nom: 'Pakistan', indicatif: '92', tarif: 0.068 },
  { code: 'BD', nom: 'Bangladesh', indicatif: '880', tarif: 0.062 },
  { code: 'CN', nom: 'Chine', indicatif: '86', tarif: 0.026 },
  { code: 'HK', nom: 'Hong Kong', indicatif: '852', tarif: 0.028 },
  { code: 'JP', nom: 'Japon', indicatif: '81', tarif: 0.032 },
  { code: 'KR', nom: 'Corée du Sud', indicatif: '82', tarif: 0.030 },
  { code: 'TH', nom: 'Thaïlande', indicatif: '66', tarif: 0.036 },
  { code: 'VN', nom: 'Viêt Nam', indicatif: '84', tarif: 0.058 },
  { code: 'PH', nom: 'Philippines', indicatif: '63', tarif: 0.064 },
  { code: 'ID', nom: 'Indonésie', indicatif: '62', tarif: 0.049 },
  { code: 'MY', nom: 'Malaisie', indicatif: '60', tarif: 0.035 },
  { code: 'SG', nom: 'Singapour', indicatif: '65', tarif: 0.027 },

  { code: 'AU', nom: 'Australie', indicatif: '61', tarif: 0.029 },
  { code: 'NZ', nom: 'Nouvelle-Zélande', indicatif: '64', tarif: 0.033 },
];

/** Tarif appliqué quand l'indicatif n'est pas reconnu. */
export const TARIF_PAR_DEFAUT = 0.140;

/** Ne garde que les chiffres d'un numéro (le « + » initial est implicite). */
export const chiffresDe = (numero) => String(numero || '').replace(/\D/g, '');

/**
 * Pays correspondant à un numéro international, en retenant l'indicatif le
 * plus long qui corresponde : « 1 » (États-Unis) ne doit pas l'emporter sur
 * « 1876 » si un jour on l'ajoute, ni « 3 » sur « 33 ».
 */
export function paysDuNumero(numero) {
  const chiffres = chiffresDe(numero);
  if (!chiffres) return null;
  let trouve = null;
  for (const pays of PAYS) {
    if (!chiffres.startsWith(pays.indicatif)) continue;
    if (!trouve || pays.indicatif.length > trouve.indicatif.length) trouve = pays;
  }
  return trouve;
}

/** Tarif à la minute pour un numéro, indicatif inconnu compris. */
export const tarifDuNumero = (numero) => paysDuNumero(numero)?.tarif ?? TARIF_PAR_DEFAUT;

/** Liste triée par nom, pour un menu déroulant. */
export const paysTries = () => [...PAYS].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

/** « +33612345678 » → « +33 6 12 34 56 78 » (groupes de deux après l'indicatif). */
export function formatNumero(numero) {
  const chiffres = chiffresDe(numero);
  if (!chiffres) return '';
  const pays = paysDuNumero(chiffres);
  if (!pays) return `+${chiffres}`;
  const reste = chiffres.slice(pays.indicatif.length);
  // Groupes de deux ; un premier chiffre isolé si la longueur est impaire,
  // ce qui donne « 6 12 34 56 78 » pour un mobile français.
  const tete = reste.length % 2 ? reste.slice(0, 1) : '';
  const corps = reste.slice(tete.length).replace(/(\d{2})(?=\d)/g, '$1 ');
  const groupes = [tete, corps].filter(Boolean).join(' ');
  return `+${pays.indicatif}${groupes ? ` ${groupes}` : ''}`.trimEnd();
}
