// Command-line parsing shared by all kubectl verbs: tokenizing, flags,
// resource-type aliases, and the common "not found" / "no resources" errors.

import { err, out, note, notSim } from './terminal.js';

// Long flags that take a value as the next token when written without "=".
const VALUE_FLAGS = new Set(['requests', 'limits', 'containers', 'selector', 'output', 'namespace', 'replicas', 'sort-by', 'field-selector', 'tail']);

export function tokenize(s) {
  return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^(["'])(.*)\1$/, '$2'));
}

// "a | 'b|c' | d" -> ["a", "'b|c'", "d"]. A | inside quotes or after a backslash stays.
export function splitPipes(s) {
  const parts = [''];
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '\\') ch += s[++i] ?? '';
    else if (ch === '|') { parts.push(''); continue; }
    parts[parts.length - 1] += ch;
  }
  return parts.map(p => p.trim());
}

// The first shell operator outside quotes that this console doesn't run, if any.
export function shellOperator(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '\\') { i++; continue; }
    const two = s.slice(i, i + 2);
    if (['&&', '||', '>>', '$('].includes(two)) return two;
    if (';&><`'.includes(ch)) return ch;
  }
  return null;
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

// Real kubectl flags that aren't simulated. These shouldn't read as "unknown flag",
// which would tell someone who knows kubectl that they've misremembered.
const REAL_FLAGS = new Set(['watch', 'watch-only', 'no-headers', 'sort-by', 'field-selector', 'label-columns', 'context', 'cluster', 'kubeconfig', 'user', 'token', 'server', 'dry-run', 'server-side', 'field-manager', 'record', 'v', 'chunk-size', 'ignore-not-found', 'raw', 'template', 'filename', 'recursive', 'kustomize', 'show-kind', 'show-managed-fields', 'show-events', 'all-containers', 'since', 'since-time', 'timestamps', 'prefix', 'use-protocol-buffers', 'allow-missing-template-keys', 'request-timeout', 'cascade', 'timeout']);
const REAL_SHORT = 'wLvfkRs';

const SUPPORTED_FLAGS = {
  get: '-o wide|name, -n, -A, -l, --show-labels',
  describe: '-n, -A, -l',
  top: '-n, -A, -l',
  delete: '-n, -l, --all',
  logs: '-p, -c, -n, -l, --tail',
  set: '--requests, --limits, -c, -n'
};

function flagNotSimulated(flag, o) {
  const verb = o.pos[0];
  const supported = SUPPORTED_FLAGS[verb] ? ` Flags you can use with ${verb}: ${SUPPORTED_FLAGS[verb]}.` : '';
  const again = flag === '-w' || flag === '--watch' ? ' Run the command again to see the latest state.' : '';
  notSim(flag, `The command didn't run.${again}${supported}`);
}

export function badFlags(o, allowed = []) {
  if (o.short.length) {
    const f = o.short[0][0];
    if (REAL_SHORT.includes(f)) flagNotSimulated('-' + f, o);
    else err(`error: unknown shorthand flag: '${f}' in -${o.short[0]}`);
    return true;
  }
  const bad = Object.keys(o.flags).find(k => !allowed.includes(k));
  if (bad) {
    if (REAL_FLAGS.has(bad)) flagNotSimulated('--' + bad, o);
    else err(`error: unknown flag: --${bad}`);
    return true;
  }
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

// Real resource types the simulation has none of. "No resources found" is true in
// this cluster, and it lets a player rule out quotas, autoscalers and so on.
const EMPTY_TYPES = ['hpa', 'horizontalpodautoscaler', 'horizontalpodautoscalers', 'pdb', 'poddisruptionbudget', 'poddisruptionbudgets', 'limits', 'limitrange', 'limitranges', 'quota', 'resourcequota', 'resourcequotas', 'ing', 'ingress', 'ingresses', 'netpol', 'networkpolicy', 'networkpolicies', 'pvc', 'persistentvolumeclaim', 'persistentvolumeclaims', 'sts', 'statefulset', 'statefulsets', 'job', 'jobs', 'cj', 'cronjob', 'cronjobs'];
const EMPTY_CLUSTER_TYPES = ['pv', 'persistentvolume', 'persistentvolumes'];
// Real types that would exist on a real cluster, so "none" would be untrue.
const UNSIMULATED_TYPES = ['cm', 'configmap', 'configmaps', 'secret', 'secrets', 'sa', 'serviceaccount', 'serviceaccounts', 'ep', 'endpoints', 'endpointslice', 'endpointslices', 'crd', 'crds', 'customresourcedefinition', 'customresourcedefinitions', 'pc', 'priorityclass', 'priorityclasses', 'cs', 'componentstatus', 'componentstatuses', 'lease', 'leases', 'sc', 'storageclass', 'storageclasses', 'csr', 'role', 'roles', 'rolebinding', 'rolebindings', 'clusterrole', 'clusterroles', 'clusterrolebinding', 'clusterrolebindings'];

// The response when normType doesn't recognize a resource type.
export function unknownType(raw, o) {
  const t = String(raw).toLowerCase().split('.')[0];
  if (raw.includes(',')) return notSim('Listing several types at once', `Run one kubectl ${o.pos[0]} per type.`);
  if (t === 'all') return notSim(`kubectl ${o.pos[0]} all`, 'Ask for one type at a time: pods, deployments, replicasets, daemonsets or services.');
  if (EMPTY_TYPES.includes(t)) return noRes(o);
  if (EMPTY_CLUSTER_TYPES.includes(t)) return out('No resources found');
  if (UNSIMULATED_TYPES.includes(t)) return notSim(`The ${raw} resource type`, 'Types you can query here: pods, nodes, deployments, replicasets, daemonsets, events, services, namespaces.');
  err(`error: the server doesn't have a resource type "${raw}"`);
}
export const notFound = (type, n) => err(`Error from server (NotFound): ${GROUP[type] || type} "${n}" not found`);
