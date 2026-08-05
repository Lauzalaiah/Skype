/** Réglages complets : profil, apparence, notifications, appels, confidentialité… */
import { el, clear, copyToClipboard, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, setToken } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { state, setState, notify } from '../state.js';
import { modal, toast, avatar, confirm, prompt, menu } from './common.js';
import { toDataUrl, openShortcutsDialog, openAboutDialog } from './modals.js';
import { applyAppearance } from '../theme.js';
import * as sounds from '../lib/sounds.js';

const SECTIONS = [
  ['profile', 'Profil', 'contact'],
  ['appearance', 'Apparence', 'moon'],
  ['audio', 'Audio et vidéo', 'video'],
  ['calls', 'Appels', 'call'],
  ['messaging', 'Messagerie', 'chat'],
  ['notifications', 'Notifications', 'bell'],
  ['contacts', 'Contacts', 'people'],
  ['privacy', 'Confidentialité', 'shield'],
  ['credit', 'Crédit Skip', 'wallet'],
  ['general', 'Général', 'settings'],
  ['help', 'Aide et retours', 'info'],
];

export function openSettings(section = 'profile') {
  let active = section;

  const panel = el('div.settings__panel');
  const nav = el('div.settings__nav');

  // Aperçu sonore : un seul à la fois, arrêté à la fermeture des réglages.
  // Déclaré ici — et non plus bas — car les sections y accèdent dès le
  // premier rendu, avant que la fin du corps de la fonction ne soit atteinte.
  let preview = null;
  let previewTimer = null;

  const stopPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = null;
    preview?.stop();
    preview = null;
  };

  const renderNav = () => {
    clear(nav);
    for (const [id, label, iconName] of SECTIONS) {
      nav.append(
        el(`button.settings__nav-item${id === active ? '.is-active' : ''}`, {
          onclick: () => {
            active = id;
            renderNav();
            renderPanel();
          },
        }, [icon(iconName, 'icon icon--sm'), label])
      );
    }
  };

  const renderPanel = () => {
    clear(panel);
    const renderers = {
      profile: profileSection,
      appearance: appearanceSection,
      audio: audioSection,
      calls: callsSection,
      messaging: messagingSection,
      notifications: notificationsSection,
      contacts: contactsSection,
      privacy: privacySection,
      credit: creditSection,
      general: generalSection,
      help: helpSection,
    };
    panel.append(renderers[active]());
  };

  const instance = modal({
    title: 'Réglages',
    size: 'full',
    flush: true,
    body: el('div.settings', {}, [nav, panel]),
    onClose: () => {
      stopPreview();
      sounds.stopRinging();
    },
  });

  renderNav();
  renderPanel();
  return instance;

  // ── Aides ──────────────────────────────────────────────────────────────────

  function group(title, children) {
    return el('div.settings__group', {}, [el('h3.settings__group-title', { text: title }), ...[].concat(children)]);
  }

  function settingRow(title, description, control) {
    return el('div.settings__row', {}, [
      el('div.settings__row-body', {}, [
        el('div.settings__row-title', { text: title }),
        description ? el('div.settings__row-desc', { text: description }) : null,
      ]),
      control,
    ]);
  }

  function toggle(path, { onChange = null } = {}) {
    const value = getPath(state.user.settings, path);
    const input = el('input', {
      type: 'checkbox',
      checked: value !== false,
      onchange: async (e) => {
        const next = e.target.checked;
        setPath(state.user.settings, path, next);
        onChange?.(next);
        await saveSettings(pathToPatch(path, next));
      },
    });
    return el('label.switch', {}, [input, el('span.switch__track')]);
  }

  function select(path, options, { onChange = null } = {}) {
    const value = getPath(state.user.settings, path);
    return el(
      'select.select',
      {
        style: { width: 'auto', minWidth: '160px' },
        onchange: async (e) => {
          setPath(state.user.settings, path, e.target.value);
          onChange?.(e.target.value);
          await saveSettings(pathToPatch(path, e.target.value));
        },
      },
      options.map(([id, label]) => el('option', { value: id, selected: id === value, text: label }))
    );
  }

  // ── Profil ─────────────────────────────────────────────────────────────────

  function profileSection() {
    const user = state.user;

    const avatarInput = el('input', {
      type: 'file',
      accept: 'image/*',
      class: 'sr-only',
      onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await toDataUrl(file, 256);
          await api.updateProfile({ avatar: dataUrl });
          user.avatar = dataUrl;
          notify('user');
          renderPanel();
          toast('Photo de profil mise à jour');
        } catch (err) {
          toast(err.message, { type: 'error' });
        }
      },
    });

    const field = (label, key, options = {}) => {
      const input = el(options.multiline ? 'textarea.textarea' : 'input.input', {
        value: user[key] || '',
        maxLength: options.maxLength || 120,
        type: options.type || 'text',
        placeholder: options.placeholder || '',
        onchange: async (e) => {
          const value = e.target.value.trim();
          try {
            await api.updateProfile({ [key]: value });
            user[key] = value;
            notify('user');
            toast('Profil mis à jour');
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      });
      return el('div.field', {}, [el('label.field__label', { text: label }), input]);
    };

    return el('div', {}, [
      el('div.center', { style: { marginBottom: '20px' } }, [
        avatar(user, { size: 'xxl', presence: false }),
        avatarInput,
        el('div.row.gap-8', { style: { justifyContent: 'center', marginTop: '12px' } }, [
          el('button.btn.btn--sm', { text: 'Changer la photo', onclick: () => avatarInput.click() }),
          user.avatar
            ? el('button.btn.btn--sm.btn--ghost', {
                text: 'Retirer',
                onclick: async () => {
                  await api.updateProfile({ avatar: null });
                  user.avatar = null;
                  notify('user');
                  renderPanel();
                },
              })
            : null,
        ]),
      ]),

      group('Informations', [
        field('Nom affiché', 'displayName', { maxLength: 60 }),
        field('Message d’humeur', 'mood', { maxLength: 120, placeholder: 'Que se passe-t-il ?' }),
        field('À propos de moi', 'about', { multiline: true, maxLength: 400 }),
      ]),

      group('Coordonnées', [
        settingRow('Pseudo Skip', 'Partagez-le pour qu’on vous ajoute', el('div.row.gap-8', {}, [
          el('code', { text: user.pseudo }),
          el('button.btn.btn--sm.btn--ghost', {
            text: 'Copier',
            onclick: () => {
              copyToClipboard(user.pseudo);
              toast('Pseudo copié');
            },
          }),
        ])),
        field('E-mail', 'email', { type: 'email' }),
        field('Téléphone', 'phone', { type: 'tel' }),
        field('Ville', 'city'),
        field('Pays', 'country'),
        field('Site web', 'website', { type: 'url' }),
        el('div.field', {}, [
          el('label.field__label', { text: 'Date de naissance' }),
          el('input.input', {
            type: 'date',
            value: user.birthday ? String(user.birthday).slice(0, 10) : '',
            onchange: async (e) => {
              await api.updateProfile({ birthday: e.target.value || null });
              user.birthday = e.target.value || null;
            },
          }),
        ]),
      ]),

      group('Sécurité', [
        settingRow('Mot de passe', 'Modifiez votre mot de passe', el('button.btn.btn--sm', { text: 'Changer', onclick: changePassword })),
        settingRow('Se déconnecter', 'Fermer la session sur cet appareil', el('button.btn.btn--sm.btn--danger', { text: 'Déconnexion', onclick: signOut })),
      ]),
    ]);
  }

  async function changePassword() {
    const current = await prompt({ title: 'Mot de passe actuel', label: 'Saisissez votre mot de passe actuel' });
    if (!current) return;
    const next = await prompt({ title: 'Nouveau mot de passe', label: 'Au moins 6 caractères' });
    if (!next) return;
    try {
      await api.changePassword(current, next);
      toast('Mot de passe modifié');
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  async function signOut() {
    const ok = await confirm({ title: 'Se déconnecter ?', message: 'Vous devrez saisir à nouveau votre mot de passe.', confirmLabel: 'Se déconnecter', danger: true });
    if (!ok) return;
    sounds.logout();
    try {
      await api.signout();
    } catch {
      /* la session est de toute façon abandonnée côté client */
    }
    socket.disconnect();
    setToken(null);
    // On laisse le son de déconnexion se terminer avant de recharger.
    await new Promise((resolve) => setTimeout(resolve, 900));
    location.reload();
  }

  // ── Apparence ──────────────────────────────────────────────────────────────

  function appearanceSection() {
    const themes = [
      ['light', 'Clair', ['#ffffff', '#f0f0f0', '#5a4fe0']],
      ['dark', 'Sombre', ['#201f1e', '#323130', '#29b6f6']],
      ['classic', 'Skip Classic', ['#ffffff', '#5a4fe0', '#3b2ca8']],
      ['contrast', 'Contraste élevé', ['#000000', '#ffff00', '#1aebff']],
    ];

    const themeCards = el('div.theme-preview');
    for (const [id, label, colors] of themes) {
      themeCards.append(
        el(`button.theme-card${state.user.settings.theme === id ? '.is-active' : ''}`, {
          onclick: async () => {
            state.user.settings.theme = id;
            applyAppearance(state.user.settings);
            await saveSettings({ theme: id });
            renderPanel();
          },
        }, [
          el('div.theme-card__preview', {}, colors.map((color) => el('div', { style: { flex: '1', background: color } }))),
          el('div.theme-card__label', { text: label }),
        ])
      );
    }

    const accents = [
      ['skip', '#5a4fe0'], ['ocean', '#0078d4'], ['forest', '#107c10'],
      ['sunset', '#ca5010'], ['grape', '#8764b8'], ['rose', '#e3008c'],
    ];
    const swatches = el('div.accent-swatches');
    for (const [id, color] of accents) {
      swatches.append(
        el(`button.accent-swatch${state.user.settings.accent === id ? '.is-active' : ''}`, {
          style: { background: color },
          title: id,
          'aria-label': `Accent ${id}`,
          onclick: async () => {
            state.user.settings.accent = id;
            applyAppearance(state.user.settings);
            await saveSettings({ accent: id });
            renderPanel();
          },
        })
      );
    }

    return el('div', {}, [
      group('Thème', themeCards),
      group('Couleur d’accentuation', swatches),
      group('Affichage', [
        settingRow('Taille du texte', 'Confort de lecture', select('fontSize', [['small', 'Petit'], ['medium', 'Moyen'], ['large', 'Grand'], ['xlarge', 'Très grand']], { onChange: () => applyAppearance(state.user.settings) })),
        settingRow('Densité de la liste', 'Nombre de conversations visibles', select('layout', [['default', 'Confortable'], ['compact', 'Compacte']], { onChange: () => applyAppearance(state.user.settings) })),
        settingRow('Grandes émoticônes', 'Afficher les émojis seuls en grand format', toggle('chat.largeEmoticons')),
        settingRow('Émoticônes animées', 'Convertir (y), :) et les autres raccourcis', toggle('chat.animatedEmoticons')),
      ]),
    ]);
  }

  // ── Audio et vidéo ─────────────────────────────────────────────────────────

  function audioSection() {
    const devicesNode = el('div');
    const levelBar = el('div', { style: { height: '6px', background: 'var(--presence-online)', width: '0%', borderRadius: '3px', transition: 'width 80ms' } });
    const preview = el('video', {
      autoplay: true,
      muted: true,
      playsinline: true,
      style: { width: '100%', maxWidth: '320px', borderRadius: '8px', background: '#000', transform: 'scaleX(-1)' },
    });

    let testStream = null;
    let audioCtx = null;
    let frame = null;

    const stopTest = () => {
      testStream?.getTracks().forEach((track) => track.stop());
      testStream = null;
      audioCtx?.close().catch(() => {});
      cancelAnimationFrame(frame);
      preview.srcObject = null;
      levelBar.style.width = '0%';
    };

    const startTest = async () => {
      stopTest();
      try {
        testStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        toast('Micro ou caméra inaccessible', { type: 'error' });
        return;
      }
      preview.srcObject = testStream;

      audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(testStream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
        levelBar.style.width = `${Math.min(100, level * 260)}%`;
        frame = requestAnimationFrame(tick);
      };
      tick();
    };

    // Liste des périphériques.
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      const byKind = (kind) => devices.filter((d) => d.kind === kind);
      const deviceSelect = (label, kind) => {
        const list = byKind(kind);
        return settingRow(
          label,
          list.length ? '' : 'Autorisez l’accès pour voir vos appareils',
          el('select.select', { style: { width: 'auto', minWidth: '200px' } },
            list.length
              ? list.map((device, index) => el('option', { value: device.deviceId, text: device.label || `${label} ${index + 1}` }))
              : [el('option', { text: 'Périphérique par défaut' })]
          )
        );
      };
      devicesNode.append(deviceSelect('Microphone', 'audioinput'), deviceSelect('Haut-parleurs', 'audiooutput'), deviceSelect('Caméra', 'videoinput'));
    });

    instance.node.addEventListener('remove', stopTest);

    return el('div', {}, [
      group('Périphériques', devicesNode),
      group('Test', [
        settingRow('Tester le micro et la caméra', 'Vérifiez que tout fonctionne avant un appel', el('div.row.gap-8', {}, [
          el('button.btn.btn--sm.btn--primary', { text: 'Démarrer', onclick: startTest }),
          el('button.btn.btn--sm', { text: 'Arrêter', onclick: stopTest }),
        ])),
        el('div', { style: { marginTop: '10px' } }, [
          el('div.dim', { style: { fontSize: '0.82em', marginBottom: '6px' }, text: 'Niveau du micro' }),
          el('div', { style: { height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' } }, levelBar),
        ]),
        el('div', { style: { marginTop: '12px' } }, preview),
        el('button.btn.btn--sm', { style: { marginTop: '10px' }, text: 'Tester le son', onclick: () => sounds.callConnect() }),
      ]),
      group('Qualité', [
        settingRow('Vidéo HD', 'Jusqu’à 1280×720 quand la connexion le permet', toggle('calls.hdVideo')),
        settingRow('Réduction du bruit', 'Atténue les bruits de fond pendant les appels', toggle('calls.noiseSuppression')),
        settingRow('Flou d’arrière-plan', 'Masque votre environnement en vidéo', toggle('calls.blurBackground')),
      ]),
    ]);
  }

  // ── Appels ─────────────────────────────────────────────────────────────────

  function callsSection() {
    return el('div', {}, [
      group('Comportement', [
        settingRow('Répondre automatiquement', 'Décrocher les appels entrants sans action', toggle('calls.autoAnswer')),
        settingRow('Caméra activée par défaut', 'Démarrer les appels vidéo avec la caméra allumée', toggle('calls.videoOnByDefault')),
        settingRow('Sous-titres en direct', 'Transcrire la parole pendant les appels', toggle('calls.liveCaptions')),
      ]),
      group('Qui peut m’appeler', [
        settingRow('Appels entrants', 'Limitez les appels à vos contacts', select('privacy.whoCanCall', [['anyone', 'Tout le monde'], ['contacts', 'Mes contacts uniquement']])),
      ]),
      group('Appels téléphoniques', [
        settingRow('Numéro Skip', state.user.numeroSkip || 'Recevez des appels sur un vrai numéro',
          state.user.numeroSkip
            ? el('code', { text: state.user.numeroSkip })
            : el('button.btn.btn--sm', {
                text: 'Obtenir un numéro',
                onclick: async () => {
                  const { numeroSkip } = await api.getNumeroSkip('FR');
                  state.user.numeroSkip = numeroSkip;
                  renderPanel();
                  toast(`Votre numéro Skip : ${numeroSkip}`);
                },
              })
        ),
        settingRow('Renvoi d’appel', 'Transférer les appels manqués vers un numéro',
          el('input.input', { style: { width: '180px' }, placeholder: '+33 6 …', value: '' })),
      ]),
    ]);
  }

  // ── Messagerie ─────────────────────────────────────────────────────────────

  function messagingSection() {
    return el('div', {}, [
      group('Rédaction', [
        settingRow('Entrée envoie le message', 'Sinon, utilisez Ctrl + Entrée', toggle('enterToSend')),
        settingRow('Aperçu des liens', 'Afficher un aperçu sous les liens partagés', toggle('chat.webLinkPreviews')),
        settingRow('Horodatage', 'Afficher l’heure sous chaque message', toggle('chat.showTimestamps')),
      ]),
      group('Médias', [
        settingRow('Téléchargement automatique', 'Charger les images dès réception', toggle('chat.autoDownloadImages')),
      ]),
      group('Traduction', [
        settingRow('Langue de traduction', 'Utilisée par « Traduire » dans le menu d’un message',
          select('chat.translationLanguage', [
            ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais'], ['ar', 'Arabe'],
          ])),
      ]),
    ]);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  function notificationsSection() {
    const permission = Notification?.permission || 'default';
    return el('div', {}, [
      group('Notifications système', [
        settingRow(
          'Notifications du navigateur',
          permission === 'granted' ? 'Autorisées' : permission === 'denied' ? 'Bloquées par le navigateur' : 'Non demandées',
          permission === 'granted'
            ? toggle('notifications.desktop')
            : el('button.btn.btn--sm.btn--primary', {
                text: 'Autoriser',
                onclick: async () => {
                  const result = await Notification.requestPermission();
                  if (result === 'granted') toast('Notifications activées');
                  renderPanel();
                },
              })
        ),
        settingRow('Sons', 'Jouer un son à la réception', toggle('notifications.sound', { onChange: (value) => sounds.setSoundEnabled(value) })),
      ]),
      group('Me notifier pour', [
        settingRow('Messages', 'Nouveaux messages dans mes conversations', toggle('notifications.messages')),
        settingRow('Appels', 'Appels entrants', toggle('notifications.calls')),
        settingRow('Réactions', 'Quand quelqu’un réagit à mes messages', toggle('notifications.reactions')),
        settingRow('Demandes de contact', 'Nouvelles demandes reçues', toggle('notifications.contactRequests')),
      ]),
      group('Aperçu', [
        settingRow('Afficher le contenu', 'Montrer le texte du message dans la notification', toggle('showPreviews')),
      ]),

      group('Sonnerie', [
        settingRow('Sonnerie d’appel entrant', 'Celle qui retentit quand on vous appelle',
          el('div.row.gap-8', {}, [
            el('select.select', {
              style: { width: 'auto', minWidth: '180px' },
              onchange: async (e) => {
                sounds.setRingtone(e.target.value);
                await saveSettings({ notifications: { ringtone: e.target.value } });
                state.user.settings.notifications.ringtone = e.target.value;
                sounds.stopRinging();
                sounds.startRinging();
                setTimeout(() => sounds.stopRinging(), 3500);
              },
            }, sounds.SONNERIES.map((key) =>
              el('option', {
                value: key,
                selected: (state.user.settings.notifications?.ringtone || 'ring') === key,
                text: sounds.BIBLIOTHEQUE[key].label,
              })
            )),
            el('button.btn.btn--sm', {
              text: '▶',
              title: 'Écouter',
              onclick: () => {
                sounds.stopRinging();
                sounds.startRinging();
                setTimeout(() => sounds.stopRinging(), 4000);
              },
            }),
          ])),
      ]),

      group('Bibliothèque de sons', [
        el('p.dim', { style: { fontSize: '0.84em', marginBottom: '10px' }, text: 'Les sons d’origine de Skip. Survolez pour voir quand ils se déclenchent, cliquez pour les écouter.' }),
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          Object.entries(sounds.BIBLIOTHEQUE)
            .filter(([, entry]) => !entry.orphelin)
            .map(([key, entry]) =>
              el('button.btn.btn--sm.btn--outline', {
                text: entry.label,
                title: entry.usage || '',
                onclick: () => {
                  // Un aperçu à la fois, et les sons en boucle s'arrêtent seuls.
                  stopPreview();
                  sounds.stopRinging();
                  preview = sounds.sound(key);
                  if (entry.loop) previewTimer = setTimeout(stopPreview, 4000);
                },
              })
            )
        ),
      ]),

      // Sons présents mais dont l'usage d'origine n'est pas établi : ils sont
      // écoutables, jamais joués automatiquement tant qu'ils ne sont pas placés.
      ...(Object.entries(sounds.BIBLIOTHEQUE).some(([, e]) => e.orphelin)
        ? [group('Sons non attribués', [
            el('p.dim', { style: { fontSize: '0.84em', marginBottom: '10px' }, text: 'Ces sons ne sont branchés sur aucun événement, faute de savoir à quoi ils correspondent. Écoutez-les pour les identifier.' }),
            el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
              Object.entries(sounds.BIBLIOTHEQUE)
                .filter(([, entry]) => entry.orphelin)
                .map(([key, entry]) =>
                  el('button.btn.btn--sm.btn--outline', {
                    text: `${entry.label} · ${entry.source || entry.file}`,
                    style: { borderStyle: 'dashed' },
                    onclick: () => {
                      stopPreview();
                      sounds.stopRinging();
                      preview = sounds.sound(key);
                    },
                  })
                )
            ),
          ])]
        : []),
    ]);
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  function contactsSection() {
    const blockedList = el('div');
    if (!state.blocked.length) {
      blockedList.append(el('p.dim', { style: { fontSize: '0.88em' }, text: 'Vous n’avez bloqué personne.' }));
    } else {
      for (const person of state.blocked) {
        blockedList.append(
          el('div.settings__row', {}, [
            avatar(person, { size: 'sm', presence: false }),
            el('div.settings__row-body', {}, el('div.settings__row-title', { text: person.displayName })),
            el('button.btn.btn--sm', {
              text: 'Débloquer',
              onclick: async () => {
                await api.blockContact(person.id, false);
                const { refreshContacts } = await import('./sidebar.js');
                await refreshContacts();
                renderPanel();
              },
            }),
          ])
        );
      }
    }

    return el('div', {}, [
      group('Mes contacts', [
        settingRow('Contacts', `${state.contacts.length} personne${state.contacts.length > 1 ? 's' : ''}`,
          el('button.btn.btn--sm', { text: 'Voir', onclick: () => { instance.close(); setState({ view: 'contacts' }); } })),
        settingRow('Demandes en attente', `${state.requests.incoming.length} reçue${state.requests.incoming.length > 1 ? 's' : ''}`,
          el('button.btn.btn--sm', { text: 'Gérer', onclick: () => { instance.close(); setState({ view: 'contacts' }); } })),
        settingRow('Accepter automatiquement', 'Ajouter les demandes sans confirmation', toggle('privacy.autoAcceptContacts')),
      ]),
      group('Personnes bloquées', blockedList),
    ]);
  }

  // ── Confidentialité ────────────────────────────────────────────────────────

  function privacySection() {
    return el('div', {}, [
      group('Visibilité', [
        settingRow('Apparaître dans la recherche', 'Autoriser les autres à vous trouver par votre pseudo', toggle('privacy.appearInSearch')),
        settingRow('Confirmations de lecture', 'Indiquer quand vous avez lu un message', toggle('privacy.showReadReceipts')),
        settingRow('Indicateur de saisie', 'Montrer quand vous écrivez', toggle('privacy.showTypingIndicator')),
      ]),
      group('Qui peut me contacter', [
        settingRow('Messages', '', select('privacy.whoCanMessage', [['anyone', 'Tout le monde'], ['contacts', 'Mes contacts uniquement']])),
        settingRow('Appels', '', select('privacy.whoCanCall', [['anyone', 'Tout le monde'], ['contacts', 'Mes contacts uniquement']])),
      ]),
      group('Mes données', [
        settingRow('Exporter mes conversations', 'Télécharger l’historique au format JSON',
          el('button.btn.btn--sm', { text: 'Exporter', onclick: exportData })),
        settingRow('Supprimer mon compte', 'Action définitive',
          el('button.btn.btn--sm.btn--danger', {
            text: 'Supprimer',
            onclick: async () => {
              const ok = await confirm({
                title: 'Supprimer votre compte ?',
                message: 'Cette action est irréversible. Toutes vos conversations seront perdues.',
                confirmLabel: 'Supprimer définitivement',
                danger: true,
              });
              if (ok) toast('La suppression de compte n’est pas activée sur ce serveur de démonstration.');
            },
          })),
      ]),
    ]);
  }

  async function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: { ...state.user, settings: undefined },
      chats: state.chats.map((chat) => ({
        id: chat.id,
        type: chat.type,
        title: chat.topic || chat.members.map((m) => m.user?.displayName).join(', '),
        messages: (state.messages.get(chat.id) || []).map((m) => ({
          at: new Date(m.createdAt).toISOString(),
          from: m.senderId,
          text: m.content,
          type: m.type,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: `skip-export-${new Date().toISOString().slice(0, 10)}.json` });
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Export téléchargé');
  }

  // ── Crédit Skip ───────────────────────────────────────────────────────────

  function creditSection() {
    return el('div', {}, [
      el('div.credit-banner', {}, [
        icon('wallet', 'icon icon--xl'),
        el('div', { style: { flex: '1' } }, [
          el('div', { style: { fontSize: '0.85em', opacity: '0.9' }, text: 'Solde disponible' }),
          el('div.credit-banner__amount', { text: `${(state.user.credit ?? 0).toFixed(2)} €` }),
        ]),
      ]),
      group('Recharger', [
        el('div.row.gap-8', {}, [5, 10, 25].map((amount) =>
          el('button.btn.btn--outline', {
            text: `${amount} €`,
            onclick: async () => {
              const { credit } = await api.topUp(amount);
              state.user.credit = credit;
              renderPanel();
              toast(`${amount} € ajoutés`);
            },
          })
        )),
        el('p.dim', { style: { fontSize: '0.82em', marginTop: '10px' }, text: 'Rechargement de démonstration : aucun paiement réel n’est effectué.' }),
      ]),
      group('Tarifs', [
        settingRow('France — fixes et mobiles', '0,021 €/min', el('span.dim', { text: '0,021 €' })),
        settingRow('Europe', '0,024 €/min', el('span.dim', { text: '0,024 €' })),
        settingRow('International', 'à partir de 0,04 €/min', el('span.dim', { text: '0,040 €' })),
      ]),
      group('Numéro Skip', [
        settingRow('Recevoir des appels sur un numéro', state.user.numeroSkip || 'Aucun numéro attribué',
          el('button.btn.btn--sm', {
            text: state.user.numeroSkip ? 'Changer' : 'Obtenir',
            onclick: async (e) => {
              menu(
                [['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['CA', 'Canada'], ['UK', 'Royaume-Uni'], ['US', 'États-Unis']].map(([code, label]) => ({
                  label,
                  onClick: async () => {
                    const { numeroSkip } = await api.getNumeroSkip(code);
                    state.user.numeroSkip = numeroSkip;
                    renderPanel();
                    toast(`Numéro attribué : ${numeroSkip}`);
                  },
                })),
                { anchor: e.currentTarget }
              );
            },
          })),
      ]),
    ]);
  }

  // ── Général ────────────────────────────────────────────────────────────────

  function generalSection() {
    return el('div', {}, [
      group('Langue', [
        settingRow('Langue de l’interface', 'Redémarrage nécessaire',
          select('language', [['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['de', 'Deutsch']])),
      ]),
      group('Démarrage', [
        settingRow('Statut au démarrage', 'Votre présence à l’ouverture de Skip',
          el('select.select', { style: { width: 'auto' }, onchange: (e) => setStatus(e.target.value) },
            [['online', 'En ligne'], ['away', 'Absent'], ['busy', 'Ne pas déranger'], ['invisible', 'Invisible']].map(([id, label]) =>
              el('option', { value: id, selected: state.user.manualStatus === id || state.user.status === id, text: label })
            )
          )),
      ]),
      group('Stockage', [
        settingRow('Vider le cache local', 'Libère l’espace utilisé par les images en cache',
          el('button.btn.btn--sm', {
            text: 'Vider',
            onclick: () => {
              state.messages.clear();
              localStorage.removeItem('skip.emoji.recent');
              toast('Cache vidé');
            },
          })),
      ]),
      group('Raccourcis', [
        settingRow('Raccourcis clavier', 'Voir la liste complète',
          el('button.btn.btn--sm', { text: 'Afficher', onclick: openShortcutsDialog })),
      ]),
    ]);
  }

  function helpSection() {
    return el('div', {}, [
      group('Aide', [
        settingRow('Guide de démarrage', 'Comment retrouver vos contacts et lancer un appel',
          el('button.btn.btn--sm', { text: 'Ouvrir', onclick: () => window.open('/pub', '_blank') })),
        settingRow('Raccourcis clavier', '', el('button.btn.btn--sm', { text: 'Afficher', onclick: openShortcutsDialog })),
        settingRow('À propos de Skip', 'Version et informations', el('button.btn.btn--sm', { text: 'Voir', onclick: openAboutDialog })),
      ]),
      group('Diagnostic', [
        settingRow('État de la connexion', state.connection === 'online' ? 'Connecté au serveur' : 'Reconnexion en cours…',
          el('span.status-dot', { dataset: { status: state.connection === 'online' ? 'online' : 'busy' } })),
        settingRow('Tester les sons', 'La bibliothèque complète est dans Notifications',
          el('div.row.gap-8', {}, [
            el('button.btn.btn--sm', { text: 'Message', onclick: () => sounds.messageIn() }),
            el('button.btn.btn--sm', {
              text: 'Sonnerie',
              onclick: () => {
                sounds.startRinging();
                setTimeout(() => sounds.stopRinging(), 4000);
              },
            }),
          ])),
      ]),
    ]);
  }
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────

const saveSettings = debounce(async (patch) => {
  try {
    await api.updateSettings(patch);
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}, 250);

export async function setStatus(status) {
  state.user.manualStatus = status;
  state.user.status = status;
  socket.send({ type: 'presence:set', status });
  notify('user', 'presence');
  try {
    await api.updateProfile({ manualStatus: status });
  } catch {
    /* la présence est de toute façon renvoyée par le socket */
  }
}

// ── Accès aux chemins imbriqués ──────────────────────────────────────────────

const getPath = (object, path) => path.split('.').reduce((acc, key) => acc?.[key], object);

function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => (acc[key] ||= {}), object);
  target[last] = value;
}

function pathToPatch(path, value) {
  const keys = path.split('.');
  const patch = {};
  let cursor = patch;
  while (keys.length > 1) cursor = cursor[keys.shift()] = {};
  cursor[keys[0]] = value;
  return patch;
}
