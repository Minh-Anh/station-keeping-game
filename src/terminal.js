// Writing lines to the terminal pane. kubectl output (out/err) is styled
// differently from game messages (note) so players know what's real.

export const outEl = document.getElementById('out');
export const PROMPT = 'operator@sector-7 $ ';

export function line(text, cls) {
  const d = document.createElement('div');
  d.className = 'ln ' + cls;
  d.textContent = text;
  outEl.appendChild(d);
  outEl.scrollTop = outEl.scrollHeight;
  return d;
}

export const out = t => line(t, 'o');
export const err = t => line(t, 'e');
export const note = t => line(t, 'sim');
export const notSim = what => note(`${what} isn't simulated in this prototype.`);
export const clear = () => { outEl.textContent = ''; };

const trayEl = document.getElementById('completions');

// Replaces the completion tray. The example is display-only, never inserted.
export function showCompletions(items = [], example = null, empty = false) {
  trayEl.textContent = '';
  const add = (text, cls, tag = 'span') => {
    const s = document.createElement(tag);
    s.className = cls;
    s.textContent = text;
    if (tag === 'button') s.type = 'button';
    trayEl.append(s);
  };
  items.forEach(i => add(i, 'item', 'button'));
  if (example) add('e.g. ' + example, 'eg');
  if (empty) add('No completions', 'none');
}

export function echo(cmd) {
  const d = document.createElement('div');
  d.className = 'ln c';
  const p = document.createElement('span');
  p.className = 'p';
  p.textContent = PROMPT;
  d.append(p, document.createTextNode(cmd));
  outEl.appendChild(d);
}
