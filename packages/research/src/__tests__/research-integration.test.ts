// packages/research/src/__tests__/research-integration.test.ts
// Integration tests for research package — requires running Neo4j.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDriver, cleanTestData, closeDriver, NEO4J_AVAILABLE } from './neo4j-helper.js';
import { initResearchSchema } from '../schema.js';
import { CampaignStore } from '../campaign.js';
import { ExperimentStore } from '../experiment.js';
import { HypothesisNavigator } from '../hypothesis.js';
import type { Driver } from 'neo4j-driver';
import type { CampaignNode, ExperimentNode } from '../types.js';

let driver: Driver;
let campaigns: CampaignStore;
let experiments: ExperimentStore;
let hypothesis: HypothesisNavigator;

const TEST_CAMPAIGN_ID = 'test-campaign-001';

beforeAll(async () => {
  const d = await getDriver();
  if (!d) return;
  driver = d;
  await initResearchSchema(driver);

  // Clean previous test data
  const session = driver.session();
  try {
    await session.run("MATCH (e:Experiment {campaign_id: $id}) DETACH DELETE e", { id: TEST_CAMPAIGN_ID });
    await session.run("MATCH (c:Campaign {campaign_id: $id}) DETACH DELETE c", { id: TEST_CAMPAIGN_ID });
  } finally {
    await session.close();
  }

  campaigns = new CampaignStore(driver);
  experiments = new ExperimentStore(driver);
  hypothesis = new HypothesisNavigator(driver);
});

afterAll(async () => {
  if (driver) {
    const session = driver.session();
    try {
      await session.run("MATCH (e:Experiment {campaign_id: $id}) DETACH DELETE e", { id: TEST_CAMPAIGN_ID });
      await session.run("MATCH (c:Campaign {campaign_id: $id}) DETACH DELETE c", { id: TEST_CAMPAIGN_ID });
    } finally {
      await session.close();
    }
  }
  await closeDriver();
});

describe.runIf(NEO4J_AVAILABLE)('CampaignStore', () => {
  it('creates and retrieves a campaign', async () => {
    const now = new Date().toISOString();
    const node: CampaignNode = {
      id: 'test-camp-id',
      campaign_id: TEST_CAMPAIGN_ID,
      name: 'test-campaign',
      objective: 'Reduce test suite time',
      metric_name: 'test_duration_s',
      metric_direction: 'lower',
      run_command: 'npm test',
      measure_command: 'time npm test',
      scope_files: ['src/'],
      constraints: 'Do not modify CI config',
      baseline_metric: null,
      best_metric: null,
      best_commit: null,
      best_experiment_id: null,
      total_experiments: 0,
      total_keeps: 0,
      total_discards: 0,
      consolidation_count: 0,
      last_consolidation_at: null,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    await campaigns.create(node);
    const retrieved = await campaigns.getById(TEST_CAMPAIGN_ID);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('test-campaign');
    expect(retrieved!.objective).toBe('Reduce test suite time');
    expect(retrieved!.metric_direction).toBe('lower');
  });

  it('updates campaign stats', async () => {
    await campaigns.updateStats(TEST_CAMPAIGN_ID, {
      total_experiments: 5,
      total_keeps: 3,
      best_metric: 42.5,
    });
    const updated = await campaigns.getById(TEST_CAMPAIGN_ID);
    expect(updated!.total_experiments).toBe(5);
    expect(updated!.total_keeps).toBe(3);
    expect(updated!.best_metric).toBe(42.5);
  });
});

describe.runIf(NEO4J_AVAILABLE)('ExperimentStore', () => {
  let exp0Id: string;
  let exp1Id: string;

  it('creates baseline experiment', async () => {
    const node: ExperimentNode = {
      id: 'test-exp-0',
      session_id: 'test-session',
      agent_id: 'test-agent',
      campaign_id: TEST_CAMPAIGN_ID,
      experiment_number: 0,
      branch: 'research/test',
      parent_id: null,
      commit_hash: 'abc1234',
      metric_name: 'test_duration_s',
      metric_value: 45.2,
      secondary_metrics: {},
      status: 'keep',
      duration_s: 50,
      hypothesis: 'Establish baseline',
      description: 'Baseline run',
      insight: 'Baseline at 45.2s',
      components_touched: [],
      created_at: new Date().toISOString(),
    };

    exp0Id = await experiments.create(node);
    expect(exp0Id).toBe('test-exp-0');
  });

  it('creates derived experiment with parent link', async () => {
    const node: ExperimentNode = {
      id: 'test-exp-1',
      session_id: 'test-session',
      agent_id: 'test-agent',
      campaign_id: TEST_CAMPAIGN_ID,
      experiment_number: 1,
      branch: 'research/test',
      parent_id: 'test-exp-0',
      commit_hash: 'def5678',
      metric_name: 'test_duration_s',
      metric_value: 38.7,
      secondary_metrics: { mem_mb: 220 },
      status: 'keep',
      duration_s: 45,
      hypothesis: 'Parallel test execution will reduce time',
      description: 'Enable parallel jest workers',
      insight: 'Dropped 6.5s — parallelism helps',
      components_touched: ['jest.config.ts'],
      created_at: new Date().toISOString(),
    };

    exp1Id = await experiments.create(node);
    await experiments.linkToParent(exp1Id, 'test-exp-0');
    await experiments.linkToCampaign(exp1Id, TEST_CAMPAIGN_ID);
    expect(exp1Id).toBe('test-exp-1');
  });

  it('retrieves experiments by campaign', async () => {
    const exps = await experiments.getByCampaign(TEST_CAMPAIGN_ID);
    expect(exps.length).toBeGreaterThanOrEqual(2);
  });

  it('gets recent keeps', async () => {
    const keeps = await experiments.getRecentKeeps(TEST_CAMPAIGN_ID);
    expect(keeps.length).toBeGreaterThanOrEqual(2);
    expect(keeps.every((e) => e.status === 'keep')).toBe(true);
  });

  it('computes stats', async () => {
    const stats = await experiments.getStats(TEST_CAMPAIGN_ID);
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.keeps).toBeGreaterThanOrEqual(2);
    expect(stats.discards).toBe(0);
  });
});

describe.runIf(NEO4J_AVAILABLE)('HypothesisNavigator', () => {
  it('builds hypothesis tree', async () => {
    const tree = await hypothesis.getTree(TEST_CAMPAIGN_ID);
    expect(tree.length).toBeGreaterThanOrEqual(1);
    // Root should be experiment 0
    const root = tree.find((n) => n.experiment_number === 0);
    expect(root).toBeDefined();
  });

  it('renders tree as markdown', async () => {
    const tree = await hypothesis.getTree(TEST_CAMPAIGN_ID);
    const md = hypothesis.renderTreeMarkdown(tree);
    expect(md).toContain('Hypothesis Tree');
    expect(md).toContain('Baseline run');
  });
});
