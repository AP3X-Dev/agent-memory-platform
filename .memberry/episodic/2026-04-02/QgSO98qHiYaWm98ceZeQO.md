---
id: QgSO98qHiYaWm98ceZeQO
session_id: oni-code-topology-viz-20260401
agent_id: mcp
task: [project:oni-code] Topology visualization + intelligent auto-dispatch for all 20 topologies
outcome: approved
created_at: "2026-04-02T05:37:57.121Z"
---

[project:oni-code] Two connected deliverables:

1. TOPOLOGY VISUALIZATION — Build visual ASCII diagrams for all 20 topologies in the TUI SwarmPanel. Each topology gets a unique diagram showing its graph structure, agent status, and progress. Brand-spec colors: heavy borders, primary green for running, gold for agent names, success green for done, error red for failed.

2. INTELLIGENT AUTO-DISPATCH — Extend TaskEvaluator + TopologySelector beyond the current 5 auto-dispatched topologies (fanOut, pipeline, debate, mapReduce, hierarchical) to intelligently select from all 20 based on task characteristics. Key principle from user: "genuinely useful, not just novel."

FULL TOPOLOGY LIST (20 named + custom):
1. hierarchical — supervisor + specialists
2. fanOut — parallel → synthesis
3. pipeline — sequential stages
4. peerNetwork — direct handoffs, no supervisor
5. mapReduce — mappers → reducer
6. debate — multi-round with judge
7. hierarchicalMesh — coordinator → team sub-graphs
8. race — first valid wins
9. dag — dependency-ordered execution
10. pool — load-balanced copies
11. compose — sub-swarms as pipeline stages
12. critiqueRefine — generator/critic loop
13. stepwiseVerify — stages with verification gates
14. ensembleVote — parallel → vote/synthesize
15. speculativeExecution — race strategies, first valid wins with validator
16. redTeam — attacker/builder adversarial loop
17. socraticElicit — interviewer/respondent dimension coverage
18. autoResearch — recursive decompose → research → synthesize
19. treeOfThought — branching search with scoring/pruning
20. adversarialDev — sprint contracts with planner/generator/evaluator

CURRENTLY AUTO-DISPATCHED (5): fanOut, pipeline, debate, mapReduce, hierarchical
NEEDS ADDITION TO AUTO-DISPATCH: critiqueRefine (for code review), redTeam (for security), autoResearch (for deep questions), stepwiseVerify (for multi-step with verification), ensembleVote (for consensus decisions)

USER DIRECTIVE: System must autonomously understand WHEN to use each topology. Not just pattern matching — genuinely useful selection.