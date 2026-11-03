// Command-line parsing shared by all kubectl verbs: tokenizing, flags,
// resource-type aliases, and the common "not found" / "no resources" errors.

import { err, out } from './terminal.js';

// Long flags that take a value as the next token when written without "=".
const VALUE_FLAGS = new Set(['requests', 'limits', 'containers', 'selector', 'output', 'namespace', 'replicas', 'sort-by', 'field-selector']);

export function tokenize(s) {
  return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^(["'])(.*)\1$/, '$2'));
}

// Splits args into positionals (o.pos) and the flags the simulation understands.
// Unrecognized flags land in o.flags / o.short so each verb can reject them.
export function parse(args) {
  const o = { ns: 'default', allNs: false, out: '', all: false, help: false, labels: false, sel: null, containers: null, flags: {}, short: [], pos: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n') { o.ns = args[++i] || ''; continue; }
    if (a === '-A') { o.allNs = true; continue; }
    if (a === '-h') { o.help = true; continue; }
    if (a === '-o') { o.out = args[++i] || ''; continue; }
    if (a === '-l') { o.sel = args[++i] || ''; continue; }
    if (a === '-c') { o.containers = args[++i] || ''; continue; }
    // Attached short values: -nkube-system, -owide, -c=interceptor
    if (/^-[nolc]./.test(a) && !a.startsWith('--')) {
      const v = a.slice(2).replace(/^=/, '');
      ({ n: () => { o.ns = v; }, o: () => { o.out = v; }, l: () => { o.sel = v; }, c: () => { o.containers = v; } })[a[1]]();
      continue;
    }
    if (a.startsWith('--')) {
      let [k, v] = a.slice(2).split(/=(.*)/s);
      if (v === undefined && VALUE_FLAGS.has(k)) v = args[++i];
      switch (k) {
        case 'namespace': o.ns = v || ''; break;
        case 'all-namespaces': o.allNs = true; break;
        case 'output': o.out = v || ''; break;
        case 'all': o.all = true; break;
        case 'help': o.help = true; break;
        case 'show-labels': o.labels = true; break;
        case 'selector': o.sel = v || ''; break;
        case 'containers': o.containers = v || ''; break;
        default: o.flags[k] = v === undefined ? true : v;
      }
      continue;
    }
    if (a.startsWith('-') && a.length > 1) { o.short.push(a.slice(1)); continue; }
    o.pos.push(a);
  }
  return o;
}

export function badFlags(o, allowed = []) {
  if (o.short.length) { err(`error: unknown shorthand flag: '${o.short[0][0]}' in -${o.short[0]}`); return true; }
  const bad = Object.keys(o.flags).find(k => !allowed.includes(k));
  if (bad) { err(`error: unknown flag: --${bad}`); return true; }
  return false;
}

export const TYPES = {
  pods: ['po', 'pod', 'pods'],
  nodes: ['no', 'node', 'nodes'],
  deployments: ['deploy', 'deployment', 'deployments', 'deploy.apps', 'deployment.apps', 'deployments.apps'],
  replicasets: ['rs', 'replicaset', 'replicasets', 'replicaset.apps', 'replicasets.apps'],
  daemonsets: ['ds', 'daemonset', 'daemonsets', 'daemonset.apps', 'daemonsets.apps'],
  events: ['ev', 'event', 'events'],
  services: ['svc', 'service', 'services'],
  namespaces: ['ns', 'namespace', 'namespaces']
};

// How the API server names a resource in error messages.
const GROUP = { deployments: 'deployments.apps', replicasets: 'replicasets.apps', daemonsets: 'daemonsets.apps' };

export function normType(t) {
  t = (t || '').toLowerCase();
  for (const [k, v] of Object.entries(TYPES)) if (v.includes(t)) return k;
  return null;
}

// "pods x y" or "pod/x" -> { raw, type, names }
export function target(o) {
  const [, t, ...rest] = o.pos;
  if (!t) return null;
  if (t.includes('/')) {
    const [tt, nn] = t.split('/');
    return { raw: tt, type: normType(tt), names: [nn, ...rest] };
  }
  return { raw: t, type: normType(t), names: rest };
}

export const noRes = o => out(o.allNs ? 'No resources found' : `No resources found in ${o.ns} namespace.`);
export const notFound = (type, n) => err(`Error from server (NotFound): ${GROUP[type] || type} "${n}" not found`);
