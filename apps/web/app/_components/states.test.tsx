/**
 * Day 16 — render checks for the shared state components.
 *
 * Uses `renderToStaticMarkup` (no jsdom / testing-library dependency) to
 * assert the markup contract: copy, ARIA roles, and structure. Interaction
 * (the ErrorState retry click) is exercised by the Playwright verify spec.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingSkeleton } from './loading-skeleton';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No dealers yet" description="Add your first dealer." />,
    );
    expect(html).toContain('No dealers yet');
    expect(html).toContain('Add your first dealer.');
  });

  it('renders without a description or action', () => {
    const html = renderToStaticMarkup(<EmptyState title="Empty" />);
    expect(html).toContain('Empty');
  });
});

describe('LoadingSkeleton', () => {
  it('is a status region with a screen-reader label', () => {
    const html = renderToStaticMarkup(<LoadingSkeleton rows={3} columns={4} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading');
  });

  it('renders columns × (rows + header) skeleton bars', () => {
    const html = renderToStaticMarkup(<LoadingSkeleton rows={5} columns={6} />);
    const bars = html.match(/skel/g) ?? [];
    // 6 header + 5 rows × 6 = 36 bars.
    expect(bars.length).toBe(6 + 5 * 6);
  });
});

describe('ErrorState', () => {
  it('is an alert with a friendly message and no stack trace', () => {
    const html = renderToStaticMarkup(<ErrorState />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong');
    expect(html).not.toContain('at Object.<anonymous>');
  });

  it('offers a report-issue mailto link', () => {
    const html = renderToStaticMarkup(<ErrorState />);
    expect(html).toContain('mailto:support@dealerlink.in');
  });

  it('shows a retry button only when a retry handler is supplied', () => {
    expect(renderToStaticMarkup(<ErrorState retry={() => {}} />)).toContain('Try again');
    expect(renderToStaticMarkup(<ErrorState />)).not.toContain('Try again');
  });
});
