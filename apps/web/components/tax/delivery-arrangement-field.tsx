'use client';

import type { DeliveryArrangement } from '@dealerlink/tax';

export type ArrangementValue = DeliveryArrangement;

/**
 * Asks which §10 delivery arrangement applies — shown ONLY when Ship-To differs
 * from Bill-To (F.5a A.3).
 *
 * ## THE COPY IS THE HARD PART, AND IT IS DELIBERATE
 *
 * A control labelled "§10(1)(a) / §10(1)(b)" gets answered wrongly by the person
 * filling it in, which is worse than not asking — a wrong arrangement produces a
 * confidently wrong tax classification on an issued document, where no arrangement
 * at all produces today's behaviour. So each option is phrased as the physical
 * situation a distributor recognises, and the clause reference sits in secondary
 * text for whoever is reconciling against the statute later.
 *
 * The distinction in the distributor's terms: is the dealer receiving these goods
 * at a place of its own, or is the dealer telling you to deliver them to someone
 * else? The first is (a) and is the common case; the second is (b).
 *
 * ## ONE COMPONENT, TWO FORMS
 *
 * Shared by `convert-form.tsx` and `pi-edit-form.tsx` for the reason F.3 gave the
 * four screens one summary block: two copies of a control asking a statutory
 * question are two things to word subtly differently, and the wording is the part
 * that decides whether the answer is right.
 *
 * It renders no classification of its own. The caller shows the tax consequence
 * from the server-derived preview, because the rule lives in `packages/tax`
 * (D-8).
 */
export function DeliveryArrangementField({
  value,
  onChange,
  billToName,
  shipToName,
  disabled,
}: {
  value: ArrangementValue;
  onChange: (v: ArrangementValue) => void;
  billToName: string;
  shipToName: string;
  disabled?: boolean;
}) {
  const options: { value: ArrangementValue; title: string; detail: string; clause: string }[] = [
    {
      value: 's10_1_a',
      title: `${shipToName} is another site of ${billToName}`,
      detail:
        'A warehouse, branch or project site belonging to the same business. Tax follows where the goods are delivered.',
      clause: 'IGST Act §10(1)(a)',
    },
    {
      value: 's10_1_b',
      title: `${billToName} asked you to deliver to ${shipToName}`,
      detail:
        'A separate business receiving the goods on the buyer’s instruction. Tax follows the buyer’s own location, not the delivery address.',
      clause: 'IGST Act §10(1)(b)',
    },
  ];

  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-ink mb-1 block text-[12px] font-medium">
        Who is receiving these goods?{' '}
        <span className="text-mute font-normal">— this decides the place of supply</span>
      </legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`border-line flex cursor-pointer gap-2.5 rounded-[4px] border px-3 py-2.5 text-[12.5px] ${
              value === o.value ? 'bg-paper border-accent' : 'bg-white'
            }`}
          >
            <input
              type="radio"
              name="deliveryArrangement"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5"
            />
            <span>
              <span className="text-ink block font-medium">{o.title}</span>
              <span className="text-mute mt-0.5 block">{o.detail}</span>
              <span className="text-mute mono mt-1 block text-[11px]">{o.clause}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
