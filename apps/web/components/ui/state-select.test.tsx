/**
 * Markup contract for the shared state dropdown (DEV.33): the user sees full
 * state NAMES, the form submits ISO 3166-2:IN CODES. Uses renderToStaticMarkup
 * (no jsdom) like the other component tests.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StateSelect } from './state-select';

describe('StateSelect', () => {
  it('renders code values with full-name labels', () => {
    const html = renderToStaticMarkup(<StateSelect value="MH" onChange={() => {}} />);
    // Value is the code…
    expect(html).toContain('value="MH"');
    expect(html).toContain('value="KA"');
    // …label is the full name.
    expect(html).toContain('>Maharashtra</option>');
    expect(html).toContain('>Karnataka</option>');
    // The name is never used as a submitted value.
    expect(html).not.toContain('value="Maharashtra"');
  });

  it('includes an empty option by default and can omit it', () => {
    const withEmpty = renderToStaticMarkup(<StateSelect value="" onChange={() => {}} />);
    expect(withEmpty).toContain('value=""');

    const without = renderToStaticMarkup(
      <StateSelect value="MH" onChange={() => {}} includeEmpty={false} />,
    );
    expect(without).not.toContain('value=""');
  });

  it('offers all 36 states + UTs', () => {
    const html = renderToStaticMarkup(<StateSelect value="" onChange={() => {}} />);
    const optionCount = (html.match(/<option/g) ?? []).length;
    expect(optionCount).toBe(37); // 36 states + the empty option
  });
});
