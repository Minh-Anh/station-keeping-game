// kubectl set resources: the intended fix. Changing the Deployment's pod
// template produces a new template hash, which triggers a rollout.

import { S, USER, rollout } from '../cluster.js';
import { fmtCpu, fmtMem, parseCpu, parseMem, QTY_ERR } from '../format.js';
import { out, err, note, notSim } from '../terminal.js';
import { badFlags, normType, notFound, unknownType } from '../args.js';

const SET_HELP = 'Configure application resources.\n\n These commands help you make changes to existing application resources.\n\nAvailable Commands:\n  resources       Update resource requests/limits on objects with pod templates\n\nUsage:\n  kubectl set SUBCOMMAND [options]';

const SET_RES_HELP = `Specify compute resource requirements (CPU, memory) for any resource that defines a pod template.  If a pod is successfully scheduled, it is guaranteed the amount of resource requested, but may burst up to its specified limits.

 For each compute resource, if a limit is specified and a request is omitted, the request will default to the limit.

 Possible resources include (case insensitive): Use "kubectl api-resources" for a complete list of supported resources..

Examples:
  # Set a deployments nginx container cpu limits to "200m" and memory to "512Mi"
  kubectl set resources deployment nginx -c=nginx --limits=cpu=200m,memory=512Mi

  # Set the resource request and limits for all containers in nginx
  kubectl set resources deployment nginx --limits=cpu=200m,memory=512Mi --requests=cpu=100m,memory=256Mi

  # Remove the resource requests for resources on containers in nginx
  kubectl set resources deployment nginx --limits=cpu=0,memory=0 --requests=cpu=0,memory=0

Options:
    -c, --containers='*':
        The names of containers in the selected pod templates to change, all containers are selected by default - may use wildcards

    --limits='':
        The resource requirement limits for this container.  For example, 'cpu=200m,memory=512Mi'.

    --requests='':
        The resource requirement requests for this container.  For example, 'cpu=100m,memory=256Mi'.  Note that server side components may assign requests depending on the server configuration, such as limit ranges.

Usage:
  kubectl set resources (-f FILENAME | TYPE NAME)  ([--limits=LIMITS & --requests=REQUESTS] [options])`;

// "cpu=200m,memory=128Mi" -> { cpu: 200, memory: 128 } (millicores, MiB)
function parseRes(s) {
  const res = {};
  for (const kv of String(s).split(',')) {
    const [k, v] = kv.split('=');
    if (v === undefined || !k) return { error: `error: invalid resource requirement "${kv}", expected <name>=<quantity>` };
    if (k === 'cpu') {
      const q = parseCpu(v); if (q == null) return { error: QTY_ERR }; res.cpu = q;
    } else if (k === 'memory') {
      const q = parseMem(v); if (q == null) return { error: QTY_ERR }; res.memory = q;
    } else {
      return { error: `error: invalid resource name "${k}": only cpu and memory are simulated here` };
    }
  }
  return res;
}

export function kSet(o) {
  const sub = o.pos[1];
  if (!sub) return out(SET_HELP);
  if (sub !== 'resources') return notSim('kubectl set ' + sub, 'kubectl set resources is the set command you can use here.');
  if (o.help) return out(SET_RES_HELP);
  if (badFlags(o, ['requests', 'limits'])) return;

  const args = o.pos.slice(2);
  const MUST = 'error: one or more resources must be specified as <resource> <name> or <resource>/<name>';
  if (!args.length) return err(MUST);
  let kind, name;
  if (args[0].includes('/')) [kind, name] = args[0].split('/'); else [kind, name] = args;
  const type = normType(kind);
  if (!type) return unknownType(kind, o);
  if (!name) return err(MUST);

  const reqS = o.flags.requests, limS = o.flags.limits;
  if (!reqS && !limS) return err('error: you must specify an update to requests or limits (in the form of --requests/--limits)');

  // Off-limits targets, refused the way a real cluster would refuse them.
  if (type === 'daemonsets') {
    if (o.ns !== 'kube-system' || !['relay-agent', 'kube-proxy'].includes(name)) return notFound('daemonsets', name);
    return err(`Error from server (Forbidden): daemonsets.apps "${name}" is forbidden: User "${USER}" cannot patch resource "daemonsets" in API group "apps" in the namespace "kube-system"`);
  }
  if (type === 'pods') return note("set resources changes pod templates (deployments, daemonsets, replicasets…). A running pod's requests can't be changed this way. Change the template that creates the pods.");
  if (type === 'replicasets') return note("A Deployment owns its ReplicaSets and would undo a change made here. Change the deployment's template instead.");
  if (type !== 'deployments') return notSim(`kubectl set resources ${kind}`);
  if (o.ns !== 'default' || name !== 'interceptor') return notFound('deployments', name);
  if (o.containers && !['*', 'interceptor'].includes(o.containers)) return err(`error: unable to find container named "${o.containers}"`);

  const t = { ...S.dep.tpl };
  if (limS) {
    const l = parseRes(limS);
    if (l.error) return err(l.error);
    if ('cpu' in l) t.cpuLim = l.cpu === 0 ? null : l.cpu; // 0 removes the limit
    if ('memory' in l) t.memLim = l.memory === 0 ? null : l.memory;
  }
  if (reqS) {
    const q = parseRes(reqS);
    if (q.error) return err(q.error);
    if ('cpu' in q) t.cpuReq = q.cpu;
    if ('memory' in q) t.memReq = q.memory;
  }

  // API server validation: request must not exceed limit.
  if (t.cpuLim != null && t.cpuReq > t.cpuLim) {
    return err(`The Deployment "interceptor" is invalid: spec.template.spec.containers[0].resources.requests: Invalid value: "${fmtCpu(t.cpuReq)}": must be less than or equal to cpu limit`);
  }
  if (t.memLim != null && t.memReq > t.memLim) {
    return err(`The Deployment "interceptor" is invalid: spec.template.spec.containers[0].resources.requests: Invalid value: "${fmtMem(t.memReq)}": must be less than or equal to memory limit`);
  }

  out('deployment.apps/interceptor resource requirements updated');
  rollout(t);
}
