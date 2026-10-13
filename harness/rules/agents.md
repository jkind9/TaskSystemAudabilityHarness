# Agent Orchestration

## Agent Budget (CRITICAL)

**Hard ceiling: ~10 subagents per task — 10 is an absolute push, not a target.** This counts every agent: Agent-tool spawns AND every `agent()` call inside a Workflow run.

This applies **in ultracode too**: ultracode means thorough, not token-unlimited. The failure mode to avoid is multiplication — per-finding verifier fan-outs (N finders × M findings × K verifiers) explode past any budget. Instead:

- Fewer, broader agents: one reviewer per major area, not per dimension × area.
- Verify only HIGH-severity findings, batched into one verifier agent — never one agent per finding.
- One synthesis pass; no completeness critic unless explicitly requested.
- State the planned agent count before launching a workflow; if the design needs more than ~10, ask first.
- Salvage before re-running: resume workflows (`resumeFromRunId`) or extract structured outputs from workflow transcript JSONLs with a local script — completed work is already paid for.

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
