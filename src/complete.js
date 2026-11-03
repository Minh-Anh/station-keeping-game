// Tab completion, bash-style: one match completes, several matches complete
// their common prefix, otherwise the options are listed.

import { S, NAMESPACES } from './cluster.js';
import { line } from './terminal.js';
import { parse, normType } from './args.js';

const VERBS = ['get', 'describe', 'top', 'set', 'delete'];
const TYPE_NAMES = ['pods', 'nodes', 'deployments', 'replicasets', 'daemonsets', 'events', 'services', 'namespaces'];

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

function candidates(parts) {
  const cur = parts[parts.length - 1];
  if (parts.length === 1) return ['kubectl', 'clear', 'hint', 'brief', 'reset'];
  if (!['kubectl', 'k'].includes(parts[0])) return [];

  const prev = parts[parts.length - 2];
  if (prev === '-n' || prev === '--namespace') return NAMESPACES;
  if (prev === '-o') return ['wide', 'name'];

  const done = parts.slice(1, -1);
  const pos = [];
  for (let i = 0; i < done.length; i++) {
    if (['-n', '-o', '-l', '-c'].includes(done[i])) { i++; continue; }
    if (!done[i].startsWith('-')) pos.push(done[i]);
  }
  const verb = pos[0];
  const scope = parse(done);
  const names = t => namesFor(t, scope.ns, scope.allNs);

  if (cur.startsWith('-')) {
    if (verb === 'set') return ['--requests=', '--limits=', '--containers=', '--help'];
    if (verb === 'get') return ['-o', '-n', '-A', '-l', '--show-labels', '--all-namespaces', '--help'];
    if (verb === 'delete') return ['-n', '-l', '--all', '--help'];
    return ['-n', '-A', '-l', '--help'];
  }
  if (!pos.length) return VERBS;
  if (verb === 'top') return pos.length === 1 ? ['node', 'pod'] : names(pos[1]);
  if (verb === 'set') return pos.length === 1 ? ['resources'] : pos.length === 2 ? ['deployment'] : pos.length === 3 ? names('deployment') : [];
  if (['get', 'describe', 'delete'].includes(verb)) return pos.length === 1 ? TYPE_NAMES : names(pos[1]);
  return [];
}

export function complete(inp) {
  const v = inp.value;
  const parts = v.split(/\s+/);
  if (parts[0] === '' && parts.length > 1) parts.shift();
  const cur = parts[parts.length - 1];
  const matches = [...new Set(candidates(parts))].filter(c => c.startsWith(cur));
  if (!matches.length) return;
  const base = v.slice(0, v.length - cur.length);

  if (matches.length === 1) {
    const m = matches[0];
    inp.value = base + m + (m.endsWith('=') ? '' : ' ');
    return;
  }
  let pre = matches[0];
  for (const m of matches) while (!m.startsWith(pre)) pre = pre.slice(0, -1);
  if (pre.length > cur.length) { inp.value = base + pre; return; }
  line(matches.join('   '), 'complete');
}
