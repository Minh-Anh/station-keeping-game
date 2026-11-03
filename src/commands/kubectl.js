// Top-level kubectl dispatcher.

import { S } from '../cluster.js';
import { out, err, note, notSim } from '../terminal.js';
import { parse, normType } from '../args.js';
import { kGet } from './get.js';
import { kDescribe } from './describe.js';
import { kTop } from './top.js';
import { kSet } from './set.js';
import { kDelete } from './delete.js';

const HELP = `kubectl controls the Kubernetes cluster manager.

 Find more information at: https://kubernetes.io/docs/reference/kubectl/

Commands available in this simulation:
  get           Display one or many resources
  describe      Show details of a specific resource or group of resources
  top           Display resource (CPU/memory) usage
  set           Set specific features on objects
  delete        Delete resources by file names, stdin, resources and names, or by resources and label selector

Usage:
  kubectl [flags] [options]

Use "kubectl <command> --help" for more information about a given command.`;

const SIMULATED = ['get', 'describe', 'top', 'set', 'delete'];

// Real kubectl verbs that this prototype doesn't implement. They get a plain
// "not simulated" note instead of an "unknown command" error.
const KNOWN = ['create', 'expose', 'run', 'explain', 'edit', 'rollout', 'scale', 'autoscale', 'certificate', 'cluster-info', 'cordon', 'uncordon', 'drain', 'taint', 'logs', 'attach', 'exec', 'port-forward', 'proxy', 'cp', 'auth', 'debug', 'events', 'diff', 'apply', 'patch', 'replace', 'wait', 'kustomize', 'label', 'annotate', 'completion', 'api-resources', 'api-versions', 'config', 'plugin', 'version'];

// True when a command looks into or tries to change the kube-system pods.
function touchesFleetSystems(o) {
  const verb = o.pos[0];
  if (o.help || !verb || verb === 'help' || !(SIMULATED.includes(verb) || KNOWN.includes(verb))) return false;
  if (o.ns === 'kube-system') return true;
  const typeArg = o.pos[verb === 'set' ? 2 : 1] || '';
  if (o.allNs && ['pods', 'daemonsets'].includes(normType(typeArg.split('/')[0]))) return true;
  return o.pos.slice(1).some(a => /(^|\/)(relay-agent|kube-proxy)/.test(a));
}

export function kubectl(args) {
  S.cmds++;
  const o = parse(args);
  dispatch(o);
  if (touchesFleetSystems(o)) note('Fleet systems in kube-system belong to another crew.');
}

function dispatch(o) {
  const verb = o.pos[0];
  if (!verb) return out(HELP);
  switch (verb) {
    case 'get': return kGet(o);
    case 'describe': return kDescribe(o);
    case 'top': return kTop(o);
    case 'set': return kSet(o);
    case 'delete': return kDelete(o);
    case 'help': return out(HELP);
  }
  if (KNOWN.includes(verb)) return notSim('kubectl ' + verb);
  err(`error: unknown command "${verb}" for "kubectl"`);
}
