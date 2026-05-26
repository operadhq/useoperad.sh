# Operad Cloud Backend Research

## Decision: TypeScript CLI + Elixir Backend + Cloudflare Infrastructure

```
TypeScript (@operad/core)          Elixir/Phoenix (backend)         Cloudflare (infra)
─────────────────────────          ────────────────────────         ──────────────────
CLI tool on npm                    Coordination + governance        Sandboxes (agent bodies)
Behaviors, event log format        Fork-tree supervision            Containers (Elixir host)
Local fork/diff via worker_threads GenServer per agent              R2, Queues, AI Gateway
Runs in Sandboxes (cloud mode)     Phoenix Channels (real-time)     Pages (dashboard + docs)
                                   Broadway (event streams)         Hyperdrive (Postgres pool)
```

**Principle:** TypeScript owns the developer experience (CLI, behaviors, local dev).
Elixir owns coordination (fork trees, governance evaluation, agent lifecycle).
Cloudflare owns infrastructure (sandboxes, storage, networking).

---

## Core Concept: Mind/Body Separation

- **Agent's mind** = Graph state + event log. Lives in Elixir GenServer + Postgres. Persistent. Survives sandbox death.
- **Agent's body** = Cloudflare Sandbox. Runs @operad/core, executes behaviors. Has filesystem, network, shell. Ephemeral and disposable.

The event log IS the agent. The sandbox is just a body it inhabits temporarily.

**This enables:**
- Sandbox dies → spin up new one, replay event log → agent resumes
- Fork a run → new sandbox + new GenServer, replay events to point X
- Diff two runs → compare event logs in Postgres (pure SQL)
- Agent needs GPU → swap sandbox config. Elixir doesn't care.
- Pause an agent → kill sandbox, keep event log. Resume anytime.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DEVELOPER LAYER (TypeScript)                               │
│                                                             │
│  @operad/core (npm):                                        │
│  ✅ Define behaviors (TypeScript functions)                 │
│  ✅ Event log format (append-only, portable JSON)           │
│  ✅ Local fork/diff (worker_threads for parallel explore)   │
│  ✅ Governance rules (same rules run local + cloud)         │
│  ✅ CLI: operad run | fork | diff | replay                 │
│                                                             │
│  Runs locally OR inside Cloudflare Sandbox                  │
└────────────────────────────┬────────────────────────────────┘
                             │ events (WebSocket)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  CLOUDFLARE SANDBOXES (agent bodies)                        │
│  GA April 2026 — full Linux environments                    │
│                                                             │
│  Per-agent sandbox:                                         │
│  ✅ Full filesystem (read/write/watch)                      │
│  ✅ Network (controlled egress, allow/deny lists)           │
│  ✅ Shell (exec commands, scripts, install packages)        │
│  ✅ Mount R2 as local filesystem                            │
│  ✅ Preview URLs for HTTP services                          │
│  ✅ @operad/core runs inside                                │
│                                                             │
│  SDK: getSandbox(env.Sandbox, 'agent-123')                  │
└────────────────────────────┬────────────────────────────────┘
                             │ events (Phoenix Channel)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ELIXIR/PHOENIX BACKEND (agent minds + coordination)        │
│  Runs in Cloudflare Container (Docker)                      │
│                                                             │
│  GenServer per agent (~2KB each):                           │
│  - Holds graph state in memory (hot cache)                  │
│  - Receives events from sandboxes via Phoenix Channels      │
│  - Persists to append-only event log (Postgres)             │
│  - Evaluates governance rules (intercept/approve/reject)    │
│  - Manages fork trees (supervision tree = fork tree)        │
│  - Broadcasts to dashboard + other agents                   │
│                                                             │
│  Fork-tree coordination:                                    │
│  - Agent hits decision point → GenServer spawns children    │
│  - Each child gets its own Sandbox + event log branch       │
│  - Parent monitors via supervision tree                     │
│  - Children complete → parent collects, compares, collapses │
│  - Crashed child → supervisor restarts or reports           │
│                                                             │
│  Broadway: event stream processing with backpressure        │
│  Horde: distributed agent registry across nodes             │
│  Oban: scheduled jobs (cron replacement)                    │
│  Ecto: Postgres ORM                                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  CLOUDFLARE SERVICES                                        │
│                                                             │
│  Pages      → operad.sh (docs + dashboard)       ✅ LIVE   │
│  R2         → file storage (mountable into sandboxes)       │
│  Hyperdrive → Postgres connection pooling                   │
│  AI Gateway → LLM proxy (cache, rate limit, cost track)     │
│  Queues     → event dispatch between services               │
│  KV         → config, feature flags, API key cache          │
│  Cron       → scheduled triggers                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Split

### TypeScript for developer experience

| Concern | Reasoning |
|---|---|
| Behaviors are code | Developers write behaviors in the language they already use |
| npm ecosystem | Access to every AI SDK, parser, API client |
| Same code local + cloud | `operad run` locally, `operad cloud run` in sandbox — same behaviors |
| Low barrier to entry | `npm install operad` — no Elixir knowledge needed to use Operad |

### Elixir for backend coordination

| Requirement | Why BEAM wins |
|---|---|
| Fork-tree supervision | Supervision tree maps 1:1 to fork tree. Child crashes → supervisor knows instantly. |
| Agent alive for hours/days | GenServer stays alive indefinitely, ~2KB per process |
| Millions concurrent | BEAM scheduler handles millions of lightweight processes |
| Governance evaluation | Pattern matching on events is native Elixir — governance rules are just match clauses |
| Real-time dashboard | Phoenix Channels / PubSub — broadcast fork-tree state to UI in real-time |
| Hot code reload | Update governance rules without killing running agents |
| Event stream processing | Broadway with backpressure — never overwhelm downstream |

### Cloudflare for infrastructure

| Concern | Why Cloudflare |
|---|---|
| Agent isolation | Sandboxes: hardware-isolated Linux per agent |
| Storage | R2 mountable as local filesystem inside sandbox |
| Networking | Internal network between Sandbox ↔ Container (sub-ms) |
| One bill | Sandboxes + Containers + Pages + R2 + Queues = 1 vendor |
| Edge distribution | Agents run close to users globally |

---

## Fork-Tree Architecture

The key insight: **BEAM supervision trees ARE fork trees.**

```
                     ┌─────────────────┐
                     │  Root GenServer  │
                     │  (agent CLM-9281)│
                     └────────┬────────┘
                              │ hits decision point at seq:10
                              │ "borderline risk score — explore both paths"
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ Fork A      │ │ Fork B      │ │ Fork C      │
    │ GenServer   │ │ GenServer   │ │ GenServer   │
    │ (approve)   │ │ (escalate)  │ │ (investigate│
    │             │ │             │ │  + re-score)│
    │ Sandbox A   │ │ Sandbox B   │ │ Sandbox C   │
    └──────┬──────┘ └─────────────┘ └──────┬──────┘
           │                               │ nested fork!
           │                    ┌──────────┼──────────┐
           │                    ▼          ▼          ▼
           │              ┌────────┐ ┌────────┐ ┌────────┐
           │              │ C1     │ │ C2     │ │ C3     │
           │              │ re-score│ │ re-score│ │ re-score│
           │              │ model-v2│ │ model-v3│ │ model-v4│
           │              └────────┘ └────────┘ └────────┘

Each fork:
  1. Copies parent event log up to fork point
  2. Gets its own GenServer (supervised by parent)
  3. Gets its own Sandbox (spawned by Elixir)
  4. Runs independently, emits events back to its GenServer
  5. Parent collects results when children complete
  6. Crashed fork → supervisor handles (restart or skip)
```

### Local CLI equivalent

```typescript
// Same fork logic, TypeScript, no Elixir needed
// operad fork --at seq:10 --explore approve,escalate,investigate

const forks = paths.map(path => {
  const worker = new Worker('./fork-worker.js', {
    workerData: { eventLog: log.slice(0, forkPoint), path }
  });
  return new Promise((resolve, reject) => {
    worker.on('message', resolve);
    worker.on('error', reject);
  });
});

const results = await Promise.allSettled(forks);
const comparison = diff(results);
```

---

## Sandbox ↔ Elixir Communication

```
Sandbox (@operad/core in TypeScript)
    → WebSocket to Elixir (Phoenix Channel)
    → graph.addObject()  → event → GenServer evaluates governance → persists + broadcasts
    → graph.query()      → request → GenServer responds from memory
    → behavior fires     → executes locally in sandbox
    → emits new events   → GenServer → may trigger fork, route to other agents
    → governance.block   → sandbox pauses execution, waits for human/rule resolution
```

---

## Governance Flow (Elixir-side)

```elixir
# Simplified governance evaluation in GenServer
def handle_cast({:event, event}, state) do
  case evaluate_rules(state.rules, event, state.graph) do
    :pass ->
      state = persist_event(state, event)
      broadcast(state.channel, event)
      {:noreply, state}

    {:escalate, target} ->
      state = persist_event(state, %{event | governance: :pending})
      route_to_human(target, event)
      {:noreply, state}

    {:block, reason} ->
      notify_sandbox(state.sandbox, {:blocked, reason})
      {:noreply, state}

    {:fork, paths} ->
      children = Enum.map(paths, fn path ->
        {:ok, pid} = DynamicSupervisor.start_child(
          state.fork_supervisor,
          {AgentFork, %{parent: self(), event_log: state.log, fork_at: event.seq, path: path}}
        )
        pid
      end)
      {:noreply, %{state | pending_forks: children}}
  end
end
```

---

## Timeline

| Phase | What |
|---|---|
| **Now** | Ship @operad/core as CLI tool on npm. operad.sh live on Pages. Local fork/diff with worker_threads. |
| **Early cloud** | Elixir/Phoenix in Cloudflare Container. Postgres via Hyperdrive. GenServer per agent. Basic sandbox integration. |
| **Governance** | Governance rules engine (same rules local + cloud). Intercept/approve/reject/fork. Dashboard via Phoenix PubSub. |
| **Fork trees** | Fork-tree supervision. Nested forks. Branch comparison UI. Counterfactual exploration. |
| **Scale** | Multi-node BEAM clustering via Horde. Broadway for event streams. AI Gateway for LLM cost control. |

---

## Key Elixir Libraries

| Library | Purpose |
|---------|---------|
| **Phoenix** | HTTP API + WebSocket Channels (sandbox ↔ backend) |
| **Phoenix.PubSub** | Real-time event broadcast (dashboard, inter-agent) |
| **Broadway** | Event stream processing with backpressure |
| **Ecto** | Postgres ORM, migrations, event log queries |
| **Horde** | Distributed process registry (agents across nodes) |
| **DynamicSupervisor** | Fork-tree management (spawn/monitor/collect child agents) |
| **Oban** | Background jobs, scheduled triggers |

---

## Process Models: Elixir vs Cloudflare

### Elixir/BEAM: Processes all the way down

One BEAM VM runs inside one container. Inside that VM: millions of processes.
Each process is ~2KB. The BEAM scheduler preemptively switches between them.
Processes form trees — parents supervise children, children can supervise grandchildren.

```
┌─ BEAM VM (one Cloudflare Container) ──────────────────────────────────────┐
│                                                                           │
│  Application Supervisor (root)                                            │
│  ├── AgentSupervisor (DynamicSupervisor)                                  │
│  │   ├── Agent "CLM-001" (GenServer)           ← 2KB, holds graph state  │
│  │   │   ├── GovernanceEval (GenServer)         ← evaluates rules        │
│  │   │   ├── SandboxConn (GenServer)            ← WebSocket to sandbox   │
│  │   │   └── ForkSupervisor (DynamicSupervisor) ← manages fork children  │
│  │   │       ├── Fork-A (GenServer)             ← exploring "approve"    │
│  │   │       │   ├── SandboxConn-A              ← its own sandbox        │
│  │   │       │   └── ForkSupervisor-A           ← can nest further!     │
│  │   │       │       ├── Fork-A1 (GenServer)    ← sub-exploration       │
│  │   │       │       └── Fork-A2 (GenServer)    ← sub-exploration       │
│  │   │       ├── Fork-B (GenServer)             ← exploring "escalate"  │
│  │   │       │   └── SandboxConn-B                                       │
│  │   │       └── Fork-C (GenServer)             ← exploring "re-score"  │
│  │   │           └── SandboxConn-C                                       │
│  │   │                                                                    │
│  │   ├── Agent "CLM-002" (GenServer)            ← completely independent │
│  │   │   ├── GovernanceEval                                               │
│  │   │   ├── SandboxConn                                                  │
│  │   │   └── ForkSupervisor                                              │
│  │   │                                                                    │
│  │   ├── Agent "CLM-003" ...                                             │
│  │   ├── Agent "CLM-004" ...                                             │
│  │   │   ...                                                              │
│  │   └── Agent "CLM-999999" ...                 ← 1 million agents, ~2GB │
│  │                                                                        │
│  ├── BroadwaySupervisor                         ← event stream pipeline  │
│  │   ├── Producer (reads from Queue)                                      │
│  │   ├── Processor-1                                                      │
│  │   ├── Processor-2                                                      │
│  │   └── Processor-N (backpressure-controlled)                           │
│  │                                                                        │
│  ├── Phoenix.PubSub                             ← broadcast to dashboard │
│  └── Oban (background jobs)                     ← scheduled tasks        │
│                                                                           │
│  Total: ~2,000,000 processes, ~4GB RAM, ONE container                    │
│                                                                           │
│  Key behaviors:                                                           │
│  • Fork-A crashes → ForkSupervisor restarts ONLY Fork-A                  │
│  • Agent CLM-002 crashes → AgentSupervisor restarts ONLY CLM-002         │
│  • All other agents, forks, connections: completely unaffected            │
│  • Parent GenServer gets {:DOWN, pid, reason} instantly when child dies   │
│  • Nested forks: natural — ForkSupervisor inside ForkSupervisor          │
│  • Message passing between any processes: direct, in-memory, ~μs         │
└───────────────────────────────────────────────────────────────────────────┘
```

### Cloudflare (no Elixir): Durable Objects as "processes"

Each Durable Object is an independent JavaScript isolate. No parent/child relationship.
No supervision. No shared memory. Communication via HTTP fetch() or WebSocket.

```
┌─ Cloudflare Edge Network ─────────────────────────────────────────────────┐
│                                                                           │
│  Each Durable Object runs in its own isolate. They don't know about      │
│  each other unless you explicitly wire them together.                     │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │ DO: agent-CLM-001│  │ DO: agent-CLM-002│  │ DO: agent-CLM-003│  ...   │
│  │                  │  │                  │  │                  │        │
│  │ 128MB RAM max    │  │ 128MB RAM max    │  │ 128MB RAM max    │        │
│  │ Single JS thread │  │ Single JS thread │  │ Single JS thread │        │
│  │ SQLite (local)   │  │ SQLite (local)   │  │ SQLite (local)   │        │
│  │ WebSocket ✅     │  │ WebSocket ✅     │  │ WebSocket ✅     │        │
│  │ Hibernates idle  │  │ Hibernates idle  │  │ Hibernates idle  │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
│          │                                                                │
│          │ governance says: FORK                                          │
│          │                                                                │
│          │ must create new DOs via Worker:                                │
│          ▼                                                                │
│  ┌──────────────────┐                                                     │
│  │ Worker (stateless)│  ← 30s max, creates the fork DOs                  │
│  │                  │                                                     │
│  │ const forkA =    │                                                     │
│  │   env.AGENT.get( │                                                     │
│  │   env.AGENT.idFromName('CLM-001-fork-a'))                             │
│  │                  │                                                     │
│  │ await forkA.fetch('/init', { body: eventLog })                        │
│  │ await forkB.fetch('/init', { body: eventLog })                        │
│  │ await forkC.fetch('/init', { body: eventLog })                        │
│  │                  │  ← Worker dies after creating forks                │
│  └──────────────────┘                                                     │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │ DO: fork-A       │  │ DO: fork-B       │  │ DO: fork-C       │        │
│  │ (approve path)   │  │ (escalate path)  │  │ (re-score path)  │        │
│  │                  │  │                  │  │                  │        │
│  │ No link to parent│  │ No link to parent│  │ No link to parent│        │
│  │ No crash notify  │  │ No crash notify  │  │ No crash notify  │        │
│  │ Can't nest forks │  │ Can't nest forks │  │ Can't nest forks │        │
│  │ easily           │  │ easily           │  │ easily           │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
│                                                                           │
│  Collecting results:                                                      │
│  ┌──────────────────────────────────────────────────────────┐             │
│  │ Option A: Parent DO polls children via fetch()           │             │
│  │   setInterval(() => {                                    │             │
│  │     const a = await forkA.fetch('/status')  // HTTP hop  │             │
│  │     const b = await forkB.fetch('/status')  // HTTP hop  │             │
│  │     const c = await forkC.fetch('/status')  // HTTP hop  │             │
│  │     if (allDone(a, b, c)) collapse(a, b, c)             │             │
│  │   }, 5000)                                               │             │
│  │                                                          │             │
│  │ Option B: Children write to shared D1 database           │             │
│  │   // Each fork writes result to D1 when done             │             │
│  │   // Parent polls D1 table                               │             │
│  │   // No push notification — only pull                    │             │
│  │                                                          │             │
│  │ Option C: Queue messages                                 │             │
│  │   // Each fork sends message to Queue when done          │             │
│  │   // Worker consumes queue, checks if all forks done     │             │
│  │   // Worker has 30s limit — what if forks take 10min?    │             │
│  │                                                          │             │
│  │ Problem: fork-B crashes silently.                        │             │
│  │ Parent doesn't know. Polls forever. Or times out.        │             │
│  │ No restart. No crash reason. Just... gone.               │             │
│  └──────────────────────────────────────────────────────────┘             │
│                                                                           │
│  Nested forks: fork-A wants to explore 3 sub-paths?                      │
│  fork-A must call Worker to create 3 more DOs.                           │
│  Worker has 30s limit. Each sub-fork is another independent DO.          │
│  Tracking the tree requires a custom registry (D1 table? KV?).          │
│  3 levels deep = you're building a process scheduler in JS.              │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Direct equivalence table

```
 Elixir concept              Cloudflare equivalent          Gap
 ──────────────              ─────────────────────          ────────────────

 Process (2KB)               Durable Object (isolate)       DO is 1000x heavier
                                                            (own V8 instance,
                                                            128MB limit, hibernates)

 GenServer                   DO class with fetch()          Similar — both hold state
                             handler                        and respond to messages

 Supervisor                  ❌ Nothing                     You build it yourself.
                                                            There is no parent/child
                                                            relationship between DOs.

 DynamicSupervisor           ❌ Nothing                     Worker can spawn DOs but
 (spawn children on demand)  (Worker spawns DOs, then dies) Worker dies — who watches
                                                            the children?

 monitor(child_pid)          ❌ Nothing                     DO crash = silent.
                                                            No notification system.
                                                            Poll or timeout.

 {:DOWN, pid, reason}        ❌ Nothing                     No crash reason propagation.
 (crash notification)                                       fetch() throws if DO is dead
                                                            but only when you call it.

 send(pid, message)          await do.fetch('/msg', body)   HTTP round-trip (~1-5ms)
 (in-memory, ~μs)                                          vs in-memory (~μs).
                                                            1000x latency difference.

 Process.list()              ❌ No registry                 DOs are addressable by ID
 (see all running processes) (unless you build one in KV)   but no list/enumerate.

 :observer                   ❌ Nothing built-in            Cloudflare dashboard shows
 (visual process inspector)                                 DO count, not individual
                                                            process state/hierarchy.

 Supervision tree            ❌ Flat namespace               All DOs are peers.
 (hierarchical)              (all DOs are equal)            No hierarchy. No tree.

 Hot code reload             ❌ Redeploy                    New code = new DO instances
                                                            after next hibernation cycle.

 Broadway (backpressure      Queue consumer (Worker)        Worker has 30s limit.
 stream processing)                                         Long-running stream
                                                            processing needs Cron +
                                                            batch pattern.

 Phoenix PubSub              ❌ Build with WebSocket +      No native pub/sub between
 (broadcast to many)         Queue fan-out                  DOs. Each connection is
                                                            point-to-point.
```

### What this means for Operad

```
Scenario: 100 insurance claims processing concurrently.
          Each agent may fork 3 paths. Some forks nest 2 levels deep.

With Elixir (one container):
  100 agent GenServers
  + 100 governance evaluators
  + 100 sandbox connections
  + ~150 fork GenServers (not all fork)
  + ~50 nested fork GenServers
  = ~500 processes, ~1MB RAM
  All supervised. Any crash → instant restart. Parent always knows.
  Communication: in-memory message passing, microseconds.
  Cost: one container, $5-30/mo.

With Cloudflare DOs:
  100 agent DOs
  + ~150 fork DOs
  + ~50 nested fork DOs
  = 300 Durable Objects (300 separate V8 isolates)
  No supervision. Crash = silent. Parent polls.
  Communication: HTTP fetch between DOs, milliseconds.
  Fork tree tracking: custom D1 table you maintain.
  Nested fork coordination: custom code, fragile.
  Cost: per-request pricing. Cheap at low volume, unpredictable at high.
```

---

## Decision Rationale: Why Elixir Won

### The journey

```
Started here:  "Should we use Cloudflare for everything?"
                         │
Explored:      Durable Objects as agent brains
               Workers for coordination
               D1 for event logs
                         │
Realized:      DOs have no supervision, no hierarchy, no crash notification.
               Fork trees require rebuilding a process scheduler in JS.
               435,000 DOs cost $228-7,000/mo. 435,000 GenServers cost $5/mo.
                         │
Checked:       Supabase runs Elixir in Docker on AWS ECS at massive scale.
               Docker doesn't nerf BEAM — VM features work 100% inside containers.
               Cloudflare Containers run any Docker image (4 vCPU, 12GB RAM).
                         │
Landed here:   TypeScript (CLI) + Elixir (backend) + Cloudflare (infra)
```

### Why Elixir — the three things that sealed it

```
1. FORK TREES ARE SUPERVISION TREES
   BEAM's killer feature for Operad isn't concurrency — it's hierarchy.
   GenServer spawns children. Children can spawn grandchildren.
   Parent monitors children automatically. Crash = instant notification.
   This IS fork-tree coordination. No custom code needed.

2. $5 FOR 435,000 AGENTS
   Each GenServer = 2KB. One container holds hundreds of thousands of
   agent brains in memory. Flat cost regardless of activity.
   DOs charge per-request — cost scales linearly with usage.
   At enterprise scale (1,000 companies), Elixir is 50-1,400x cheaper.

3. SUPABASE PROVED IT
   Elixir in Docker handling millions of concurrent WebSocket connections.
   On AWS ECS (same constraints as Cloudflare Containers).
   No BEAM clustering, no hot code reload — and it works fine.
   We're not pioneering anything. We're following a proven path.
```

### What we're NOT using Elixir for

```
❌ Developer-facing CLI          → TypeScript (@operad/core)
❌ Behavior definitions           → TypeScript (what developers write)
❌ Running inside sandboxes       → TypeScript (sandbox = Node.js)
❌ Dashboard UI                   → TypeScript (Cloudflare Pages)
❌ Event log format               → JSON (language-agnostic)

Elixir is invisible to Operad users. They never install it, never write it,
never configure it. It's the backend coordination layer that makes
governance, forks, and real-time dashboard work.
```

### Economics at scale

```
 1,000 companies × avg 435 agents = 435,000 agent brains

 ┌──────────────────────────────────────────────────────┐
 │                  Elixir          Durable Objects      │
 │  ────────────    ──────          ────────────────     │
 │  Infrastructure  $5-25/mo        $228-7,000/mo       │
 │  Per agent       $0.00001/mo     $0.0005-0.016/mo    │
 │  Per company     $0.005/mo       $0.23-7.00/mo       │
 │                                                      │
 │  Revenue per governed agent: $29/mo                   │
 │  Cost per agent brain (Elixir): $0.00001/mo          │
 │  Margin on coordination: 2,900,000x                   │
 │                                                      │
 │  Real costs are sandboxes (compute) + LLMs + Postgres │
 │  The coordination layer is essentially free.          │
 └──────────────────────────────────────────────────────┘
```

---

## References

- Cloudflare Sandboxes: https://developers.cloudflare.com/sandbox/
- Cloudflare Containers: https://developers.cloudflare.com/containers/
- Cloudflare Sandbox GA announcement (April 2026): https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/
- Elixir Cloudflare libraries: https://github.com/nshkrdotcom/cf_ex
