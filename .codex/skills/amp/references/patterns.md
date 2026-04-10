# Common AMP Patterns

## Session Start
```
amp_context(task: "<user request>", project_name: "<project>", max_tokens: 8000)
```

## Store a Decision
```
amp_store(
  session_id: "session-20260329-100000",
  task: "[project:my-api] decision: chose JWT over sessions",
  content: "[project:my-api] Chose JWT for stateless auth. Sessions require sticky routing.",
  outcome: "approved",
  entities: ["my-api", "auth-module"]
)
```

## Check Blast Radius Before Risky Change
```
amp_impact(entity_name: "auth-module")
```

## Find Past Bugs in a Module
```
amp_query(
  query: "MATCH (ep:Episodic)-[:ABOUT]->(e:Entity {name: 'auth-module'}) WHERE ep.content CONTAINS 'bug' OR ep.content CONTAINS 'fix' RETURN ep.content, ep.timestamp ORDER BY ep.timestamp DESC",
  limit: 5
)
```

## Get Architecture Context for Planning
```
amp_arch_context(entity_name: "auth-module", include_children: true)
```

## Search Code Semantically
```
amp_code_search(query: "token validation middleware", language: "typescript", limit: 10)
```

## Store Bug Resolution
```
amp_store(
  session_id: "session-20260329-100000",
  task: "[project:my-api] bug fix: OOM in cache module",
  content: "[project:my-api] OOM caused by unbounded LRU cache. Cache grew without eviction under concurrent writes. Fixed with max-size + TTL.",
  outcome: "approved",
  entities: ["my-api", "cache-module"]
)
```

## Reinforce Existing Knowledge
```
amp_store(
  session_id: "session-20260329-100000",
  task: "[project:my-api] convention confirmed",
  content: "[project:my-api] Zod validation pattern works well for the /users endpoint.",
  entities: ["my-api", "validation"],
  signals: [{ "type": "reinforcement", "target_id": "amp-sem-abc", "detail": "Zod pattern confirmed in /users" }]
)
```
