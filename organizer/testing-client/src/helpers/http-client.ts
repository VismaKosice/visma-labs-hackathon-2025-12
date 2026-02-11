/**
 * HTTP client wrapper for making requests to the target API.
 * Uses axios with connection pooling for performance.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { CalculationRequest, CalculationResponse } from '../types/api';

export interface RequestResult {
  status: number;
  body: CalculationResponse | null;
  rawBody: string;
  elapsedMs: number;
  error?: string;
}

let client: AxiosInstance | null = null;

export function createHttpClient(baseUrl: string): AxiosInstance {
  client = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    // Keep connections alive for performance
    httpAgent: new (require('http').Agent)({ keepAlive: true, maxSockets: 100 }),
    validateStatus: () => true, // Don't throw on non-2xx status
  });
  return client;
}

export function getHttpClient(): AxiosInstance {
  if (!client) {
    throw new Error('HTTP client not initialized. Call createHttpClient() first.');
  }
  return client;
}

/**
 * Send a calculation request and measure response time.
 */
export async function sendCalculationRequest(
  request: CalculationRequest,
  httpClient?: AxiosInstance,
): Promise<RequestResult> {
  const c = httpClient || getHttpClient();

  const start = process.hrtime.bigint();

  try {
    const response: AxiosResponse = await c.post('/calculation-requests', request);
    const elapsed = process.hrtime.bigint() - start;
    const elapsedMs = Number(elapsed) / 1_000_000;

    let body: CalculationResponse | null = null;
    let rawBody: string;

    if (typeof response.data === 'string') {
      rawBody = response.data;
      try {
        body = JSON.parse(response.data);
      } catch {
        // Not valid JSON
      }
    } else {
      body = response.data as CalculationResponse;
      rawBody = JSON.stringify(response.data);
    }

    return {
      status: response.status,
      body,
      rawBody,
      elapsedMs,
    };
  } catch (err) {
    const elapsed = process.hrtime.bigint() - start;
    const elapsedMs = Number(elapsed) / 1_000_000;

    return {
      status: 0,
      body: null,
      rawBody: '',
      elapsedMs,
      error: (err as Error).message,
    };
  }
}
