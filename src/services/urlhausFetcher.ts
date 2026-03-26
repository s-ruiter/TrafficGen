import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, UrlhausCache } from '../types';

const URLHAUS_URL = 'https://urlhaus-api.abuse.ch/v1/urls/recent/';
const CACHE_PATH = path.resolve('cache/urlhaus-cache.json');

export async function fetchUrlhausList(): Promise<UrlEntry[]> {
  const apiKey = process.env.URLHAUS_API_KEY;
  if (!apiKey) throw new Error('URLHAUS_API_KEY is not configured');

  const response = await fetch(URLHAUS_URL, {
    method: 'POST',
    headers: {
      'Auth-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 100 }),
  });

  if (!response.ok) throw new Error(`URLhaus API error: ${response.status}`);

  const data = await response.json() as { query_status: string; urls: Array<{ url: string; url_status: string }> };
  if (data.query_status !== 'ok') throw new Error(`URLhaus query failed: ${data.query_status}`);

  return data.urls
    .filter(entry => entry.url_status === 'online')
    .slice(0, 100)
    .map(entry => ({ name: entry.url, url: entry.url, category: 'urlhaus' }));
}

export async function refreshUrlhausCache(): Promise<UrlhausCache> {
  const urls = await fetchUrlhausList();
  const cache: UrlhausCache = { timestamp: new Date().toISOString(), urls };
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

export async function readUrlhausCache(): Promise<UrlhausCache | null> {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data) as UrlhausCache;
  } catch {
    return null;
  }
}
