// packages/core/src/extract.ts
// Extracts structured subject-predicate-object facts from prose using OpenAI.

import OpenAI from 'openai';
import type { FactInput } from './types.js';

// ─── Response validation ────────────────────────────────────────────────────

interface RawFact {
  subject: string;
  predicate: string;
  object: string;
}

function validateFactResponse(data: unknown): RawFact[] {
  if (typeof data !== 'object' || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.facts)) return [];

  const valid: RawFact[] = [];
  for (const item of obj.facts) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).subject === 'string' &&
      typeof (item as Record<string, unknown>).predicate === 'string' &&
      typeof (item as Record<string, unknown>).object === 'string'
    ) {
      valid.push({
        subject: (item as Record<string, unknown>).subject as string,
        predicate: (item as Record<string, unknown>).predicate as string,
        object: (item as Record<string, unknown>).object as string,
      });
    }
  }
  return valid;
}

// ─── Extraction prompt ──────────────────────────────────────────────────────

const FACT_EXTRACTION_PROMPT = `You are a knowledge extraction system. Given prose text about a project or system, extract structured facts as subject-predicate-object triples.

Rules:
- Extract only factual claims, not opinions or speculation.
- Use concise entity names for subjects (e.g. "auth-module", not "the authentication module").
- Use ONLY these canonical predicates: "uses", "prefers", "located_at", "implements", "owns", "is", "version_is", "has", "produces", "consumes", "calls", "extends", "rate_limit_is", "configured_as", "depends_on", "replaces", "blocks", "enables".
- Keep objects concise but complete (e.g. "JWT", "PostgreSQL 15", "event sourcing pattern").
- If no clear facts can be extracted, return an empty array.

Respond with JSON only:
{"facts": [{"subject": "...", "predicate": "...", "object": "..."}]}`;

// ─── extractFacts ───────────────────────────────────────────────────────────

/**
 * Extracts structured subject-predicate-object facts from prose content.
 * Returns an empty array on any failure (parse error, API error, etc.).
 */
export async function extractFacts(
  content: string,
  apiKey: string,
): Promise<FactInput[]> {
  if (!apiKey || !content.trim()) {
    return [];
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: FACT_EXTRACTION_PROMPT },
        { role: 'user', content: content.slice(0, 4000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1000,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const preview = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
      console.error(`[extract] JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Raw content: ${preview}`);
      return [];
    }
    const facts = validateFactResponse(parsed);

    return facts.map((f) => ({
      subject: f.subject,
      predicate: f.predicate,
      object: f.object,
      source_episode_ids: [],
    }));
  } catch {
    return [];
  }
}
