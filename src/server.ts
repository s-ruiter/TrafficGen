import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import interfacesRouter from './routes/interfaces';
import urlListsRouter from './routes/urlLists';
import vxvaultRouter from './routes/vxvault';
import testRouter from './routes/test';

const app = express();

app.use(express.json());
app.use(express.static(path.resolve('public')));
app.use('/api/interfaces', interfacesRouter);
app.use('/api/url-lists', urlListsRouter);
app.use('/api/vxvault', vxvaultRouter);
app.use('/api/test', testRouter);

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(path.resolve('cache'), { recursive: true });
  await fs.mkdir(path.resolve('uploads'), { recursive: true });
  await fs.mkdir(path.resolve('uploads/tmp'), { recursive: true });
}

export async function startServer(port = 3000): Promise<import('http').Server> {
  await ensureDirectories();
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`TrafficGen running at http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}

export default app;
