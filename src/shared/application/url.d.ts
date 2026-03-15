import type { FastifyRequest } from 'fastify';

export function getBaseUrl(
  request: Pick<FastifyRequest, 'headers' | 'protocol'>,
  configuredUrl?: string,
): string;
export function toWebsocketUrl(baseUrl: string): string;
