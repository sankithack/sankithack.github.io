// Approximate English spelling -> Major System digits.
// Good enough to check that a word fits a number; pronunciation always wins in doubtful cases.

const LETTER = { s: '0', z: '0', t: '1', d: '1', n: '2', m: '3', r: '4', l: '5', j: '6', k: '7', q: '7', f: '8', v: '8', p: '9', b: '9' };

export function majorDecode(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  // Silent starts / ends.
  w = w.replace(/^kn/, 'n').replace(/^gn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's').replace(/mb$/, 'm');
  const out = [];
  let i = 0;
  let prev = ''; // last consonant letter group, so double letters count once
  const push = (digit, token) => {
    if (token === prev) return;
    out.push(digit);
    prev = token;
  };
  while (i < w.length) {
    const c = w[i];
    const two = w.slice(i, i + 2);
    const three = w.slice(i, i + 3);
    if (three === 'tch') { push('6', 'tch'); i += 3; continue; }
    if (two === 'sh' || two === 'ch' || two === 'dg') { push('6', two); i += 2; continue; }
    if (two === 'th') { push('1', 'th'); i += 2; continue; }
    if (two === 'ph') { push('8', 'ph'); i += 2; continue; }
    if (two === 'ck') { push('7', 'ck'); i += 2; continue; }
    if (two === 'gh') { prev = 'gh'; i += 2; continue; } // usually silent: light, night
    if (two === 'qu') { push('7', 'qu'); i += 2; continue; }
    if (c === 'c') {
      const soft = !!w[i + 1] && 'eiy'.includes(w[i + 1]);
      push(soft ? '0' : '7', soft ? 'cs' : 'ck');
      i++; continue;
    }
    if (c === 'g') {
      const soft = !!w[i + 1] && 'eiy'.includes(w[i + 1]); // wrong for get/give, hence "approximate"
      push(soft ? '6' : '7', soft ? 'gs' : 'g');
      i++; continue;
    }
    if (c === 'x') { push('7', 'x1'); out.push('0'); prev = 'x'; i++; continue; }
    if (LETTER[c]) { push(LETTER[c], c); i++; continue; }
    // vowels and w, h, y carry no value and break doubles
    prev = '';
    i++;
  }
  return out.join('');
}
