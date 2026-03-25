import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, VxvaultCache } from '../types';

const VXVAULT_URL = 'http://vxvault.net/URL_List.php';
const CACHE_PATH = path.resolve('cache/vxvault-cache.json');

export function parseVxvaultText(text: string): UrlEntry[] {
  const results: UrlEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    try {
      const u = new URL(line);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      results.push({ name: line, url: line, category: 'malware' });
    } catch {
      // invalid URL — skip
    }
  }
  return results;
}

export async function fetchVxvaultList(): Promise<UrlEntry[]> {
  return new Promise((resolve, reject) => {
    http.get(VXVAULT_URL, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve(parseVxvaultText(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function refreshCache(): Promise<VxvaultCache> {
  const urls = await fetchVxvaultList();
  const cache: VxvaultCache = { timestamp: new Date().toISOString(), urls };
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

export async function readCache(): Promise<VxvaultCache | null> {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data) as VxvaultCache;
  } catch {
    return null;
  }
}
