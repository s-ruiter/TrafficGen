import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import type { UrlEntry, TestCase } from '../types';
import { readCache } from '../services/vxvaultFetcher';
import appControlData from '../data/appControl.json';
import generalWebData from '../data/generalWeb.json';

const router = Router();
const VALID_TEST_CASES: TestCase[] = ['appControl', 'generalWeb', 'malware'];
const upload = multer({ dest: path.resolve('uploads/tmp'), limits: { fileSize: 1024 * 1024 } });

function parseCsv(text: string): { entries: UrlEntry[]; errors: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: UrlEntry[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) { errors.push(`Row ${i + 1}: missing columns`); continue; }
    const [name, url, category] = parts.map((p) => p.trim());
    // Skip rows where all fields are empty (whitespace-only rows)
    if (!name && !url && !category) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        errors.push(`Row ${i + 1}: URL must use http or https`);
        continue;
      }
    } catch {
      errors.push(`Row ${i + 1}: invalid URL "${url}"`);
      continue;
    }
    entries.push({ name, url, category });
  }
  return { entries, errors };
}

function validateJson(entries: UrlEntry[]): string[] {
  return entries.flatMap((e, i) => {
    const errs: string[] = [];
    if (!e.name || !e.url || !e.category) errs.push(`Entry ${i + 1}: missing fields`);
    else {
      try {
        const u = new URL(e.url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') errs.push(`Entry ${i + 1}: invalid scheme`);
      } catch { errs.push(`Entry ${i + 1}: invalid URL`); }
    }
    return errs;
  });
}

async function getCustomInfo(testCase: TestCase) {
  try {
    const [meta, data] = await Promise.all([
      fs.readFile(path.resolve(`uploads/${testCase}.meta.json`), 'utf-8'),
      fs.readFile(path.resolve(`uploads/${testCase}.json`), 'utf-8'),
    ]);
    const { filename } = JSON.parse(meta) as { filename: string };
    const entries = JSON.parse(data) as UrlEntry[];
    return { filename, count: entries.length };
  } catch { return null; }
}

router.get('/', async (_req, res) => {
  const cache = await readCache();
  const [acCustom, gwCustom, mCustom] = await Promise.all([
    getCustomInfo('appControl'),
    getCustomInfo('generalWeb'),
    getCustomInfo('malware'),
  ]);
  res.json({
    appControl: { builtin: (appControlData as UrlEntry[]).length, custom: acCustom },
    generalWeb: { builtin: (generalWebData as UrlEntry[]).length, custom: gwCustom },
    malware: {
      vxvaultCache: cache ? { timestamp: cache.timestamp, count: cache.urls.length } : null,
      custom: mCustom,
    },
  });
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const testCase = req.body.testCase as TestCase;
  if (!VALID_TEST_CASES.includes(testCase)) return res.status(400).json({ error: 'Invalid testCase' }) as any;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' }) as any;

  try {
    const text = await fs.readFile(req.file.path, 'utf-8');
    let entries: UrlEntry[];
    let errors: string[];

    if (req.file.originalname.endsWith('.json')) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return res.status(400).json({ error: 'Invalid JSON' }) as any; }
      if (!Array.isArray(parsed)) return res.status(400).json({ error: 'JSON must be an array' }) as any;
      errors = validateJson(parsed as UrlEntry[]);
      if (errors.length) return res.status(400).json({ errors }) as any;
      entries = parsed as UrlEntry[];
    } else {
      const result = parseCsv(text);
      if (result.errors.length) return res.status(400).json({ errors: result.errors }) as any;
      entries = result.entries;
    }

    if (entries.length === 0) return res.status(400).json({ error: 'No valid entries' }) as any;
    if (entries.length > 1000) return res.status(400).json({ error: 'Exceeds 1000 URL limit' }) as any;

    await fs.writeFile(path.resolve(`uploads/${testCase}.json`), JSON.stringify(entries, null, 2));
    await fs.writeFile(path.resolve(`uploads/${testCase}.meta.json`), JSON.stringify({ filename: req.file.originalname }));
    res.json({ count: entries.length });
  } finally {
    await fs.unlink(req.file!.path).catch(() => {});
  }
});

router.delete('/:testCase', async (req, res) => {
  const testCase = req.params.testCase as TestCase;
  if (!VALID_TEST_CASES.includes(testCase)) return res.status(400).json({ error: 'Invalid testCase' }) as any;
  await Promise.all([
    fs.unlink(path.resolve(`uploads/${testCase}.json`)).catch(() => {}),
    fs.unlink(path.resolve(`uploads/${testCase}.meta.json`)).catch(() => {}),
  ]);
  res.json({ deleted: true });
});

export default router;
