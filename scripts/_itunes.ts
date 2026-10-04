// Fetch helpers for the iTunes Search / Lookup APIs, shared by the catalog
// scripts. The Search API rate-limits hard (429): back off and retry.

export const UA = { 'User-Agent': 'Spliced/0.1 (music puzzle)' };

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson<T = unknown>(
  url: string,
  attempt = 0
): Promise<T> {
  const r = await fetch(url, { headers: UA });
  if ((r.status === 429 || r.status >= 500) && attempt < 6) {
    await delay(2000 * (attempt + 1));
    return getJson<T>(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export const errMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
