import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeCase, makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('20. the data layer performs all daily operations with no network access', () => {
  const h = openHarness('offline');
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const file = makeFile(h.db, [client.party.id]);
    const legalCase = makeCase(h.db, file.id, courtId);
    const hearing = h.db.hearings.schedule({
      caseId: legalCase.id,
      scheduledAt: '2026-11-01T09:00:00.000Z',
    });
    h.db.judgments.record({
      caseId: legalCase.id,
      hearingId: hearing.id,
      issuedOn: '2026-11-01',
      fileIds: [file.id],
    });
    assert.equal(h.db.health.schemaCheck().ok, true);

    const networkImports = ['node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls'];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        const text = readFileSync(path, 'utf8');
        for (const moduleName of networkImports) {
          if (text.includes(`from '${moduleName}'`) || text.includes(`require('${moduleName}')`)) {
            offenders.push(`${path}: ${moduleName}`);
          }
        }
        if (/\bfetch\s*\(/.test(text)) offenders.push(`${path}: fetch()`);
      }
    };
    walk(join(process.cwd(), 'src'));
    assert.deepEqual(offenders, []);
  } finally {
    h.cleanup();
  }
});
