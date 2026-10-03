import {
  HEARTBEAT_THROTTLE_MINUTES,
  STALE_AFTER_MINUTES,
} from '@dealerlink/db/agent-token-constants';
import { describe, expect, it } from 'vitest';

import { describeLastSeen } from './last-seen';

const now = new Date('2026-10-03T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('describeLastSeen (F.148)', () => {
  it('NEVER is its own state, not a very old timestamp', () => {
    const r = describeLastSeen(null, now);
    expect(r.state).toBe('never');
    expect(r.label).toBe('Never checked in');
    // It warrants attention: a token issued and never used means the agent was
    // never installed or cannot reach us — a different conversation entirely.
    expect(r.attention).toBe(true);
  });

  it('NEVER renders an exact timestamp, and ALWAYS hedges, at any age', () => {
    // THE WHOLE POINT, and the assertion is a CORRECTION.
    //
    // It first forbade the literal age appearing in the label — "not `${m}
    // minutes ago`" — which failed at m=30, where a 15-minute bucket rounds to
    // exactly 30. **That was testing a proxy rather than the property.** A
    // bucket coinciding with the true value is still a bucket; what makes it
    // honest is the granularity and the hedge, not numeric disagreement.
    //
    // So: no ISO date, no clock time, and ALWAYS an "about" or a "within". A
    // label that reads "37 minutes ago" fails on the missing hedge, which is
    // the thing that would actually mislead a reader.
    for (const m of [0, 1, 7, 14, 16, 30, 59, 61, 119, 121, 1000, 100_000]) {
      const label = describeLastSeen(minutesAgo(m), now).label;
      expect(label, `age ${m}: ISO or clock time`).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|T\d/);
      expect(label, `age ${m}: unhedged`).toMatch(/\babout\b|\bwithin\b/);
    }
  });

  it('buckets to the throttle granularity — 37 and 44 minutes read the same', () => {
    // The granularity IS the honesty: two ages inside one window must be
    // indistinguishable on screen, or the reader can infer precision the column
    // does not have.
    expect(describeLastSeen(minutesAgo(37), now).label).toBe(
      describeLastSeen(minutesAgo(44), now).label,
    );
  });

  it('inside one throttle window, says only "within the last N minutes"', () => {
    for (const m of [0, 1, HEARTBEAT_THROTTLE_MINUTES]) {
      const r = describeLastSeen(minutesAgo(m), now);
      expect(r.state, `age ${m}`).toBe('recent');
      expect(r.label).toBe(`Checked in within the last ${HEARTBEAT_THROTTLE_MINUTES} minutes`);
      expect(r.attention).toBe(false);
    }
  });

  it('carries the ± window so a reader can see how approximate it is', () => {
    expect(describeLastSeen(minutesAgo(45), now).label).toContain(
      `±${HEARTBEAT_THROTTLE_MINUTES} min`,
    );
  });

  it('becomes STALE only past the derived threshold, never before', () => {
    // One minute inside the threshold is NOT stale; one minute past it is. A
    // threshold tighter than the throttle would alarm on healthy agents, which
    // is why STALE_AFTER_MINUTES is derived rather than typed.
    expect(describeLastSeen(minutesAgo(STALE_AFTER_MINUTES - 1), now).state).toBe('ok');
    expect(describeLastSeen(minutesAgo(STALE_AFTER_MINUTES + 1), now).state).toBe('stale');
    expect(describeLastSeen(minutesAgo(STALE_AFTER_MINUTES + 1), now).attention).toBe(true);
  });

  it('a just-checked-in agent is never stale, whatever the threshold is set to', () => {
    // The invariant rather than the number: if someone changes the multiple,
    // this still holds, and it fails loudly if they make it smaller than 1.
    expect(describeLastSeen(minutesAgo(0), now).attention).toBe(false);
    expect(STALE_AFTER_MINUTES).toBeGreaterThan(HEARTBEAT_THROTTLE_MINUTES);
  });

  it('scales the wording with age rather than reporting 100000 minutes', () => {
    expect(describeLastSeen(minutesAgo(90), now).label).toMatch(/minutes ago/);
    expect(describeLastSeen(minutesAgo(60 * 5), now).label).toMatch(/about 5 hours ago/);
    expect(describeLastSeen(minutesAgo(60 * 24 * 3), now).label).toMatch(/about 3 days ago/);
  });
});
