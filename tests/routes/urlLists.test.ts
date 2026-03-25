import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

describe('URL Lists routes', () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trafficgen-test-'));
    // Create the tmp subdirectory that multer needs
    await fs.mkdir(path.join(tmpDir, 'tmp'), { recursive: true });

    // Redirect all path.resolve('uploads/...') calls to tmpDir
    vi.doMock('path', async (importOriginal) => {
      const actual = await importOriginal<typeof path>();
      return {
        ...actual,
        resolve: (...args: string[]) => {
          const joined = args.join('/');
          if (joined.startsWith('uploads/tmp') || joined === 'uploads/tmp') {
            return path.join(tmpDir, 'tmp');
          }
          if (joined.startsWith('uploads')) {
            return path.join(tmpDir, joined.replace(/^uploads\/?/, ''));
          }
          return actual.resolve(...args);
        },
      };
    });

    const { default: router } = await import('../../src/routes/urlLists');
    app = express();
    app.use(express.json());
    app.use('/api/url-lists', router);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('GET /api/url-lists returns list structure', async () => {
    const res = await request(app).get('/api/url-lists');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('appControl');
    expect(res.body).toHaveProperty('generalWeb');
    expect(res.body).toHaveProperty('malware');
    expect(res.body.appControl.custom).toBeNull();
  });

  it('POST /api/url-lists/upload rejects missing testCase', async () => {
    const res = await request(app)
      .post('/api/url-lists/upload')
      .attach('file', Buffer.from('name,url,category\nTest,http://x.com,test'), 'test.csv');
    expect(res.status).toBe(400);
  });

  it('POST /api/url-lists/upload rejects invalid testCase', async () => {
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'invalid')
      .attach('file', Buffer.from('name,url,category\nTest,http://x.com,test'), 'test.csv');
    expect(res.status).toBe(400);
  });

  it('POST /api/url-lists/upload accepts valid CSV', async () => {
    const csv = 'name,url,category\nYouTube,https://youtube.com,streaming';
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'appControl')
      .attach('file', Buffer.from(csv), 'custom.csv');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('POST /api/url-lists/upload rejects CSV with invalid URL', async () => {
    const csv = 'name,url,category\nBad,not-a-url,test';
    const res = await request(app)
      .post('/api/url-lists/upload')
      .field('testCase', 'appControl')
      .attach('file', Buffer.from(csv), 'bad.csv');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/url-lists/:testCase returns 200', async () => {
    const res = await request(app).delete('/api/url-lists/appControl');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/url-lists/:testCase rejects invalid testCase', async () => {
    const res = await request(app).delete('/api/url-lists/invalid');
    expect(res.status).toBe(400);
  });
});
