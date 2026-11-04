// Puzzle layer: titles, briefs, hints, the status bar, and the win debriefs.

import { S, now, r, intPods, runningCount, overloadState } from './cluster.js';
import { fmtCpu, fmtMem, age } from './format.js';
import { echo, line, out, note, outEl } from './terminal.js';

const DECK = {
  title: 'No Room on Deck',
  brief: "Command wants five interceptors on station. You scaled the <code>interceptor</code> deployment to 5 replicas a moment ago, but the new pods haven't launched. No new carriers are available. Get all five interceptors running.",
  hints: [
    "Try using one of the kubectl commands to get more information on the pods that aren't launching.",
    'kubectl describe gives you information about the resources requested by pods and allocated within nodes, while kubectl top will give you information about the resources actually used by pods and within nodes.',
    'What resources are required for each interceptor pod? Check kubectl describe deployment interceptor, then kubectl set resources --help.'
  ]
};

const OVERLOAD = {
  title: 'Information Overload',
  brief: "A raid has flooded Sector 7's sensor net with contacts. All five <code>interceptor</code> pods launched, but they keep dropping off station. No new carriers are available. Keep all five interceptors on station.",
  hints: [
    'Compare the RESTARTS column in kubectl get pods across a few runs. Then ask what happened to one of those containers the last time it stopped: kubectl describe pod.',
    "The logs stop mid-line because the process never got the chance to finish writing. Look at the container's Last State, then watch its memory between crashes with kubectl top pods.",
    "Each pod's memory climbs until it reaches the same number, and that number is in kubectl describe deployment interceptor. See kubectl set resources --help. You may need more than one attempt, because the raid's full memory use only shows once a pod survives long enough to reach it."
  ]
};

const current = () => (S.raid ? OVERLOAD : DECK);

// Puts the current puzzle's title and brief in the header.
export function showPuzzle() {
  const { title, brief } = current();
  document.querySelector('h1').textContent = title;
  document.querySelector('.brief').innerHTML = brief;
  document.getElementById('puzzle').value = S.raid ? '2' : '1';
}

export function giveHint() {
  const { hints } = current();
  if (S.hints >= hints.length) { note('No more hints. The last one points straight at the fix.'); return; }
  const d = note(`Hint ${S.hints + 1}/${hints.length}: ${hints[S.hints]}`);
  d.classList.add('hint');
  S.hints++;
  status();
}

let watchReady = null; // while the win cutscene plays, the chip follows its rows

export function status() {
  const run = watchReady ?? runningCount();
  const chip = document.getElementById('status');
  chip.textContent = S.raid ? 'Interceptors ready: ' : 'Interceptors running: ';
  const b = document.createElement('b');
  b.textContent = `${run}/${S.dep.replicas}`;
  chip.append(b);
  if (S.raid) {
    chip.append(S.won ? ' · holding' : ` · restarts: ${overloadState().restarts}`);
  }
  chip.classList.toggle('done', run === S.dep.replicas);
  document.getElementById('count').textContent = `${S.cmds} kubectl command${S.cmds === 1 ? '' : 's'}`;
  document.getElementById('hintbtn').textContent = `Hint (${S.hints}/${current().hints.length})`;
}

export const isWon = () => (S.raid ? overloadState().won : runningCount() === S.dep.replicas);

// A debrief box: returns a paragraph helper, and finish() adds the stats and buttons.
function debrief(heading) {
  const box = document.createElement('div');
  box.className = 'win';
  const h = document.createElement('h2');
  h.textContent = heading;
  box.append(h);
  const para = html => { const p = document.createElement('p'); p.innerHTML = html; box.append(p); };
  const finish = (statsText, action, label) => {
    const s = document.createElement('div');
    s.className = 'stats';
    s.textContent = statsText;
    box.append(s);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'winaction';
    btn.dataset.action = action;
    btn.textContent = label;
    box.append(btn);
    outEl.appendChild(box);
    outEl.scrollTop = outEl.scrollHeight;
  };
  return { para, finish };
}

const tally = () => `${S.cmds} kubectl command${S.cmds === 1 ? '' : 's'} · ${S.hints} hint${S.hints === 1 ? '' : 's'}`;

export function win() {
  S.won = true;
  if (S.raid) playWatch('Success! The crash loop is over, and your interceptors are coming back on station.', winOverload);
  else playWatch("Success! There's room on deck, and your interceptors are launching.", winDeck);
}

// Debrief: explain the mechanism, then comment on the request the player chose.
function winDeck() {
  const t = S.dep.tpl;
  const { para, finish } = debrief('Sector 7 reinforced. 5/5 interceptors running.');

  para('The scheduler places pods by their <b>requests</b>, not by what they use. Each interceptor requested 1000m of CPU and used about 100m. <code>kubectl top nodes</code> showed the carriers around 10% busy, while <code>kubectl describe node</code> showed 84% of their CPU reserved.');
  para('Each carrier had 1900m allocatable: 600m reserved by relay-agent and 1000m by one interceptor, leaving 300m. Across the fleet 900m sat unreserved, but no single carrier could take a 1000m drone.');

  const req = fmtCpu(t.cpuReq);
  if ((t.cpuReq || 0) < 100) para(`Your CPU request (<code>${req}</code>) is below the ~100m each drone actually uses. It schedules, but the scheduler is now packing carriers against a number that isn't true, and when a node runs short, pods using more than they requested are among the first to be evicted.`);
  else if (t.cpuReq <= 300) para(`Your CPU request (<code>${req}</code>) sits a little above observed usage, which leaves headroom without reserving capacity nobody uses.`);
  else para(`Your CPU request (<code>${req}</code>) fits, but it still reserves well over what each drone uses. In a bigger fleet, that gap is paid for in carriers.`);

  if ((t.memReq || 0) < 166) para(`Your memory request (<code>${fmtMem(t.memReq || 0)}</code>) is below the ~170–190Mi each drone uses. Memory can't be throttled, so under pressure these pods are eviction candidates.`);
  if (t.cpuLim != null || t.memLim !== 256) para('You also changed limits. Limits cap what a container may use at runtime (CPU gets throttled, memory over the limit gets OOM-killed). The scheduler ignores them.');

  finish(`${tally()} · type next to continue, or reset to replay`, 'next', 'Next: Information Overload');
}

// The player removed the memory limit or raised it far beyond the raid in 3a, so
// the crash loop can't happen. Explain that instead of overriding their settings.
export function winOverloadSkipped() {
  const t = S.dep.tpl;
  const { para, finish } = debrief('The raid hit. Nothing crashed.');
  para(t.memLim == null
    ? 'The next challenge was a raid that pushes each interceptor past its memory limit, but you removed that limit in the last puzzle, so nothing stopped them from using more memory. A container with no memory limit is only stopped when its whole carrier runs out.'
    : `The next challenge was a raid that pushes each interceptor past its memory limit, but your <code>${fmtMem(t.memLim)}</code> limit is far above what the raid needs.`);
  para('To see what happens otherwise, play again from the start and leave the memory limit at 256Mi.');
  finish('Puzzle skipped · type reset to play again', 'restart-all', 'Play again from the start');
}

// Win cutscene: an immediate success message, then a tidied-up `kubectl get pods -w`
// with one row per pod. Each row starts as ContainerCreating and changes to Running
// in place, one pod at a time (the real -w would print a new line for every change).
// Then the debrief. Controls stay disabled so nothing can interleave with the rows.
function playWatch(message, debriefFn) {
  const controls = ['cmd', 'hintbtn', 'resetbtn', 'puzzle'].map(id => document.getElementById(id));
  const pods = intPods().filter(p => p.hash === S.dep.hash).sort((a, b) => a.name.localeCompare(b.name));
  const nameW = Math.max(...pods.map(p => p.name.length)) + 3;
  const row = (name, ready, st, restarts, ageText) =>
    name.padEnd(nameW) + ready.padEnd(8) + st.padEnd(20) + restarts.padEnd(11) + ageText;
  const up = new Set();
  const podRow = p => row(p.name, up.has(p) ? '1/1' : '0/1', up.has(p) ? 'Running' : 'ContainerCreating', '0', age(now() - p.created));

  line(message, 'success');
  controls.forEach(c => { c.disabled = true; });
  watchReady = 0;
  status();
  echo('kubectl get pods -w');
  out(row('NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'));
  const rows = new Map(pods.map(p => [p, out(podRow(p))]));

  const finish = () => {
    watchReady = null;
    controls.forEach(c => { c.disabled = false; });
    status();
    debriefFn();
    document.getElementById('cmd').focus();
  };
  const reveal = p => {
    up.add(p);
    rows.forEach((el, pod) => { el.textContent = podRow(pod); }); // every row's AGE moves on too
    watchReady++;
    status();
  };
  const queue = [...pods].sort(() => Math.random() - 0.5);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    queue.forEach(reveal);
    return finish();
  }
  const step = () => {
    reveal(queue.shift());
    setTimeout(queue.length ? step : finish, 450 + r(350));
  };
  setTimeout(step, 700);
}

function winOverload() {
  const t = S.dep.tpl;
  const peak = Math.max(...S.pods.filter(p => p.app === 'interceptor').map(p => p.w));
  const { para, finish } = debrief('Sector 7 holding. 5/5 interceptors on station.');

  para(`Every contact the raid added took up memory. Each interceptor's working set grew to about <code>${fmtMem(peak)}</code>, past its limit. Memory can't be slowed down the way CPU can, so the kernel killed the process as soon as it needed more than the limit allowed. That's why <code>describe pod</code> showed <b>OOMKilled</b> and exit code 137 (128 + signal 9, SIGKILL), and why the logs looked normal until they stopped mid-line.`);
  para('Deleting pods reset the restart counter, but the replacements had the same limit and met the same raid. Between crashes, Kubernetes waited longer each time (10s, 20s, 40s, up to 5 minutes), which is the <b>CrashLoopBackOff</b> status.');
  para('Compare this with CPU: a container over its CPU limit is throttled. It runs slower and stays alive. Over a memory limit, it dies.');

  if (t.memLim == null) para('You removed the limit, which stops the crashes, but nothing now protects the carrier from a runaway pod. A memory leak would grow until the whole node ran short.');
  else if (t.memLim < peak * 1.1) para(`Your limit (<code>${fmtMem(t.memLim)}</code>) clears the current working set, but only just. A slightly bigger raid would bring the crash loop back.`);
  else if (t.memLim > peak * 3) para(`Your limit (<code>${fmtMem(t.memLim)}</code>) stops the crashes, but it's far above what the pods use, so a runaway pod could take a lot from its neighbours before being stopped.`);
  else para(`Your limit (<code>${fmtMem(t.memLim)}</code>) leaves room above the working set, without letting a runaway pod take over a carrier.`);

  if ((t.memReq || 0) < peak) para(`One thing left to fix: your memory request (<code>${fmtMem(t.memReq || 0)}</code>) is below what the pods now use. The scheduler still treats them as smaller than they are, so if a carrier runs short of memory, they're early candidates for eviction.`);
  else para(`You also raised the memory request (<code>${fmtMem(t.memReq)}</code>) to cover real usage, so the scheduler is working from an accurate number and these pods are safer if a carrier runs short.`);

  para('One more rule worth knowing: if you set a limit and no request, Kubernetes copies the limit into the request. A limit written without a request can leave a pod Pending, just like in No Room on Deck.');

  finish(`${tally()} · type reset to replay this puzzle, or reset all to start over`, 'restart-all', 'Play again from the start');
}
