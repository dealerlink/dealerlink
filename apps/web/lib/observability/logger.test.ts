import type { DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import { runWithLogContext } from './als';
import { createLogger } from './logger';

/** A pino destination that captures every emitted record as parsed JSON. */
function memoryStream(): { records: Record<string, unknown>[]; stream: DestinationStream } {
  const records: Record<string, unknown>[] = [];
  return {
    records,
    stream: {
      write(line: string) {
        records.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  };
}

describe('structured logger', () => {
  it('stamps the service name on every record', () => {
    const { records, stream } = memoryStream();
    createLogger('web', stream).info('hello');
    expect(records).toHaveLength(1);
    expect(records[0]?.service).toBe('web');
    expect(records[0]?.msg).toBe('hello');
  });

  it('injects the ALS context (tenantId / userId / requestId) via mixin', () => {
    const { records, stream } = memoryStream();
    const log = createLogger('web', stream);
    runWithLogContext({ tenantId: 't-9', userId: 'u-9', requestId: 'r-9' }, () => {
      log.warn('inside request');
    });
    expect(records[0]).toMatchObject({
      service: 'web',
      tenantId: 't-9',
      userId: 'u-9',
      requestId: 'r-9',
      msg: 'inside request',
    });
  });

  it('merges structured fields passed at the call site', () => {
    const { records, stream } = memoryStream();
    createLogger('workers', stream).error({ job: 'pdf-cleanup', purged: 3 }, 'sweep done');
    expect(records[0]).toMatchObject({ service: 'workers', job: 'pdf-cleanup', purged: 3 });
    // pino encodes error level as 50.
    expect(records[0]?.level).toBe(50);
  });

  it('omits ALS fields when no request context is active', () => {
    const { records, stream } = memoryStream();
    createLogger('web', stream).info('no context');
    expect(records[0]).not.toHaveProperty('tenantId');
  });
});
