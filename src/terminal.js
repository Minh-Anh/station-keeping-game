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

export function echo(cmd) {
  const d = document.createElement('div');
  d.className = 'ln c';
  const p = document.createElement('span');
  p.className = 'p';
  p.textContent = PROMPT;
  d.append(p, document.createTextNode(cmd));
  outEl.appendChild(d);
}
