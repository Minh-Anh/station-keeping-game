// Tab completion, bash-style: one match completes, several matches complete
// their common prefix, and Tab on a finished word adds the space and shows the
// options for the next word. Options appear in the completion tray above the
// input and can be clicked.

import { S, NAMESPACES } from './cluster.js';
import { showCompletions } from './terminal.js';
import { parse, normType } from './args.js';

const VERBS = ['get', 'describe', 'top', 'set', 'delete'];
const TYPE_NAMES = ['pods', 'nodes', 'deployments', 'replicasets', 'daemonsets', 'events', 'services', 'namespaces'];
const SET_KINDS = ['deployment', 'daemonset', 'replicaset'];
const SET_FLAGS = ['--limits=', '--requests=', '--containers=', '--help'];
const VALUE_NEXT = ['-n', '-o', '-l', '-c', '--namespace', '--output', '--selector', '--containers', '--requests', '--limits'];

// Syntax examples, adapted from `kubectl set resources --help`. They are shown
// in the tray but never inserted, and stay away from CPU requests (the fix).
const EXAMPLE_FLAG = '--limits=memory=512Mi';
const EXAMPLE_VALUE = { '--limits': 'memory=512Mi', '--requests': 'memory=256Mi' };

// Names offered follow the same namespace scoping as the command itself.
function namesFor(type, ns = 'default', allNs = false) {
  const inNs = n => allNs || ns === n;
  switch (normType(type)) {
    case 'pods': return S.pods.filter(p => inNs(p.ns)).map(p => p.name);
    case 'nodes': return S.nodes.map(n => n.name);
    case 'deployments': return inNs('default') ? ['interceptor'] : [];
    case 'replicasets': return inNs('default') ? S.rs.map(x => 'interceptor-' + x.hash) : [];
    case 'daemonsets': return inNs('kube-system') ? ['kube-proxy', 'relay-agent'] : [];
    case 'namespaces': return NAMESPACES;
    default: return [];
  }
}

const splitParts = v => {
  const parts = v.split(/\s+/);
  if (parts[0] === '' && parts.length > 1) parts.shift();
  return parts;
};

// The words before the cursor: everything after `kubectl`, and the positionals.
function scan(parts) {
  const done = parts.slice(1, -1);
  const pos = [];
  for (let i = 0; i < done.length; i++) {
    if (VALUE_NEXT.includes(done[i])) { i++; continue; }
    if (!done[i].startsWith('-')) pos.push(done[i]);
  }
  return { done, pos };
}

// `set resources TYPE NAME` or `set resources TYPE/NAME` has named its target.
const setHasTarget = pos => pos.length >= 4 || (pos.length === 3 && pos[2].includes('/'));

const unusedSetFlags = done => SET_FLAGS.filter(f => !done.some(d => d.startsWith(f)));

function candidates(parts) {
  const cur = parts[parts.length - 1];
  if (parts.length === 1) return ['kubectl', 'clear', 'hint', 'brief', 'reset'];
  if (!['kubectl', 'k'].includes(parts[0])) return [];

  const prev = parts[parts.length - 2];
  if (prev === '-n' || prev === '--namespace') return NAMESPACES;
  if (prev === '-o') return ['wide', 'name'];
  if (prev === '--requests' || prev === '--limits') return [];

  const { done, pos } = scan(parts);
  const verb = pos[0];
  const scope = parse(done);
  const names = t => namesFor(t, scope.ns, scope.allNs).filter(n => !done.includes(n));

  if (cur.startsWith('-')) {
    if (cur.includes('=')) return [];
    if (verb === 'set') return unusedSetFlags(done);
    if (verb === 'get') return ['-o', '-n', '-A', '-l', '--show-labels', '--all-namespaces', '--help'];
    if (verb === 'delete') return ['-n', '-l', '--all', '--help'];
    return ['-n', '-A', '-l', '--help'];
  }
  if (!pos.length) return VERBS;
  if (verb === 'top') return pos.length === 1 ? ['node', 'pod'] : names(pos[1]);
  if (verb === 'set') {
    if (pos.length === 1) return ['resources'];
    if (pos.length === 2) return SET_KINDS;
    return setHasTarget(pos) ? unusedSetFlags(done) : names(pos[2]);
  }
  if (['get', 'describe', 'delete'].includes(verb)) return pos.length === 1 ? TYPE_NAMES : names(pos[1]);
  return [];
}

// The example to show for this input, if it has reached the resource flags.
function exampleFor(v) {
  const parts = splitParts(v);
  if (!['kubectl', 'k'].includes(parts[0]) || parts.length < 2) return null;
  const { pos } = scan(parts);
  if (pos[0] !== 'set' || pos[1] !== 'resources' || !setHasTarget(pos)) return null;
  const cur = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (cur === '' && EXAMPLE_VALUE[prev]) return EXAMPLE_VALUE[prev];
  if (cur.endsWith('=') && EXAMPLE_VALUE[cur.slice(0, -1)]) return EXAMPLE_VALUE[cur.slice(0, -1)];
  return cur === '' || (cur.startsWith('-') && !cur.includes('=')) ? EXAMPLE_FLAG : null;
}

// The current word and the options that match it.
function read(v) {
  const parts = splitParts(v);
  const cur = parts[parts.length - 1];
  const all = [...new Set(candidates(parts))];
  return { cur, all, base: v.slice(0, v.length - cur.length), matches: all.filter(c => c.startsWith(cur)) };
}

// With a finished word in place, show what can come after it.
function showNext(v) {
  showCompletions(read(v).matches, exampleFor(v));
}

function fill(inp, base, word) {
  inp.value = base + word + (word.endsWith('=') ? '' : ' ');
  showNext(inp.value);
}

export function complete(inp) {
  const v = inp.value;
  const { cur, all, base, matches } = read(v);

  if (matches.length === 1) {
    const m = matches[0];
    // Already at the end of the word, or a flag waiting for its value: move on.
    if (m === cur || m.endsWith('=')) return fill(inp, base, m);
    inp.value = base + m + ' ';
    return showCompletions(matches);
  }

  // A finished alias such as "svc" or "deploy" isn't a prefix of its full type name.
  if (!matches.length && cur && normType(cur) && all.some(c => normType(c) === normType(cur))) {
    return fill(inp, base, cur);
  }

  if (matches.length > 1) {
    let pre = matches[0];
    for (const m of matches) while (!m.startsWith(pre)) pre = pre.slice(0, -1);
    if (pre.length > cur.length) inp.value = base + pre;
  }
  const example = exampleFor(v);
  showCompletions(matches, example, !matches.length && !example);
}

// A clicked completion. If the input has moved on since the tray was drawn,
// the word may no longer fit, so refresh the tray instead of inserting it.
export function pick(inp, word) {
  const { base, matches } = read(inp.value);
  if (matches.includes(word)) fill(inp, base, word);
  else showNext(inp.value);
}
