/** Sélecteur d'émoticônes — les classiques de Skip d'abord, puis les émojis. */
import { el, clear, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

const RECENT_KEY = 'skip.emoji.recent';

/** Émoticônes Skip historiques, avec leur raccourci texte. */
export const SKYPE_CLASSICS = [
  ['🙂', 'Sourire', ':)'], ['😃', 'Grand sourire', ':D'], ['🙁', 'Triste', ':('],
  ['😉', 'Clin d’œil', ';)'], ['😛', 'Langue', ':P'], ['😮', 'Surpris', ':O'],
  ['😢', 'Pleure', ":'("], ['😍', 'Amoureux', '(inlove)'], ['😎', 'Cool', '(cool)'],
  ['😂', 'Mort de rire', '(lol)'], ['🤣', 'Écroulé', '(rofl)'], ['🤭', 'Rire discret', '(giggle)'],
  ['😊', 'Rougir', '(blush)'], ['🤨', 'Perplexe', '(wondering)'], ['😴', 'Endormi', '(sleepy)'],
  ['😑', 'Blasé', '(dull)'], ['😠', 'Fâché', '(mad)'], ['😡', 'Furieux', '(angry)'],
  ['🤮', 'Dégoûté', '(puke)'], ['😇', 'Ange', '(angel)'], ['😈', 'Diable', '(devil)'],
  ['🤓', 'Intello', '(nerd)'], ['🥷', 'Ninja', '(ninja)'], ['😅', 'Sueur', '(sweat)'],
  ['😶', 'Sans voix', '(speechless)'], ['😘', 'Bisou', '(kiss)'], ['🥱', 'Bâillement', '(yawn)'],
  ['😟', 'Inquiet', '(worry)'], ['🤦', 'Facepalm', '(facepalm)'], ['🤔', 'Pensif', '(think)'],
  ['😱', 'Choqué', '(shock)'], ['😏', 'Sourire en coin', '(smirk)'], ['💤', 'Dodo', '(zzz)'],
  ['👍', 'Pouce en l’air', '(y)'], ['👎', 'Pouce en bas', '(n)'], ['👏', 'Applaudir', '(clap)'],
  ['👋', 'Coucou', '(wave)'], ['👊', 'Poing', '(punch)'], ['💪', 'Muscle', '(muscle)'],
  ['🙏', 'Prière', '(pray)'], ['🙌', 'Tope là', '(highfive)'], ['👌', 'OK', '(ok)'],
  ['🤝', 'Poignée de main', '(handshake)'], ['🤞', 'Doigts croisés', '(fingerscrossed)'],
  ['❤️', 'Cœur', '(h)'], ['💔', 'Cœur brisé', '(brokenheart)'], ['💖', 'Cœur scintillant', '(sparklingheart)'],
  ['🤗', 'Câlin', '(hug)'], ['🌹', 'Rose', '(rose)'], ['💙', 'Skip', '(skip)'],
  ['🎉', 'Fête', '(party)'], ['🎂', 'Gâteau', '(cake)'], ['🎁', 'Cadeau', '(gift)'],
  ['🍾', 'Champagne', '(champagne)'], ['🍺', 'Bière', '(beer)'], ['🍸', 'Cocktail', '(drink)'],
  ['☕', 'Café', '(coffee)'], ['🍕', 'Pizza', '(pizza)'], ['🎄', 'Sapin', '(xmas)'],
  ['🎆', 'Feu d’artifice', '(fireworks)'], ['⭐', 'Étoile', '(*)'], ['☀️', 'Soleil', '(sun)'],
  ['🌧️', 'Pluie', '(rain)'], ['🎵', 'Musique', '(music)'], ['🎬', 'Cinéma', '(film)'],
  ['📱', 'Téléphone', '(phone)'], ['💻', 'Ordinateur', '(computer)'], ['✉️', 'Courrier', '(mail)'],
  ['💣', 'Bombe', '(bomb)'], ['💡', 'Idée', '(idea)'], ['🚀', 'Fusée', '(rocket)'],
  ['🚗', 'Voiture', '(car)'], ['✈️', 'Avion', '(plane)'], ['⚽', 'Football', '(football)'],
  ['🔥', 'Feu', '(fire)'], ['💯', 'Cent', '(100)'], ['💩', 'Caca', '(poop)'],
  ['🐱', 'Chat', '(cat)'], ['🐶', 'Chien', '(dog)'], ['🐵', 'Singe', '(monkey)'],
  ['🐻', 'Ours', '(bear)'], ['🐧', 'Manchot', '(penguin)'], ['🦄', 'Licorne', '(unicorn)'],
];

const CATEGORIES = [
  {
    id: 'recent',
    label: 'Récents',
    tab: '🕐',
    emojis: [],
  },
  {
    id: 'skip',
    label: 'Émoticônes Skip',
    tab: '💙',
    emojis: SKYPE_CLASSICS.map(([emoji, name, code]) => ({ emoji, name, code })),
  },
  {
    id: 'smileys',
    label: 'Visages et émotions',
    tab: '😀',
    emojis: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👹 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'.split(' '),
  },
  {
    id: 'gestures',
    label: 'Gestes et personnes',
    tab: '👋',
    emojis: '👋 🤚 🖐 ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁 👅 👄 🫦 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 🥷 👷 🤴 👸 👳 👲 🧕 🤵 👰 🤰 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 👯 🧖 🧗 🤺 🏇 ⛷ 🏂 🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🚵 🤸 🤼 🤽 🤾 🤹 🧘 🛀 🛌 👭 👫 👬 💏 💑 👪'.split(' '),
  },
  {
    id: 'nature',
    label: 'Animaux et nature',
    tab: '🐶',
    emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🦟 🦗 🕷 🕸 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿 🦔 🐾 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🐚 🪸 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐️ 🌟 ✨ ⚡️ ☄️ 💥 🔥 🌪 🌈 ☀️ 🌤 ⛅️ 🌥 ☁️ 🌦 🌧 ⛈ 🌩 🌨 ❄️ ☃️ ⛄️ 🌬 💨 💧 💦 🫧 ☔️ ☂️ 🌊 🌫'.split(' '),
  },
  {
    id: 'food',
    label: 'Nourriture et boissons',
    tab: '🍔',
    emojis: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🦴 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 🫖 ☕️ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊'.split(' '),
  },
  {
    id: 'activities',
    label: 'Activités et voyages',
    tab: '⚽',
    emojis: '⚽️ 🏀 🏈 ⚾️ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳️ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸ 🥌 🎿 ⛷ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖 🏵 🎗 🎫 🎟 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟ 🎯 🎳 🎮 🎰 🧩 🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩 💺 🛰 🚀 🛸 🚁 🛶 ⛵️ 🚤 🛥 🛳 ⛴ 🚢 ⚓️ 🪝 ⛽️ 🚧 🚦 🚥 🗺 🗿 🗽 🗼 🏰 🏯 🏟 🎡 🎢 🎠 ⛲️ ⛱ 🏖 🏝 🏜 🌋 ⛰ 🏔 🗻 🏕 ⛺️ 🛖 🏠 🏡 🏘 🏚 🏗 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛 ⛪️ 🕌 🕍 🛕 🕋 ⛩'.split(' '),
  },
  {
    id: 'objects',
    label: 'Objets et symboles',
    tab: '💡',
    emojis: '⌚️ 📱 💻 ⌨️ 🖥 🖨 🖱 🖲 🕹 🗜 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽 📞 ☎️ 📟 📠 📺 📻 🎙 ⏱ ⏲ ⏰ 🕰 ⌛️ ⏳ 📡 🔋 🔌 💡 🔦 🕯 🪔 🧯 🛢 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒ 🛠 ⛏ 🔩 ⚙️ 🧱 ⛓ 🧲 🔫 💣 🧨 🪓 🔪 🗡 ⚔️ 🛡 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡 🧹 🪣 🧽 🧴 🛎 🔑 🗝 🚪 🪑 🛋 🛏 🛌 🧸 🪆 🖼 🪞 🪟 🛍 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷 🪧 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒 🗓 📆 📅 🗑 📇 🗃 🗳 🗄 📋 📁 📂 🗂 🗞 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇 📐 📏 🧮 📌 📍 ✂️ 🖊 🖋 ✒️ 🖌 🖍 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈️ ♉️ ♊️ ♋️ ♌️ ♍️ ♎️ ♏️ ♐️ ♑️ ♒️ ♓️ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚️ 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕️ 🛑 ⛔️ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗️ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯️ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿️ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸ ⏯ ⏹ ⏺ ⏭ ⏮ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫️ ⚪️ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾️ ◽️ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛️ ⬜️ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 👁‍🗨 💬 💭 🗯 ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄️ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛'.split(' '),
  },
  {
    id: 'flags',
    label: 'Drapeaux',
    tab: '🏳️',
    emojis: '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇫🇷 🇧🇪 🇨🇭 🇨🇦 🇱🇺 🇲🇨 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇬🇧 🇺🇸 🇮🇪 🇳🇱 🇦🇹 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇵🇱 🇨🇿 🇬🇷 🇹🇷 🇷🇺 🇺🇦 🇷🇴 🇭🇺 🇭🇷 🇷🇸 🇧🇬 🇲🇦 🇩🇿 🇹🇳 🇸🇳 🇨🇮 🇨🇲 🇲🇱 🇨🇩 🇪🇬 🇿🇦 🇳🇬 🇰🇪 🇧🇷 🇦🇷 🇲🇽 🇨🇱 🇨🇴 🇵🇪 🇯🇵 🇨🇳 🇰🇷 🇮🇳 🇹🇭 🇻🇳 🇮🇩 🇵🇭 🇸🇬 🇦🇺 🇳🇿 🇮🇱 🇸🇦 🇦🇪 🇶🇦 🇱🇧 🇪🇺'.split(' '),
  },
];

const loadRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};

export function rememberEmoji(emoji) {
  const recent = loadRecent().filter((e) => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 40)));
}

/**
 * Ouvre le sélecteur près d'un élément.
 * onPick(emoji) est appelé à chaque choix ; le panneau reste ouvert
 * (fermeture par clic extérieur ou Échap).
 */
export function openEmojiPicker(anchor, onPick, { closeOnPick = false } = {}) {
  document.querySelector('.emoji-panel')?.remove();

  let category = 'skip';
  let query = '';

  const grid = el('div.emoji-panel__grid');
  const footer = el('div.emoji-panel__footer', { text: 'Choisissez une émoticône' });

  const item = (emoji, name = '', code = '') =>
    el('button.emoji-panel__item', {
      type: 'button',
      title: code ? `${name} ${code}` : name,
      text: emoji,
      onmouseenter: () => (footer.textContent = code ? `${name}  ·  tapez ${code}` : name),
      onclick: () => {
        rememberEmoji(emoji);
        onPick(emoji);
        if (closeOnPick) close();
      },
    });

  const renderGrid = () => {
    clear(grid);

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const results = [];
      for (const cat of CATEGORIES) {
        for (const entry of cat.emojis) {
          const emoji = typeof entry === 'string' ? entry : entry.emoji;
          const name = typeof entry === 'string' ? '' : entry.name;
          const code = typeof entry === 'string' ? '' : entry.code;
          if (
            (name && name.toLowerCase().includes(q)) ||
            (code && code.toLowerCase().includes(q)) ||
            emoji === q
          ) {
            if (!results.some((r) => r.emoji === emoji)) results.push({ emoji, name, code });
          }
        }
      }
      if (!results.length) {
        grid.append(el('div.emoji-panel__group-title', { text: 'Aucun résultat' }));
      }
      for (const result of results.slice(0, 200)) grid.append(item(result.emoji, result.name, result.code));
      return;
    }

    if (category === 'recent') {
      const recent = loadRecent();
      if (!recent.length) {
        grid.append(el('div.emoji-panel__group-title', { text: 'Vos émoticônes récentes apparaîtront ici' }));
      }
      for (const emoji of recent) grid.append(item(emoji));
      return;
    }

    const cat = CATEGORIES.find((c) => c.id === category);
    grid.append(el('div.emoji-panel__group-title', { text: cat.label }));
    for (const entry of cat.emojis) {
      if (typeof entry === 'string') grid.append(item(entry));
      else grid.append(item(entry.emoji, entry.name, entry.code));
    }
  };

  const tabs = el(
    'div.emoji-panel__tabs',
    {},
    CATEGORIES.map((cat) =>
      el(`button.emoji-panel__tab${cat.id === category ? '.is-active' : ''}`, {
        type: 'button',
        text: cat.tab,
        title: cat.label,
        dataset: { cat: cat.id },
        onclick: (e) => {
          category = cat.id;
          query = '';
          search.value = '';
          [...tabs.children].forEach((tab) => tab.classList.toggle('is-active', tab.dataset.cat === category));
          renderGrid();
          grid.scrollTop = 0;
        },
      })
    )
  );

  const search = el('input.input', {
    type: 'search',
    placeholder: 'Rechercher une émoticône…',
    oninput: debounce((e) => {
      query = e.target.value;
      renderGrid();
    }, 120),
  });

  const panel = el('div.emoji-panel', { role: 'dialog', 'aria-label': 'Émoticônes' }, [
    el('div.emoji-panel__search', {}, search),
    tabs,
    grid,
    footer,
  ]);

  document.getElementById('overlays').append(panel);

  // Positionnement au-dessus de l'ancre, en restant dans la fenêtre.
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left - 150), innerWidth - panel.offsetWidth - 8);
  const top = rect.top - panel.offsetHeight - 8;
  panel.style.left = `${left}px`;
  panel.style.top = `${top < 8 ? rect.bottom + 8 : top}px`;

  function onOutside(e) {
    if (!panel.contains(e.target) && !anchor.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
  function close() {
    document.removeEventListener('pointerdown', onOutside);
    document.removeEventListener('keydown', onKey, true);
    panel.remove();
  }

  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey, true);
  }, 0);

  renderGrid();
  search.focus();
  return { close, panel };
}

/** Réactions rapides proposées sur les messages (comme Skype 8). */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎'];
