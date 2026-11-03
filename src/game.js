// Puzzle layer: hints, the status bar, and the win debrief.

import { S, runningCount } from './cluster.js';
import { fmtCpu, fmtMem } from './format.js';
import { note, outEl } from './terminal.js';

const HINTS = [
  "The deck officer doesn't look at what drones use when he assigns hangar space. What does he look at?",
  'Compare kubectl top nodes with kubectl describe node <name>. Look for the "Allocated resources" section.',
  'What did the interceptor blueprint promise each drone would need? Check kubectl describe deployment interceptor, then kubectl set resources --help.'
];

export function giveHint() {
  if (S.hints >= HINTS.length) { note('No more hints. The last one points straight at the fix.'); return; }
  const d = note(`Hint ${S.hints + 1}/${HINTS.length}: ${HINTS[S.hints]}`);
  d.classList.add('hint');
  S.hints++;
  status();
}

export function status() {
  const run = runningCount();
  const chip = document.getElementById('status');
  chip.textContent = 'Interceptors running: ';
  const b = document.createElement('b');
  b.textContent = `${run}/${S.dep.replicas}`;
  chip.append(b);
  chip.classList.toggle('done', run === S.dep.replicas);
  document.getElementById('count').textContent = `${S.cmds} kubectl command${S.cmds === 1 ? '' : 's'}`;
  document.getElementById('hintbtn').textContent = `Hint (${S.hints}/${HINTS.length})`;
}

export const isWon = () => runningCount() === S.dep.replicas;

// Debrief: explain the mechanism, then comment on the request the player chose.
export function win() {
  S.won = true;
  const t = S.dep.tpl;
  const box = document.createElement('div');
  box.className = 'win';
  const h = document.createElement('h2');
  h.textContent = 'Sector 7 reinforced. 5/5 interceptors running.';
  box.append(h);
  const para = html => { const p = document.createElement('p'); p.innerHTML = html; box.append(p); };

  para('The scheduler places pods by their <b>requests</b>, not by what they use. Each interceptor requested 1 CPU and used about 100m. <code>kubectl top nodes</code> showed the carriers around 10% busy, while <code>kubectl describe node</code> showed 84% of their CPU reserved.');
  para('Each carrier had 1900m allocatable: 600m reserved by relay-agent and 1000m by one interceptor, leaving 300m. Across the fleet 900m sat unreserved, but no single carrier could take a 1000m drone.');

  const req = fmtCpu(t.cpuReq);
  if ((t.cpuReq || 0) < 100) para(`Your CPU request (<code>${req}</code>) is below the ~100m each drone actually uses. It schedules, but the scheduler is now packing carriers against a number that isn't true, and when a node runs short, pods using more than they requested are among the first to be evicted.`);
  else if (t.cpuReq <= 300) para(`Your CPU request (<code>${req}</code>) sits a little above observed usage, which leaves headroom without reserving capacity nobody uses.`);
  else para(`Your CPU request (<code>${req}</code>) fits, but it still reserves well over what each drone uses. In a bigger fleet, that gap is paid for in carriers.`);

  if ((t.memReq || 0) < 166) para(`Your memory request (<code>${fmtMem(t.memReq || 0)}</code>) is below the ~170–190Mi each drone uses. Memory can't be throttled, so under pressure these pods are eviction candidates.`);
  if (t.cpuLim != null || t.memLim != null) para('You also set limits. Limits cap what a container may use at runtime (CPU gets throttled, memory over the limit gets OOM-killed). The scheduler ignores them.');
  para('Prototype shortcut: this rollout happened instantly. A real Deployment replaces pods in batches, here up to 25% surge and 25% unavailable at a time.');

  const s = document.createElement('div');
  s.className = 'stats';
  s.textContent = `${S.cmds} kubectl commands · ${S.hints} hint${S.hints === 1 ? '' : 's'} · type reset to play again`;
  box.append(s);
  outEl.appendChild(box);
  outEl.scrollTop = outEl.scrollHeight;
}
