# Station Keeping

A Kubernetes puzzle game prototype: real `kubectl` syntax against a small
simulated cluster. It currently has one puzzle, "No Room on Deck".

The player has scaled a Deployment to 5 replicas and two pods are stuck
Pending. Node CPU usage looks low (~10%), but the scheduler places pods by
*requests*, and the requests are 10x actual usage. The fix is to right-size
them with `kubectl set resources`.

## Run it

ES modules don't load from `file://`, so serve the folder:

```sh
cd station-keeping-game
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no dependencies.

## Files

| File | What it does |
|---|---|
| `index.html` | Page markup: brief, terminal pane, status bar |
| `styles.css` | Styles |
| `src/main.js` | Entry point: opening scene, command loop, keyboard handling |
| `src/cluster.js` | **The simulation.** Puzzle setup, scheduler, ReplicaSet reconcile, Deployment rollout |
| `src/args.js` | Tokenizing, flag parsing, resource-type aliases, shared NotFound errors |
| `src/format.js` | Quantity parse/format, kubectl's age format, column tables |
| `src/terminal.js` | Writing lines to the terminal (kubectl output vs. game notes) |
| `src/complete.js` | Tab completion, scoped by namespace, with display-only syntax examples |
| `src/game.js` | Hints, status chip, win debrief |
| `src/commands/kubectl.js` | Verb dispatcher and `kubectl` help |
| `src/commands/get.js` | `get` pods, nodes, deployments, replicasets, daemonsets, events, services, namespaces |
| `src/commands/describe.js` | `describe` pod, node, deployment |
| `src/commands/top.js` | `top node`, `top pod` (actual usage, the misleading view) |
| `src/commands/set.js` | `set resources` (the fix) |
| `src/commands/delete.js` | `delete pod` (replaced by the ReplicaSet); other deletes are RBAC-forbidden |

## Puzzle numbers

- 3 nodes, 1900m CPU allocatable each
- `relay-agent` DaemonSet (kube-system): requests 600m per node
- `interceptor` Deployment: requests 1000m, uses ~100m
- Per node: 1900 − 600 − 1000 = 300m free, so pods 4 and 5 don't fit anywhere

## Known simplifications

- CPU always prints in millicores (`1000m`). Real kubectl prints whole cores as `1`.
- Rollouts replace all pods at once instead of in surge/unavailable batches.
- Pods go straight to Running once bound (no image pull, probes, or restarts).
- Node `Conditions` omits the heartbeat and transition-time columns.
- Only cpu and memory are modeled; `-o yaml`, `edit`, `apply`, `scale`, `logs` etc. print "not simulated".
