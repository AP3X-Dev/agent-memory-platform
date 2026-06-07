// packages/core/src/__tests__/redact.test.ts
import { describe, it, expect } from 'vitest';
import { redactSecrets, redactValue } from '../redact.js';

describe('redactSecrets', () => {
  it('redacts OpenAI-style keys', () => {
    expect(redactSecrets('key is sk-abcdEFGH1234567890 ok')).toBe('key is [REDACTED] ok');
  });

  it('redacts AWS access key ids', () => {
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED]');
  });

  it('redacts GitHub tokens (classic + fine-grained)', () => {
    expect(redactSecrets('ghp_' + 'a'.repeat(36))).toBe('[REDACTED]');
    expect(redactSecrets('github_pat_' + 'b'.repeat(30))).toBe('[REDACTED]');
  });

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4';
    expect(redactSecrets(`token=${jwt}`)).toContain('[REDACTED]');
    expect(redactSecrets(jwt)).not.toContain('eyJ');
  });

  it('redacts PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----';
    expect(redactSecrets(pem)).toBe('[REDACTED]');
  });

  it('redacts credential assignments by key name', () => {
    expect(redactSecrets('password: hunter2')).toBe('password: [REDACTED]');
    // The value (and any surrounding quotes) is replaced wholesale.
    expect(redactSecrets('API_KEY="superlongsecretvalue"')).toBe('API_KEY=[REDACTED]');
    expect(redactSecrets('client_secret=abc123def')).toBe('client_secret=[REDACTED]');
  });

  it('redacts credentials embedded in connection strings', () => {
    expect(redactSecrets('redis://user:p4ssw0rd@host:6379')).toBe('redis://user:[REDACTED]@host:6379');
    expect(redactSecrets('postgres://admin:secretpw@db/app')).toBe('postgres://admin:[REDACTED]@db/app');
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'The auth module uses JWT tokens for sessions and decays confidence over time.';
    expect(redactSecrets(prose)).toBe(prose);
  });

  it('redactValue passes through non-strings', () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(null)).toBe(null);
    expect(redactValue('sk-abcdEFGH1234567890')).toBe('[REDACTED]');
  });
});
