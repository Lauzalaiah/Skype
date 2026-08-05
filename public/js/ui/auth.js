/** Écran de connexion et de création de compte. */
import { el, $, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, setToken } from '../lib/api.js';
import { estNatif, estBureau, serveurChoisi, definirServeur, serveurManquant, tester } from '../lib/serveur.js';

const skypeLogo = (size = 40) =>
  el('div', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #5A4FE0, #3B2CA8)',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontWeight: '700',
      fontSize: `${size * 0.52}px`,
      boxShadow: '0 4px 14px rgba(0,175,240,.4)',
    },
    text: 'S',
  });

/** Affiche l'écran d'authentification ; résout avec { token, user }. */
export function showAuth() {
  return new Promise((resolve) => {
    // Dans une application native, l'interface est embarquée : elle ne sait pas
    // à quel serveur parler tant qu'on ne le lui a pas dit.
    let mode = serveurManquant() ? 'serveur' : 'signin';
    const root = el('div.auth');
    document.getElementById('overlays').append(root);

    const render = () => {
      clear(root);
      if (mode === 'serveur') root.append(serveurCard());
      else root.append(mode === 'signin' ? signinCard() : signupCard());
    };

    const finish = (result) => {
      setToken(result.token);
      root.remove();
      resolve(result);
    };

    const errorBox = () => el('div.auth__error.hidden');

    const showError = (box, message) => {
      box.textContent = message;
      box.classList.remove('hidden');
    };

    function serveurCard() {
      const error = errorBox();
      const champ = el('input.input', {
        id: 'srv-url',
        name: 'serveur',
        type: 'url',
        inputmode: 'url',
        autocapitalize: 'none',
        autocorrect: 'off',
        spellcheck: 'false',
        placeholder: 'https://skip.exemple.fr',
        value: serveurChoisi(),
        autofocus: true,
      });
      const submit = el('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit', text: 'Se connecter au serveur' });

      const form = el('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          error.classList.add('hidden');
          submit.disabled = true;
          submit.textContent = 'Vérification…';
          try {
            await tester(champ.value);
            definirServeur(champ.value);
            mode = 'signin';
            render();
          } catch (err) {
            showError(error, err.message);
            submit.disabled = false;
            submit.textContent = 'Se connecter au serveur';
          }
        },
      }, [
        error,
        el('div.field', {}, [
          el('label.field__label', { for: 'srv-url', text: 'Adresse de votre serveur Skip' }),
          champ,
          el('div.field__hint', { text: 'L’adresse complète, https comprise. Le micro et la caméra exigent https.' }),
        ]),
        submit,
      ]);

      return el('div.auth__card', {}, [
        el('div.auth__logo', {}, [skypeLogo(44), el('span.auth__logo-text', { text: 'Skip' })]),
        el('p.auth__tagline', { text: 'À quel serveur cette application doit-elle se connecter ?' }),
        form,
        el('p.auth__switch', { style: { fontSize: '0.82em' } }, [
          'Skip n’a pas de serveur central : chacun héberge le sien. '
          + 'Demandez son adresse à la personne qui l’héberge.',
        ]),
      ]);
    }

    function signinCard() {
      const error = errorBox();
      const identifier = el('input.input', { id: 'si-identifier', placeholder: 'Pseudo Skip ou e-mail', autocomplete: 'username', autofocus: true, name: 'identifier', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
      const password = el('input.input', { id: 'si-password', type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', name: 'password' });
      const submit = el('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit', text: 'Se connecter' });

      const form = el('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          error.classList.add('hidden');
          submit.disabled = true;
          submit.textContent = 'Connexion…';
          try {
            finish(await api.signin(identifier.value.trim(), password.value));
          } catch (err) {
            showError(error, err.message);
            submit.disabled = false;
            submit.textContent = 'Se connecter';
            password.select();
          }
        },
      }, [
        error,
        el('div.field', {}, [el('label.field__label', { for: 'si-identifier', text: 'Pseudo Skip, e-mail ou téléphone' }), identifier]),
        el('div.field', {}, [el('label.field__label', { for: 'si-password', text: 'Mot de passe' }), password]),
        submit,
      ]);

      return el('div.auth__card', {}, [
        el('div.auth__logo', {}, [skypeLogo(44), el('span.auth__logo-text', { text: 'Skip' })]),
        el('p.auth__tagline', { text: 'Le Skip que vous aimiez. De retour, en mieux.' }),
        form,
        el('p.auth__switch', {}, [
          'Pas encore de compte ? ',
          el('button', { type: 'button', text: 'Créez-en un', onclick: () => { mode = 'signup'; render(); } }),
        ]),
        // Utile hors du navigateur, où l'adresse n'est pas déduite de la page.
        estNatif() || estBureau() || serveurChoisi()
          ? el('p.auth__switch', { style: { fontSize: '0.8em' } }, [
            el('button', { type: 'button', text: 'Changer de serveur', onclick: () => { mode = 'serveur'; render(); } }),
          ])
          : null,
        el('div.auth__demo', {}, [
          el('strong', { text: 'Comptes de démonstration ' }),
          el('br'),
          'Pseudo ',
          el('code', { text: 'camille.durand' }),
          ' · mot de passe ',
          el('code', { text: 'skype123' }),
          el('br'),
          el('span.dim', { text: 'Aussi : thomas.leroy, aicha.benali, lucas.martin, mamie.jeanne, sofia.rossi' }),
        ]),
      ]);
    }

    function signupCard() {
      const error = errorBox();
      const displayName = el('input.input', { id: 'su-name', name: 'displayName', placeholder: 'Camille Durand', autocomplete: 'name', autofocus: true });
      const pseudo = el('input.input', { id: 'su-skypename', name: 'pseudo', placeholder: 'camille.durand', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
      const email = el('input.input', { id: 'su-email', name: 'email', type: 'email', placeholder: 'vous@exemple.fr', autocomplete: 'email', autocapitalize: 'none' });
      const password = el('input.input', { id: 'su-password', name: 'password', type: 'password', placeholder: '6 caractères minimum', autocomplete: 'new-password' });
      const hint = el('div.field__hint', { text: '3 à 32 caractères : lettres, chiffres, point, tiret ou souligné.' });
      const submit = el('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit', text: 'Créer mon compte' });

      // Proposition automatique de pseudo à partir du nom saisi.
      displayName.addEventListener('input', () => {
        if (pseudo.dataset.touched) return;
        pseudo.value = displayName.value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.|\.$/g, '')
          .slice(0, 32);
      });
      pseudo.addEventListener('input', () => (pseudo.dataset.touched = '1'));

      const form = el('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          error.classList.add('hidden');
          submit.disabled = true;
          submit.textContent = 'Création…';
          try {
            finish(
              await api.signup({
                displayName: displayName.value.trim(),
                pseudo: pseudo.value.trim(),
                email: email.value.trim(),
                password: password.value,
              })
            );
          } catch (err) {
            showError(error, err.message);
            submit.disabled = false;
            submit.textContent = 'Créer mon compte';
          }
        },
      }, [
        error,
        el('div.field', {}, [el('label.field__label', { for: 'su-name', text: 'Nom complet' }), displayName]),
        el('div.field', {}, [el('label.field__label', { for: 'su-skypename', text: 'Pseudo Skip' }), pseudo, hint]),
        el('div.field', {}, [el('label.field__label', { for: 'su-email', text: 'E-mail (facultatif)' }), email]),
        el('div.field', {}, [el('label.field__label', { for: 'su-password', text: 'Mot de passe' }), password]),
        submit,
      ]);

      return el('div.auth__card', {}, [
        el('div.auth__logo', {}, [skypeLogo(44), el('span.auth__logo-text', { text: 'Skip' })]),
        el('p.auth__tagline', { text: 'Créez votre compte en dix secondes. Sans numéro de téléphone.' }),
        form,
        el('p.auth__switch', {}, [
          'Vous avez déjà un compte ? ',
          el('button', { type: 'button', text: 'Se connecter', onclick: () => { mode = 'signin'; render(); } }),
        ]),
      ]);
    }

    render();
  });
}
