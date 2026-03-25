import type { ServerResponse } from 'http';

export type TestCase = 'appControl' | 'generalWeb' | 'malware';

export interface UrlEntry {
  name: string;
  url: string;
  category: string;
}

export interface NetworkInterface {
  name: string;
  ip: string;
}

export type RunStatus = 'idle' | 'running' | 'completed' | 'stopped';

export interface RunState {
  runId: string;
  status: RunStatus;
  stopRequested: boolean;
  sseClients: Set<ServerResponse>;
}

export interface RequestEvent {
  type: 'request';
  url: string;
  testCase: TestCase;
  category: string;
  status: 'success' | 'failed';
  statusCode: number | null;
  responseTime: number;
  sourceIp: string;
  error?: string;
}

export interface SummaryEvent {
  type: 'summary';
  testCase: TestCase;
  category: string;
  total: number;
  success: number;
  failed: number;
}

export interface DoneEvent {
  type: 'done';
  totalRequests: number;
  totalSuccess: number;
  totalFailed: number;
}

export type SseEvent = RequestEvent | SummaryEvent | DoneEvent;

export interface VxvaultCache {
  timestamp: string;
  urls: UrlEntry[];
}

export interface StartRunOptions {
  testCases: TestCase[];
  sourceIps: string[];
  repeatCount: number;
  customLists: Partial<Record<TestCase, 'builtin' | 'custom'>>;
}
