// packages/research/src/schema.ts
// Additional Neo4j constraints and indexes for the research domain.
// Additive — does not modify any existing schema from @amp/neo4j.

import { type Driver } from 'neo4j-driver';

const RESEARCH_CONSTRAINTS: string[] = [
  'CREATE CONSTRAINT campaign_campaign_id IF NOT EXISTS FOR (c:Campaign) REQUIRE c.campaign_id IS UNIQUE',
  'CREATE CONSTRAINT component_path IF NOT EXISTS FOR (c:Component) REQUIRE c.path IS UNIQUE',
];

const RESEARCH_INDEXES: string[] = [
  'CREATE INDEX experiment_campaign IF NOT EXISTS FOR (e:Experiment) ON (e.campaign_id)',
  'CREATE INDEX experiment_status IF NOT EXISTS FOR (e:Experiment) ON (e.status)',
  'CREATE INDEX experiment_branch IF NOT EXISTS FOR (e:Experiment) ON (e.branch)',
  'CREATE INDEX experiment_number IF NOT EXISTS FOR (e:Experiment) ON (e.experiment_number)',
  'CREATE INDEX experiment_metric IF NOT EXISTS FOR (e:Experiment) ON (e.metric_value)',
  'CREATE INDEX component_domain IF NOT EXISTS FOR (c:Component) ON (c.domain)',
  'CREATE INDEX campaign_status IF NOT EXISTS FOR (c:Campaign) ON (c.status)',
];

export async function initResearchSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const statement of [...RESEARCH_CONSTRAINTS, ...RESEARCH_INDEXES]) {
      await session.run(statement);
    }
  } finally {
    await session.close();
  }
}

export async function verifyResearchSchema(driver: Driver): Promise<{
  constraintCount: number;
  indexCount: number;
}> {
  const session = driver.session();
  try {
    const constraints = await session.run(
      "SHOW CONSTRAINTS WHERE name STARTS WITH 'campaign_' OR name STARTS WITH 'component_'",
    );
    const indexes = await session.run(
      "SHOW INDEXES WHERE name STARTS WITH 'experiment_' OR name STARTS WITH 'component_' OR name STARTS WITH 'campaign_'",
    );
    return {
      constraintCount: constraints.records.length,
      indexCount: indexes.records.length,
    };
  } finally {
    await session.close();
  }
}
