// Entry point: starts the puzzle, runs typed commands, wires up the input.

import { S, newGame, sync, enterOverload, skipToOverload, restartOverload, raidHasTarget, SKIP_CPU_REQUEST } from './cluster.js';
import { tokenize, parse, splitPipes, shellOperator } from './args.js';
import { kubectl } from './commands/kubectl.js';
import { buildPipeline } from './commands/grep.js';
import { shellCommand } from './commands/shell.js';
import { kGet } from './commands/get.js';
import { complete, pick } from './complete.js';
import { giveHint, status, win, winOverloadSkipped, isWon, showPuzzle } from './game.js';
import { outEl, out, err, note, echo, clear, capture, showCompletions } from './terminal.js';

const inp = document.getElementById('cmd');
const history = [];
let hIdx = 0;

function start() {
  newGame();
  showPuzzle();
  clear();
  note('Available kubectl commands: get, describe, top, logs, set resources, delete');
  // Opening scene: the player has just scaled up and is looking at the result.
  echo('kubectl scale deployment interceptor --replicas=5');
  out('deployment.apps/interceptor scaled');
  echo('kubectl get pods');
  kGet(parse(['get', 'pods']));
  history.length = 0;
  hIdx = 0;
  inp.value = '';
  showCompletions();
  status();
}

// Opening scene for Information Overload: the raid is already under way.
function openOverload(intro) {
  showPuzzle();
  clear();
  if (intro) note(intro);
  note('Available kubectl commands: get, describe, top, logs, set resources, delete');
  echo('kubectl get pods');
  kGet(parse(['get', 'pods']));
  history.length = 0;
  hIdx = 0;
  inp.value = '';
  showCompletions();
  status();
}

function next() {
  if (S.raid) return note('This is the last puzzle for now.');
  if (!S.won) return note('Get all five interceptors running first.');
  if (!isWon()) return note('Your last change took interceptors off station. Get all five running again first.');
  if (!raidHasTarget()) return winOverloadSkipped();
  enterOverload();
  openOverload();
}

// Restart the current puzzle. Information Overload keeps your No Room on Deck fix.
function restart() {
  if (!S.raid) return start();
  restartOverload();
  openOverload();
}

// `kubectl ... | grep ...`: runs kubectl with its stdout captured, then filters it.
function runPiped(tok, stages) {
  if (stages.includes('')) return err("bash: syntax error near unexpected token `|'");
  if (!['kubectl', 'k'].includes(tok[0])) return note('Pipes only work on kubectl commands here.');
  const filter = buildPipeline(stages.slice(1));
  if (!filter) return;
  const res = filter(capture(() => kubectl(tok.slice(1), stages.slice(1).join(' '))));
  if (res.length) out(res.join('\n'));
}

function run(text) {
  echo(text);
  sync();
  const op = shellOperator(text);
  if (op) {
    note(`This console runs one command at a time, so ${op} isn't simulated and the command didn't run. You can still filter output with | grep.`);
    outEl.scrollTop = outEl.scrollHeight;
    return;
  }
  const [first, ...stages] = splitPipes(text.trim());
  const tok = tokenize(first);
  if (!tok.length && !stages.length) return;
  const [cmd] = tok;
  if (stages.length) runPiped(tok, [first, ...stages]);
  else if (cmd === 'kubectl' || cmd === 'k') kubectl(tok.slice(1));
  else if (cmd === 'grep') note('grep reads from a pipe here, for example: kubectl get pods | grep Running');
  else if (cmd === 'clear') clear();
  else if (cmd === 'hint') giveHint();
  else if (cmd === 'brief') note(document.querySelector('.brief').textContent);
  else if (cmd === 'next') return next();
  else if (cmd === 'reset' || cmd === 'restart') return tok[1] === 'all' ? start() : restart();
  else if (cmd === 'help') note(`Use kubectl like you would on a real cluster. Implemented: get, describe, top, logs, set resources, delete. Filter kubectl output with | grep (-i, -v, -c, -E, -n, -w, -A, -B, -C). Game commands: hint, brief, clear, next, reset, reset all.`);
  else shellCommand(cmd);
  sync(); // a set resources or delete just changed the pods
  outEl.scrollTop = outEl.scrollHeight;
  status();
  if (!S.won && isWon()) win();
}

// During the raid, pods crash and recover whether or not the player types.
setInterval(() => {
  if (!S || !S.raid) return;
  sync();
  status();
  if (!S.won && isWon()) win();
}, 1000);

inp.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = inp.value;
    if (v.trim()) history.push(v);
    hIdx = history.length;
    inp.value = '';
    showCompletions();
    run(v);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    complete(inp);
  } else if (e.key === 'ArrowUp' && history.length) {
    e.preventDefault();
    hIdx = Math.max(0, hIdx - 1);
    inp.value = history[hIdx];
  } else if (e.key === 'ArrowDown' && history.length) {
    e.preventDefault();
    hIdx = Math.min(history.length, hIdx + 1);
    inp.value = history[hIdx] || '';
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    clear();
  }
});
const tray = document.getElementById('completions');
tray.addEventListener('mousedown', e => { if (e.target.closest('.item')) e.preventDefault(); }); // keep focus in the input
tray.addEventListener('click', e => {
  const item = e.target.closest('.item');
  if (item) { pick(inp, item.textContent); inp.focus(); }
});
document.getElementById('tabkey').addEventListener('click', () => { complete(inp); inp.focus(); });
document.getElementById('hintbtn').addEventListener('click', () => { giveHint(); inp.focus(); });
document.getElementById('resetbtn').addEventListener('click', () => { restart(); inp.focus(); });
document.getElementById('puzzle').addEventListener('change', e => {
  if (e.target.value === '2') {
    skipToOverload();
    openOverload(`Starting from a solved No Room on Deck, with the CPU request set to ${SKIP_CPU_REQUEST}m.`);
  } else {
    start();
  }
  inp.focus();
});
outEl.addEventListener('click', e => {
  const action = e.target.closest('.winaction')?.dataset.action;
  if (action === 'next') next();
  else if (action === 'restart-all') start();
  if (!window.getSelection().toString()) inp.focus();
});

start();
inp.focus();
