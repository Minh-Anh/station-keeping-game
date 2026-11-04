# Station Keeping

A Kubernetes puzzle game prototype: real `kubectl` syntax against a small
simulated cluster. It has two connected puzzles about requests and limits on
the same `interceptor` Deployment.

### 1. No Room on Deck

The player has scaled a Deployment to 5 replicas and two pods are stuck
Pending. Node CPU usage looks low (~10%), but the scheduler places pods by
*requests*, and the requests are 10x actual usage. The fix is to right-size
them with `kubectl set resources`.

### 2. Information Overload

A raid hits the pods the player just fixed. Tracking the extra contacts pushes
each pod's working set past its 256Mi memory limit, so the kernel kills it
(`OOMKilled`, exit code 137) and it enters `CrashLoopBackOff`. Changing requests
or deleting pods doesn't help. The only fix is to raise or remove the memory
limit. The win is immediate once the limit clears the working set.

Both puzzles end with a cutscene: a success message, then a tidied-up
`kubectl get pods -w` showing the new pods come up one by one, then the debrief.

The puzzle selector below the terminal jumps straight here, starting from a
solved No Room on Deck with a 200m CPU request.

## Run it

ES modules don't load from `file://`, so serve the folder:

```sh
cd station-keeping-game
python3 serve.py
# open http://localhost:8766
```

`serve.py` is the standard Python file server, plus a header telling browsers not
to cache. With plain `python3 -m http.server`, a browser can mix an old
`index.html` with new scripts after an edit, and the terminal stays empty. The
header can't clear copies a browser already holds, so stick to a port that has
only ever been served by `serve.py`.

No build step and no dependencies.

## Files

| File | What it does |
|---|---|
| `serve.py` | Local dev server that disables browser caching |
| `index.html` | Page markup: brief, terminal pane, status bar |
| `styles.css` | Styles |
| `src/main.js` | Entry point: opening scene, command loop, keyboard handling |
| `src/cluster.js` | **The simulation.** Puzzle setup, scheduler, ReplicaSet reconcile, Deployment rollout, the raid and OOM crash loop |
| `src/args.js` | Tokenizing, flag parsing, resource-type aliases, shared NotFound errors |
| `src/format.js` | Quantity parse/format, kubectl's age format, column tables |
| `src/terminal.js` | Writing lines to the terminal (kubectl output vs. game notes) |
| `src/complete.js` | Tab completion, scoped by namespace, with display-only syntax examples |
| `src/game.js` | Puzzle titles and briefs, hints, status chip, win debriefs |
| `src/commands/kubectl.js` | Verb dispatcher and `kubectl` help |
| `src/commands/get.js` | `get` pods, nodes, deployments, replicasets, daemonsets, events, services, namespaces |
| `src/commands/describe.js` | `describe` pod, node, deployment, replicaset, daemonset |
| `src/commands/top.js` | `top node`, `top pod` (actual usage, the misleading view) |
| `src/commands/logs.js` | `logs`, including `--previous` |
| `src/commands/grep.js` | `kubectl ... \| grep` with `-i`, `-v`, `-c`, `-E`, `-e`, `-n`, `-w`, `-A`, `-B`, `-C` |
| `src/commands/shell.js` | Pointers for non-kubectl commands such as `ls`, `ssh` and `watch` |
| `src/commands/set.js` | `set resources` (the fix) |
| `src/commands/delete.js` | `delete pod` (replaced by the ReplicaSet); other deletes are RBAC-forbidden |

## Puzzle numbers

- 3 nodes, 1900m CPU allocatable each
- `relay-agent` DaemonSet (kube-system): requests 600m per node
- `interceptor` Deployment: requests 1000m, uses ~100m
- Per node: 1900 − 600 − 1000 = 300m free, so pods 4 and 5 don't fit anywhere
- `interceptor` also has a 256Mi memory limit, harmless at ~180Mi, which sets up the raid
- Raid: each pod's working set grows at 5–7Mi/s to about 395–420Mi (1.6× the limit, if the player raised it first)

## Known simplifications

- CPU always prints in millicores (`1000m`). Real kubectl prints whole cores as `1`.
- Rollouts replace all pods at once instead of in surge/unavailable batches.
- Pods go straight to Running once bound (no image pull or probes).
- The win cutscene updates one row per pod in place. Real `get pods -w` prints a new line for every change.
- Memory limits are only enforced during the raid. In No Room on Deck, a limit set below a pod's usage doesn't kill it.
- Node `Conditions` omits the heartbeat and transition-time columns.
- Only cpu and memory are modeled; `-o yaml`, `edit`, `apply`, `scale` etc. print "not simulated".

## Possible follow-up work

The guiding idea: let players look at almost anything, and limit what they can
change. A read that works lets someone rule out a wrong theory, while commands
that change things are what open up rabbit holes.

- **More `get` and `top` options:** `get all`, `get deploy,rs`, `--no-headers`, `--sort-by`, and `--field-selector status.phase=Pending`.
- **More shell basics:** `| head`, `| tail`, `| wc -l`, and `;` and `&&` between commands.
- **Quick read-only answers:** `version`, `config current-context`, `auth can-i`, and a real `api-resources` table. Today's errors tell players to run `api-resources`, and it only lists the types.
- **`explain` for resource fields:** just `pod.spec.containers.resources` and its children.
- **`-o yaml` for pods and deployments:** a common reflex for SREs. It's a bit larger than the others, and has to stay consistent with `describe`.
- **Bug: `top pod --containers`:** the flag is ignored and treated as taking a value, so it can swallow the next word. Real output adds a `POD` column.

Deliberately left out: `exec`, `edit`, `apply`, `create`, `scale`, `cordon`, `drain`, `taint`.
