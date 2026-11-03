// Entry point: starts the puzzle, runs typed commands, wires up the input.

import { S, newGame } from './cluster.js';
import { tokenize, parse } from './args.js';
import { kubectl } from './commands/kubectl.js';
import { kGet } from './commands/get.js';
import { complete, pick } from './complete.js';
import { giveHint, status, win, isWon } from './game.js';
import { outEl, out, err, note, echo, clear, showCompletions } from './terminal.js';

const inp = document.getElementById('cmd');
const history = [];
let hIdx = 0;

function start() {
  newGame();
  clear();
  note('Available kubectl commands: get, describe, top, set resources, delete');
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

function run(text) {
  echo(text);
  const tok = tokenize(text.trim());
  if (!tok.length) return;
  const [cmd] = tok;
  if (cmd === 'kubectl' || cmd === 'k') kubectl(tok.slice(1));
  else if (cmd === 'clear') clear();
  else if (cmd === 'hint') giveHint();
  else if (cmd === 'brief') note(document.querySelector('.brief').textContent);
  else if (cmd === 'reset' || cmd === 'restart') return start();
  else if (cmd === 'help') note('Use kubectl like you would on a real cluster. Implemented: get, describe, top, set resources, delete. Game commands: hint, brief, clear, reset.');
  else err(`bash: ${cmd}: command not found`);
  outEl.scrollTop = outEl.scrollHeight;
  status();
  if (!S.won && isWon()) win();
}

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
document.getElementById('resetbtn').addEventListener('click', () => { start(); inp.focus(); });
outEl.addEventListener('click', () => { if (!window.getSelection().toString()) inp.focus(); });

start();
inp.focus();
