// Top-level kubectl dispatcher.

import { S } from '../cluster.js';
import { out, err, note, notSim } from '../terminal.js';
import { parse, normType } from '../args.js';
import { kGet } from './get.js';
import { kDescribe } from './describe.js';
import { kTop } from './top.js';
import { kSet } from './set.js';
import { kDelete } from './delete.js';
import { kLogs } from './logs.js';

const HELP = `kubectl controls the Kubernetes cluster manager.

 Find more information at: https://kubernetes.io/docs/reference/kubectl/

Commands available in this simulation:
  get           Display one or many resources
  describe      Show details of a specific resource or group of resources
  top           Display resource (CPU/memory) usage
  logs          Print the logs for a container in a pod
  set           Set specific features on objects
  delete        Delete resources by file names, stdin, resources and names, or by resources and label selector

Usage:
  kubectl [flags] [options]

Use "kubectl <command> --help" for more information about a given command.`;

const SIMULATED = ['get', 'describe', 'top', 'logs', 'set', 'delete'];

// Real kubectl verbs that this prototype doesn't implement. They get a plain
// "not simulated" note instead of an "unknown command" error.
const KNOWN = ['create', 'expose', 'run', 'explain', 'edit', 'rollout', 'scale', 'autoscale', 'certificate', 'cluster-info', 'cordon', 'uncordon', 'drain', 'taint', 'attach', 'exec', 'port-forward', 'proxy', 'cp', 'auth', 'debug', 'events', 'diff', 'apply', 'patch', 'replace', 'wait', 'kustomize', 'label', 'annotate', 'completion', 'api-resources', 'api-versions', 'config', 'plugin', 'version'];

// Where to go instead of a verb that isn't simulated. These close off tangents
// without giving away a fix.
const CHANGE = "To change a deployment's requests or limits, use kubectl set resources.";
const NOTHING_NEW = 'Everything you need is already deployed.';
const NODES = 'Carrier settings are outside this job.';
const NO_SHELL = 'You inspect pods from outside here, with kubectl describe and kubectl top.';
const ONE_CLUSTER = 'There is one cluster and one operator account here.';
const VERB_HINTS = {
  scale: 'Command wants five interceptors on station, so the replica count stays where it is.',
  autoscale: 'Command wants five interceptors on station, so the replica count stays where it is.',
  rollout: 'kubectl get deployment and kubectl describe deployment show how a rollout went.',
  edit: CHANGE, patch: CHANGE, apply: CHANGE, replace: CHANGE, diff: CHANGE, kustomize: CHANGE,
  create: NOTHING_NEW, run: NOTHING_NEW, expose: NOTHING_NEW,
  cordon: NODES, uncordon: NODES, drain: NODES, taint: NODES,
  label: 'You won\'t need to change labels or annotations.', annotate: 'You won\'t need to change labels or annotations.',
  exec: NO_SHELL, attach: NO_SHELL, 'port-forward': NO_SHELL, cp: NO_SHELL, debug: NO_SHELL, proxy: NO_SHELL,
  wait: 'Run kubectl get again to see the latest state.',
  events: 'Try kubectl get events.',
  explain: 'kubectl set resources --help explains requests and limits.',
  'api-resources': 'Types you can query here: pods, nodes, deployments, replicasets, daemonsets, events, services, namespaces.',
  version: 'The carriers run Kubernetes v1.33.2.',
  config: ONE_CLUSTER, auth: ONE_CLUSTER, 'cluster-info': ONE_CLUSTER, 'api-versions': ONE_CLUSTER
};

const CONTROL_PLANE = /scheduler|apiserver|api-server|controller-manager|etcd/i;

// True when a command looks into or tries to change the kube-system pods.
function touchesFleetSystems(o) {
  const verb = o.pos[0];
  if (o.help || !verb || verb === 'help' || !(SIMULATED.includes(verb) || KNOWN.includes(verb))) return false;
  if (o.ns === 'kube-system') return true;
  const typeArg = o.pos[verb === 'set' ? 2 : 1] || '';
  if (o.allNs && ['pods', 'daemonsets'].includes(normType(typeArg.split('/')[0]))) return true;
  return o.pos.slice(1).some(a => /(^|\/)(relay-agent|kube-proxy)/.test(a));
}

// `piped` is the text of any pipeline stages, such as "grep scheduler".
export function kubectl(args, piped = '') {
  S.cmds++;
  const o = parse(args);
  dispatch(o);
  if (!o.help && CONTROL_PLANE.test([...o.pos.slice(1), piped].join(' '))) {
    note("The control plane is run by another crew and isn't visible from here. To see what the scheduler decided about a pod, read the events in kubectl describe pod.");
  } else if (touchesFleetSystems(o)) {
    note('Fleet systems in kube-system belong to another crew.');
  }
}

function dispatch(o) {
  const verb = o.pos[0];
  if (!verb) return out(HELP);
  switch (verb) {
    case 'logs': return kLogs(o);
    case 'get': return kGet(o);
    case 'describe': return kDescribe(o);
    case 'top': return kTop(o);
    case 'set': return kSet(o);
    case 'delete': return kDelete(o);
    case 'help': return out(HELP);
  }
  if (KNOWN.includes(verb)) return notSim('kubectl ' + verb, VERB_HINTS[verb]);
  err(`error: unknown command "${verb}" for "kubectl"`);
}
