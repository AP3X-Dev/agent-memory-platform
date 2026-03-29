// packages/research/src/__tests__/tools.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const TOOLS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../tools.ts'),
  'utf-8',
);

describe('research tools.ts regression', () => {
  it('BUG-0031/BUG-0034: campaignStore.getById() is called before ExperimentNode construction', () => {
    // Before the fix, metric_name was set to '' at construction time and only
    // updated after experimentStore.create(node) was called, so every experiment
    // was persisted with an empty metric_name. The fix hoists campaignStore.getById()
    // before ExperimentNode construction so metric_name is set inline.

    const getCampaignIdx = TOOLS_SOURCE.indexOf('campaignStore.getById(args.campaign_id)');
    const nodeConstructionIdx = TOOLS_SOURCE.indexOf('const node: ExperimentNode');

    expect(getCampaignIdx).toBeGreaterThan(-1);
    expect(nodeConstructionIdx).toBeGreaterThan(-1);

    // Campaign lookup MUST appear before node construction
    expect(getCampaignIdx).toBeLessThan(nodeConstructionIdx);

    // metric_name must reference campaign in the node literal
    const nodeBlock = TOOLS_SOURCE.slice(nodeConstructionIdx, nodeConstructionIdx + 500);
    expect(nodeBlock).toContain("campaign?.metric_name");
  });
});
