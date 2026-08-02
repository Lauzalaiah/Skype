/** Écran de connexion et de création de compte. */
import { el, $, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, setToken } from '../lib/api.js';

const skypeLogo = (size = 40) =>
  el('div', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #00AFF0, #0078A8)',
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
    let mode = 'signin';
    const root = el('div.auth');
    document.getElementById('overlays').append(root);

    const render = () => {
      clear(root);
      root.append(mode === 'signin' ? signinCard() : signupCard());
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

    function signinCard() {
      const error = errorBox();
      const identifier = el('input.input', { placeholder: 'Pseudo Skype ou e-mail', autocomplete: 'username', autofocus: true, name: 'identifier' });
      const password = el('input.input', { type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', name: 'password' });
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
        el('div.field', {}, [el('label.field__label', { text: 'Pseudo Skype, e-mail ou téléphone' }), identifier]),
        el('div.field', {}, [el('label.field__label', { text: 'Mot de passe' }), password]),
        submit,
      ]);

      return el('div.auth__card', {}, [
        el('div.auth__logo', {}, [skypeLogo(44), el('span.auth__logo-text', { text: 'Skype' })]),
        el('p.auth__tagline', { text: 'Le Skype que vous aimiez. De retour, en mieux.' }),
        form,
        el('p.auth__switch', {}, [
          'Pas encore de compte ? ',
          el('button', { type: 'button', text: 'Créez-en un', onclick: () => { mode = 'signup'; render(); } }),
        ]),
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
      const displayName = el('input.input', { placeholder: 'Camille Durand', autocomplete: 'name', autofocus: true });
      const skypeName = el('input.input', { placeholder: 'camille.durand', autocomplete: 'username' });
      const email = el('input.input', { type: 'email', placeholder: 'vous@exemple.fr', autocomplete: 'email' });
      const password = el('input.input', { type: 'password', placeholder: '6 caractères minimum', autocomplete: 'new-password' });
      const hint = el('div.field__hint', { text: '3 à 32 caractères : lettres, chiffres, point, tiret ou souligné.' });
      const submit = el('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit', text: 'Créer mon compte' });

      // Proposition automatique de pseudo à partir du nom saisi.
      displayName.addEventListener('input', () => {
        if (skypeName.dataset.touched) return;
        skypeName.value = displayName.value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.|\.$/g, '')
          .slice(0, 32);
      });
      skypeName.addEventListener('input', () => (skypeName.dataset.touched = '1'));

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
                skypeName: skypeName.value.trim(),
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
        el('div.field', {}, [el('label.field__label', { text: 'Nom complet' }), displayName]),
        el('div.field', {}, [el('label.field__label', { text: 'Pseudo Skype' }), skypeName, hint]),
        el('div.field', {}, [el('label.field__label', { text: 'E-mail (facultatif)' }), email]),
        el('div.field', {}, [el('label.field__label', { text: 'Mot de passe' }), password]),
        submit,
      ]);

      return el('div.auth__card', {}, [
        el('div.auth__logo', {}, [skypeLogo(44), el('span.auth__logo-text', { text: 'Skype' })]),
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
