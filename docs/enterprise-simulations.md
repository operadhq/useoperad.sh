# Operad: Enterprise Versions & Use Case Simulations

## Product Tiers

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  OPEN SOURCE (MIT)          PRO ($)              ENTERPRISE ($$)    │
│  ─────────────────          ──────               ──────────────     │
│  Event log                  Cloud sandboxes      EU AI Act Art.12   │
│  Graph state                Shared graphs        Multi-tenant       │
│  Behaviors                  Governance rules     Retention policy   │
│  Causal chains              Fork + diff UI       Legal hold         │
│  CLI replay                 Dashboard            SSO / SCIM         │
│  Local fork/diff            Team collaboration   Audit export       │
│  npm install                Webhooks + alerts    RBAC on graphs     │
│                             Branch comparison    SLA + support      │
│                             Cost attribution     Compliance cert    │
│                                                                     │
│  "I build agents"           "I control agents"   "I prove agents    │
│                                                   did the right     │
│                                                   thing"            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Simulation 1: Insurance Claims Processing

**Buyer:** Mid-size carrier, 50K claims/year, 12 adjusters + 3 AI agents
**Tier:** Pro → Enterprise (regulated industry)
**Pain:** "We can't explain why the AI flagged this claim. The DOI auditor is asking."

### Event Log (single claim)

```jsonl
{"seq":1,  "t":"00:00.000", "type":"object.created",   "entity":"claim",      "data":{"id":"CLM-9281","type":"auto-collision","amount":47200}}
{"seq":2,  "t":"00:00.001", "type":"object.created",   "entity":"policy",     "data":{"id":"HO-3-8841","coverage":"comprehensive","limit":100000}}
{"seq":3,  "t":"00:00.012", "type":"behavior.fired",   "name":"claim-intake", "trigger":"claim.created","produced":["claimant"]}
{"seq":4,  "t":"00:00.045", "type":"object.created",   "entity":"claimant",   "data":{"id":"CLT-221","name":"M. Torres","history":"2 prior claims"}}
{"seq":5,  "t":"00:01.200", "type":"behavior.fired",   "name":"evidence-extraction","trigger":"claimant.created","produced":["evidence-1","evidence-2"]}
{"seq":6,  "t":"00:01.201", "type":"object.created",   "entity":"evidence",   "data":{"id":"EV-1","type":"police-report","source":"pdf-extract"}}
{"seq":7,  "t":"00:01.202", "type":"object.created",   "entity":"evidence",   "data":{"id":"EV-2","type":"repair-estimate","amount":52100}}
{"seq":8,  "t":"00:02.500", "type":"behavior.fired",   "name":"contradiction-check","trigger":"evidence.created","produced":["risk-flag"]}
{"seq":9,  "t":"00:02.501", "type":"object.created",   "entity":"risk-flag",  "data":{"id":"RF-1","flag":"estimate-exceeds-claim","severity":"medium","detail":"repair $52.1K > claimed $47.2K"}}
{"seq":10, "t":"00:03.800", "type":"behavior.fired",   "name":"risk-scoring", "trigger":"risk-flag.created","produced":["assessment"]}
{"seq":11, "t":"00:03.801", "type":"object.created",   "entity":"assessment", "data":{"id":"AS-1","score":0.34,"model":"fraud-detect-v3","factors":["estimate_mismatch:+0.12","prior_claims:+0.08","coverage_ratio:+0.14"]}}
{"seq":12, "t":"00:04.100", "type":"governance.check",  "rule":"score-threshold","input":0.34,"threshold":0.30,"result":"ESCALATE","reason":"Score 0.34 exceeds auto-approve threshold 0.30"}
{"seq":13, "t":"00:04.101", "type":"governance.routed", "to":"human-adjuster","agent":"adj-sarah","queue":"priority"}
{"seq":14, "t":"01:23.400", "type":"human.decision",   "agent":"adj-sarah",  "action":"approve-with-modification","note":"Estimate includes pre-existing damage. Adjusted to $41,800."}
{"seq":15, "t":"01:23.500", "type":"behavior.fired",   "name":"approval-gate","trigger":"human.decision","produced":["approval"]}
{"seq":16, "t":"01:23.501", "type":"object.created",   "entity":"approval",  "data":{"id":"AP-1","status":"approved","amount":41800,"modified":true}}
```

### Governance Rules (Pro tier)

```typescript
// governance.rules.ts
export const rules = [
  {
    id: "score-threshold",
    description: "Escalate to human if risk score exceeds threshold",
    when: (event) => event.type === "object.created" && event.entity === "assessment",
    check: (event) => event.data.score <= 0.30,
    onFail: { action: "ESCALATE", to: "human-adjuster" }
  },
  {
    id: "amount-cap",
    description: "Block auto-approval above $75K",
    when: (event) => event.type === "object.created" && event.entity === "approval",
    check: (event) => event.data.amount <= 75000,
    onFail: { action: "BLOCK", reason: "Amount exceeds auto-approval cap" }
  },
  {
    id: "evidence-minimum",
    description: "Require at least 2 evidence items before scoring",
    when: (event) => event.type === "behavior.fired" && event.name === "risk-scoring",
    check: (event, graph) => graph.query("evidence").length >= 2,
    onFail: { action: "BLOCK", reason: "Insufficient evidence for scoring" }
  }
]
```

### Fork Scenario: "What if we had approved without modification?"

```
Original timeline:  CLM-9281 → ... → adj-sarah approves at $41,800
                                        │
Fork at seq:14 ─────────────────────────┤
                                        │
Counterfactual:     CLM-9281 → ... → auto-approve at $47,200
                                        │
Diff: { amount: 41800 vs 47200, delta: +$5,400, modified: true vs false }
Result: Human intervention saved $5,400 on this claim.
Aggregate: Across 847 escalated claims this quarter, human review saved $2.1M.
```

**Enterprise value:** DOI auditor asks "why was this flagged?" → export event log seq 8-13 → complete causal chain from evidence contradiction to escalation rule to human decision.

---

## Simulation 2: Financial Services — Portfolio Rebalancing

**Buyer:** Wealth management firm, 200 advisors, AI agents managing model portfolios
**Tier:** Enterprise (SEC/FINRA regulated)
**Pain:** "SEC wants to know why the agent sold NVDA at 3am. We can't reconstruct the decision chain."

### Event Log (single rebalance)

```jsonl
{"seq":1,  "t":"03:00.000", "type":"trigger.cron",     "name":"portfolio-scan","schedule":"*/30 * * * *"}
{"seq":2,  "t":"03:00.012", "type":"object.created",   "entity":"portfolio",  "data":{"id":"PF-4420","client":"Reeves Trust","aum":2400000}}
{"seq":3,  "t":"03:00.100", "type":"behavior.fired",   "name":"drift-detection","trigger":"portfolio-scan","produced":["drift-report"]}
{"seq":4,  "t":"03:00.101", "type":"object.created",   "entity":"drift-report","data":{"id":"DR-1","ticker":"NVDA","target_pct":8,"actual_pct":14.2,"drift":6.2,"threshold":5.0}}
{"seq":5,  "t":"03:00.200", "type":"behavior.fired",   "name":"rebalance-proposal","trigger":"drift-report.created","produced":["trade-proposal"]}
{"seq":6,  "t":"03:00.201", "type":"object.created",   "entity":"trade-proposal","data":{"id":"TP-1","action":"SELL","ticker":"NVDA","shares":142,"est_value":19880,"reason":"drift exceeds 5% threshold"}}
{"seq":7,  "t":"03:00.210", "type":"governance.check",  "rule":"trading-hours","market":"NYSE","status":"CLOSED","result":"HOLD"}
{"seq":8,  "t":"03:00.211", "type":"governance.check",  "rule":"concentration-limit","ticker":"NVDA","portfolio_pct":14.2,"limit":15,"result":"PASS"}
{"seq":9,  "t":"03:00.212", "type":"governance.check",  "rule":"wash-sale","ticker":"NVDA","last_loss_sale":null,"result":"PASS"}
{"seq":10, "t":"03:00.213", "type":"governance.check",  "rule":"client-restrictions","client":"Reeves Trust","restricted_tickers":["META"],"result":"PASS"}
{"seq":11, "t":"03:00.220", "type":"governance.routed", "to":"market-open-queue","execute_after":"09:30:00 ET"}
{"seq":12, "t":"09:30.001", "type":"behavior.fired",   "name":"trade-execution","trigger":"market.open","produced":["execution"]}
{"seq":13, "t":"09:30.042", "type":"object.created",   "entity":"execution",  "data":{"id":"EX-1","ticker":"NVDA","shares":142,"price":139.20,"total":19766.40,"venue":"NYSE"}}
{"seq":14, "t":"09:30.043", "type":"object.created",   "entity":"audit-record","data":{"id":"AR-1","reg":"SEC-17a-4","retention":"6y","hash":"sha256:a8f2..."}}
```

### Governance Rules (Enterprise — SEC/FINRA)

```typescript
export const rules = [
  {
    id: "trading-hours",
    description: "Hold trades until market open",
    when: (event) => event.entity === "trade-proposal",
    check: (event) => isMarketOpen(event.data.ticker),
    onFail: { action: "HOLD", until: "market.open" }
  },
  {
    id: "wash-sale",
    description: "Block trades that would trigger wash sale (IRS 30-day rule)",
    when: (event) => event.entity === "trade-proposal" && event.data.action === "SELL",
    check: (event, graph) => !hasLossSaleWithin30Days(graph, event.data.ticker),
    onFail: { action: "BLOCK", reason: "Wash sale rule — loss sale within 30 days" }
  },
  {
    id: "concentration-limit",
    description: "Alert if single position exceeds 15% of portfolio",
    when: (event) => event.entity === "trade-proposal",
    check: (event, graph) => getPositionPct(graph, event.data.ticker) <= 15,
    onFail: { action: "ALERT", to: "compliance-team" }
  },
  {
    id: "sec-17a-4-retention",
    description: "All trade decisions retained for 6 years with tamper-evident hash",
    when: (event) => event.entity === "execution",
    effect: (event) => createAuditRecord(event, { reg: "SEC-17a-4", retention: "6y" })
  }
]
```

### Fork Scenario: "What if drift threshold was 3% instead of 5%?"

```
Original:    drift 6.2% > threshold 5.0% → SELL 142 shares → saved $2,800 in drift
                              │
Fork at seq:3 ────────────────┤ (change threshold to 3%)
                              │
Counterfactual: drift 6.2% > threshold 3.0% → SELL 142 shares (same trade, triggered earlier)
               + 47 additional rebalances this quarter that were below 5% but above 3%
               + $12,400 in additional trading costs
               + Tighter tracking but higher turnover

Diff: { additional_trades: 47, extra_cost: 12400, tracking_error_reduction: 0.3% }
Decision: Keep 5% threshold — cost of tighter tracking doesn't justify the improvement.
```

---

## Simulation 3: Healthcare — Clinical Decision Support

**Buyer:** Hospital system, 400 physicians, AI agents assisting with differential diagnosis
**Tier:** Enterprise (HIPAA + FDA regulated)
**Pain:** "A patient's family is suing. We need to prove the AI recommendation was clinically sound and the physician had full information."

### Event Log (single patient encounter)

```jsonl
{"seq":1,  "t":"00:00.000", "type":"object.created",   "entity":"encounter",  "data":{"id":"ENC-7742","patient":"[REDACTED-PHI]","dept":"emergency"}}
{"seq":2,  "t":"00:00.050", "type":"behavior.fired",   "name":"symptom-intake","trigger":"encounter.created","produced":["symptom-set"]}
{"seq":3,  "t":"00:00.051", "type":"object.created",   "entity":"symptom-set","data":{"id":"SS-1","symptoms":["chest-pain","dyspnea","diaphoresis"],"onset":"2h ago","severity":"8/10"}}
{"seq":4,  "t":"00:01.200", "type":"behavior.fired",   "name":"differential-generator","trigger":"symptom-set.created","produced":["differential"]}
{"seq":5,  "t":"00:01.201", "type":"object.created",   "entity":"differential","data":{"id":"DX-1","candidates":[{"dx":"STEMI","prob":0.72,"urgency":"critical"},{"dx":"PE","prob":0.18,"urgency":"critical"},{"dx":"costochondritis","prob":0.06,"urgency":"low"}],"model":"clinical-dx-v2","evidence_basis":["symptom-triad","age-risk-factor"]}}
{"seq":6,  "t":"00:01.300", "type":"governance.check",  "rule":"critical-urgency","result":"ALERT","detail":"2 critical-urgency candidates detected"}
{"seq":7,  "t":"00:01.301", "type":"governance.routed", "to":"attending-physician","priority":"STAT","display":"differential-with-evidence"}
{"seq":8,  "t":"00:02.100", "type":"behavior.fired",   "name":"protocol-matcher","trigger":"differential.created","produced":["protocol-rec"]}
{"seq":9,  "t":"00:02.101", "type":"object.created",   "entity":"protocol-rec","data":{"id":"PR-1","protocol":"ACS-pathway","steps":["12-lead-ECG","troponin-stat","aspirin-325mg","cardiology-consult"],"guideline":"AHA/ACC 2024"}}
{"seq":10, "t":"00:03.400", "type":"human.decision",   "agent":"dr-chen","action":"accept-protocol","modifications":"add CT-angio to rule out PE","reasoning":"PE probability 18% warrants concurrent workup"}
{"seq":11, "t":"00:03.401", "type":"object.created",   "entity":"audit-record","data":{"id":"AR-1","reg":"HIPAA","phi_accessed":["ENC-7742"],"purpose":"treatment","retention":"6y + state requirement"}}
```

### Governance Rules (Enterprise — HIPAA/FDA)

```typescript
export const rules = [
  {
    id: "phi-access-logging",
    description: "Log every PHI access with purpose and accessor",
    when: (event) => containsPHI(event),
    effect: (event, context) => logPHIAccess(event, context.agent, "treatment")
  },
  {
    id: "critical-urgency-escalation",
    description: "Immediately route critical findings to attending physician",
    when: (event) => event.entity === "differential",
    check: (event) => !event.data.candidates.some(c => c.urgency === "critical"),
    onFail: { action: "ALERT", to: "attending-physician", priority: "STAT" }
  },
  {
    id: "model-provenance",
    description: "Every AI recommendation must include model version and evidence basis",
    when: (event) => event.entity === "differential" || event.entity === "protocol-rec",
    check: (event) => event.data.model && event.data.evidence_basis,
    onFail: { action: "BLOCK", reason: "AI recommendation missing provenance metadata" }
  },
  {
    id: "physician-override-required",
    description: "AI recommendations are advisory only — physician must accept/modify/reject",
    when: (event) => event.entity === "protocol-rec",
    check: (event, graph) => false, // Always escalate — never auto-execute clinical decisions
    onFail: { action: "ESCALATE", to: "attending-physician", require: "explicit-decision" }
  }
]
```

### Fork Scenario: "What if the AI had missed PE?"

```
Original:    differential = [STEMI 72%, PE 18%, costochondritis 6%]
             → dr-chen adds CT-angio → PE ruled out → ACS pathway proceeds
                              │
Fork at seq:4 ────────────────┤ (remove PE from differential)
                              │
Counterfactual: differential = [STEMI 78%, costochondritis 12%]
                → no CT-angio ordered → PE not investigated
                → IF patient had PE: missed diagnosis, potential harm

Diff: { missing_dx: "PE", removed_test: "CT-angio", risk: "missed PE in 18% of similar presentations" }
Value: Demonstrates AI surfaced clinically relevant alternative that physician acted on.
       In litigation: complete evidence chain from symptoms → AI differential → physician decision.
```

---

## Simulation 4: Legal — Contract Review

**Buyer:** Am Law 100 firm, AI agents reviewing M&A contracts
**Tier:** Pro → Enterprise (privilege + confidentiality)
**Pain:** "Opposing counsel claims our AI missed a change-of-control clause. We need to prove it was flagged."

### Event Log (single contract review)

```jsonl
{"seq":1,  "t":"00:00.000", "type":"object.created",   "entity":"contract",   "data":{"id":"CTR-551","type":"merger-agreement","parties":["AcquireCo","TargetInc"],"pages":247}}
{"seq":2,  "t":"00:00.500", "type":"behavior.fired",   "name":"clause-extraction","trigger":"contract.created","produced":["clause-1","clause-2","clause-3","clause-4"]}
{"seq":3,  "t":"00:00.501", "type":"object.created",   "entity":"clause",     "data":{"id":"CL-1","type":"change-of-control","section":"7.2(b)","text":"...upon change of control, all unvested options shall...","risk":"HIGH"}}
{"seq":4,  "t":"00:00.502", "type":"object.created",   "entity":"clause",     "data":{"id":"CL-2","type":"indemnification","section":"9.1","risk":"MEDIUM"}}
{"seq":5,  "t":"00:00.503", "type":"object.created",   "entity":"clause",     "data":{"id":"CL-3","type":"non-compete","section":"11.4","risk":"LOW"}}
{"seq":6,  "t":"00:00.504", "type":"object.created",   "entity":"clause",     "data":{"id":"CL-4","type":"material-adverse-change","section":"8.1(a)","risk":"HIGH"}}
{"seq":7,  "t":"00:01.200", "type":"behavior.fired",   "name":"risk-comparison","trigger":"clause.created","produced":["comparison"]}
{"seq":8,  "t":"00:01.201", "type":"object.created",   "entity":"comparison", "data":{"id":"CMP-1","clause":"CL-1","benchmark":"market-standard","deviation":"SIGNIFICANT","detail":"Single-trigger acceleration (market standard is double-trigger)"}}
{"seq":9,  "t":"00:01.300", "type":"governance.check",  "rule":"high-risk-clause","result":"ESCALATE","to":"senior-associate"}
{"seq":10, "t":"00:45.000", "type":"human.decision",   "agent":"assoc-kim","action":"flag-for-negotiation","note":"Single-trigger acceleration is aggressive. Recommend counter with double-trigger + 12-month cliff."}
```

### Fork Scenario: "Compare against last 5 similar deals"

```
Fork: replay same contract through 5 different firm precedent baselines

Baseline A (tech M&A 2024):  deviation = SIGNIFICANT (single-trigger unusual)
Baseline B (tech M&A 2025):  deviation = MODERATE (trend toward single-trigger)
Baseline C (PE buyouts):     deviation = LOW (single-trigger is standard in PE)
Baseline D (cross-border):   deviation = HIGH (regulatory complications)
Baseline E (same acquirer):  deviation = NONE (AcquireCo used this in last 3 deals)

Insight: "AcquireCo consistently uses single-trigger. This isn't aggressive — it's their standard playbook."
```

---

## Simulation 5: Autonomous DevOps — Deployment Agents

**Buyer:** SaaS company, AI agents managing deployments, rollbacks, incident response
**Tier:** Pro
**Pain:** "The agent rolled back production at 2am. Nobody knows why. CEO is asking."

### Event Log (single deployment + rollback)

```jsonl
{"seq":1,  "t":"02:00.000", "type":"trigger.webhook",  "name":"deploy-pipeline","source":"github","ref":"main@a8f2c3d"}
{"seq":2,  "t":"02:00.100", "type":"behavior.fired",   "name":"canary-deploy","trigger":"deploy-pipeline","produced":["canary"]}
{"seq":3,  "t":"02:00.101", "type":"object.created",   "entity":"canary",     "data":{"id":"CAN-1","version":"v2.4.1","traffic_pct":5,"region":"us-east-1"}}
{"seq":4,  "t":"02:05.000", "type":"behavior.fired",   "name":"health-monitor","trigger":"canary.created","produced":["health-report"]}
{"seq":5,  "t":"02:05.001", "type":"object.created",   "entity":"health-report","data":{"id":"HR-1","p99_latency_ms":340,"error_rate":0.042,"baseline_error_rate":0.008,"verdict":"DEGRADED"}}
{"seq":6,  "t":"02:05.100", "type":"governance.check",  "rule":"error-rate-threshold","current":0.042,"baseline":0.008,"multiplier":5.25,"max_multiplier":3,"result":"FAIL"}
{"seq":7,  "t":"02:05.101", "type":"behavior.fired",   "name":"auto-rollback","trigger":"governance.fail","produced":["rollback"]}
{"seq":8,  "t":"02:05.200", "type":"object.created",   "entity":"rollback",   "data":{"id":"RB-1","from":"v2.4.1","to":"v2.4.0","reason":"error rate 5.25x baseline (threshold: 3x)","duration_ms":99}}
{"seq":9,  "t":"02:05.201", "type":"object.created",   "entity":"notification","data":{"channel":"#ops-alerts","message":"Auto-rollback: v2.4.1→v2.4.0. Error rate 4.2% (baseline 0.8%). Full event log: operad.sh/runs/CAN-1"}}
```

### Fork Scenario: "What if we had let the canary run longer?"

```
Original:    5 min canary → error rate 4.2% → auto-rollback
                              │
Fork at seq:6 ────────────────┤ (change threshold to 10x)
                              │
Counterfactual: 5 min → 4.2% errors → PASS (under 10x)
                → promote to 25% traffic
                → 15 min later: error rate climbs to 8.7%
                → ~2,100 users affected before rollback
                → MTTR: 20 min (vs 99ms with original threshold)

Diff: { users_affected: 0 vs 2100, mttr_ms: 99 vs 1200000, false_positive_saved: false }
Decision: Keep 3x threshold. The fast rollback prevented 2,100 affected users.
```

---

## Tier Feature Matrix

| Capability | Open Source | Pro | Enterprise |
|-----------|:---:|:---:|:---:|
| Event log (append-only) | ✅ | ✅ | ✅ |
| Graph state + behaviors | ✅ | ✅ | ✅ |
| CLI replay | ✅ | ✅ | ✅ |
| Local fork/diff | ✅ | ✅ | ✅ |
| Cloud sandboxes | — | ✅ | ✅ |
| Governance rules engine | — | ✅ | ✅ |
| Real-time dashboard | — | ✅ | ✅ |
| Team collaboration | — | ✅ | ✅ |
| Branch comparison UI | — | ✅ | ✅ |
| Cost attribution | — | ✅ | ✅ |
| Webhooks + alerts | — | ✅ | ✅ |
| Regulatory audit export | — | — | ✅ |
| Retention policies | — | — | ✅ |
| Legal hold | — | — | ✅ |
| SSO / SCIM | — | — | ✅ |
| RBAC on graphs | — | — | ✅ |
| Tamper-evident hashing | — | — | ✅ |
| Compliance certifications | — | — | ✅ |
| Dedicated support + SLA | — | — | ✅ |

---

## Pricing Strategy: "Free to Log, Pay to Govern"

### Model: Platform fee + governed agent pricing

The paywall is **governance** — the moment you need rules that intercept, escalate, or block
agent decisions, you're running agents in production and the stakes justify paying.
Event logging remains free and unlimited across all tiers (this is the gravity well).

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  OPEN SOURCE               PRO                  ENTERPRISE          │
│  Free forever              $249/mo base          Custom (annual)    │
│                             + $29/governed agent  Starting ~$2,500/mo│
│  ─────────────────          ──────────────────   ──────────────────  │
│                                                                     │
│  ∞ events logged            ∞ events logged      ∞ events logged    │
│  ∞ agents (local)           Up to 5 team seats   Unlimited seats    │
│  CLI replay + fork          + $12/seat above 5   SSO / SCIM         │
│  Local graph state                                                  │
│                             Governance rules     Everything in Pro   │
│  No cloud.                  Cloud sandboxes      + Regulatory export │
│  No governance.             Dashboard            + Retention policy  │
│  No dashboard.              Fork/diff UI         + Legal hold        │
│                             Webhooks + alerts    + RBAC on graphs    │
│                             Cost attribution     + Tamper-evident    │
│                             Branch comparison    + Compliance cert   │
│                                                  + Dedicated CSM     │
│                                                  + SLA (99.95%)      │
│                                                                     │
│  "npm install operad"       "I need control"     "I need proof"     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Why this model works

| Design choice | Rationale |
|---------------|-----------|
| **Events are always free** | Removes adoption friction. Teams log everything from day 1. Once the event log is embedded in their workflow, switching cost is high. |
| **Governed agent = unit of pricing** | A "governed agent" is an agent with ≥1 governance rule attached. This prices on *value* (controlled, production agents) not *volume* (raw events). A DevOps team with 200 agents but only 10 governed ones pays $290/mo + base, not $5,800. |
| **Low base, usage scales** | $249/mo base is approachable for a team evaluating. Scales naturally as they govern more agents. |
| **Enterprise is annual + custom** | Regulated industries (insurance, finance, healthcare) need contracts, SLAs, compliance certs. These buyers expect annual pricing and dedicated support. $30K–$100K/yr range depending on scale. |
| **No per-event charges** | Avoids punishing high-volume use cases (DevOps). Also avoids the "do I log this?" hesitation — log everything, govern what matters. |

### Pricing by use case (estimated)

| Use Case | Typical Shape | Estimated Annual |
|----------|--------------|-----------------|
| **Insurance** (mid-size carrier) | 50 governed agents, 12 seats, Enterprise | ~$48K/yr |
| **Financial Services** (wealth mgmt) | 200 governed agents, 30 seats, Enterprise | ~$95K/yr |
| **Healthcare** (hospital system) | 25 governed agents, 50 seats, Enterprise | ~$42K/yr |
| **Legal** (Am Law 100 firm) | 15 governed agents, 8 seats, Pro | ~$9K/yr |
| **DevOps** (SaaS company) | 10 governed agents (of 200 total), 5 seats, Pro | ~$6.5K/yr |

### Conversion funnel

```
npm install operad          ← Open Source (log + replay locally)
        │
        ▼ "I want my team to see this"
operad cloud init           ← Pro trial (14 days, 3 governed agents free)
        │
        ▼ "We need rules before this goes to production"
Add governance rules        ← Pro paid ($249/mo + $29/governed agent)
        │
        ▼ "The auditor / regulator is asking for proof"
operad export --format=sec  ← Enterprise conversation starts
```

### Industry packages (Enterprise add-ons)

Pre-built governance rule sets that accelerate time-to-value for regulated industries:

| Package | Includes | Price |
|---------|----------|-------|
| **Operad for Insurance** | DOI audit export, fraud-threshold rules, NAIC compliance templates, claims-specific dashboard | +$500/mo |
| **Operad for Finance** | SEC 17a-4 retention, wash-sale detection, concentration-limit rules, FINRA audit format | +$750/mo |
| **Operad for Healthcare** | HIPAA PHI logging, FDA AI/ML provenance, clinical escalation rules, de-identification pipeline | +$750/mo |
| **Operad for Legal** | Privilege tagging, conflict-check governance, matter-level isolation, litigation-hold triggers | +$500/mo |

These packages are the **land-and-expand** mechanism: a team starts with Pro for general agent governance,
then adds an industry package when they realize the pre-built rules save months of compliance work.

---

## Market Size by Use Case

| Use Case | TAM Signal | Urgency Driver |
|----------|-----------|----------------|
| **Insurance** | $6.2B InsurTech AI (2025) | State DOI audits, fraud detection requirements |
| **Financial Services** | $11.3B AI in finance (2025) | SEC/FINRA AI supervision rules (2025-2026) |
| **Healthcare** | $8.1B clinical AI (2025) | FDA AI/ML regulatory framework, malpractice liability |
| **Legal** | $1.8B legal AI (2025) | ABA ethics opinions on AI disclosure, privilege concerns |
| **DevOps** | $4.2B AIOps (2025) | Incident accountability, SRE culture |
| **Cross-cutting: EU AI Act** | All EU-operating companies | Article 12 full enforcement August 2, 2026 |
