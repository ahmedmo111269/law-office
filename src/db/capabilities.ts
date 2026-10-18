import type { DatabaseAdapter } from './adapter.ts';

/**
 * Capability detection is explicit. SQLite builds differ (FTS5, JSON1, etc.)
 * and the application must degrade visibly instead of assuming a feature.
 */
export function detectFts5(adapter: DatabaseAdapter): boolean {
  try {
    adapter.exec('CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x)');
    adapter.exec('DROP TABLE temp.__fts5_probe');
    return true;
  } catch {
    try {
      adapter.exec('DROP TABLE IF EXISTS temp.__fts5_probe');
    } catch {
      // ignore cleanup failure
    }
    return false;
  }
}

export function readCapabilities(adapter: DatabaseAdapter): {
  fts5: boolean;
  json1: boolean;
  engineVersion: string;
} {
  let json1 = true;
  try {
    adapter.get("SELECT json_valid('{}') AS ok");
  } catch {
    json1 = false;
  }
  const engineVersion = adapter.describe().engineVersion;
  return { fts5: detectFts5(adapter), json1, engineVersion };
}
