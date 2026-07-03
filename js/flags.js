// Banderas como imagen (flagcdn.com). Windows no renderiza emojis de bandera
// (muestra solo las letras del código), así que convertimos el emoji guardado
// en la BD a código ISO y lo mostramos como <img>. Si no se puede convertir
// (⏳, 🏳️, texto), se muestra el valor tal cual como emoji.

// Emoji de bandera → código ISO 3166-1 alfa-2 (🇵🇪 → 'pe').
function emojiToIso(emoji) {
  const s = String(emoji || '').trim();
  const cp = [...s].map((c) => c.codePointAt(0));
  // Caso normal: dos "regional indicator symbols".
  if (cp.length === 2 && cp.every((c) => c >= 0x1f1e6 && c <= 0x1f1ff)) {
    return cp.map((c) => String.fromCharCode(c - 0x1f1e6 + 97)).join('');
  }
  // Banderas de subdivisión (Inglaterra/Escocia/Gales): 🏴 + tags.
  if (cp[0] === 0x1f3f4 && cp.length > 2) {
    const tag = cp
      .slice(1)
      .filter((c) => c >= 0xe0061 && c <= 0xe007a)
      .map((c) => String.fromCodePoint(c - 0xe0000))
      .join('');
    if (tag.startsWith('gbeng')) return 'gb-eng';
    if (tag.startsWith('gbsct')) return 'gb-sct';
    if (tag.startsWith('gbwls')) return 'gb-wls';
  }
  return null;
}

// HTML de bandera: <img> si es convertible, si no el emoji/texto original.
export function flagHtml(emoji, cls = 'flag') {
  const iso = emojiToIso(emoji);
  if (iso) {
    return `<img class="${cls} flag-img" src="https://flagcdn.com/h40/${iso}.png" srcset="https://flagcdn.com/h80/${iso}.png 2x" alt="" loading="lazy">`;
  }
  return `<span class="${cls}">${emoji || '🏳️'}</span>`;
}
