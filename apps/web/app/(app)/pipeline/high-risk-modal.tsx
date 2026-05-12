'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import type { StageMeta } from './stage-meta';

export interface HighRiskPrompt {
  dealId: string;
  dealTitle: string;
  dealerName: string;
  fromStage: StageMeta;
  toStage: StageMeta;
  viewerRole: 'admin' | 'sales' | 'accounts' | 'dispatch';
}

interface HighRiskModalProps {
  prompt: HighRiskPrompt | null;
  onCancel: () => void;
  onConfirm: (overrideReason: string) => void;
}

export function HighRiskModal({ prompt, onCancel, onConfirm }: HighRiskModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [prompt?.dealId]);

  if (!prompt) return null;
  const isAdmin = prompt.viewerRole === 'admin';

  return (
    <div className="bg-ink/30 fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hr-modal-title"
        className="border-line w-full max-w-[460px] rounded-[6px] border bg-white p-5 shadow-md"
      >
        <div className="titlecaps mb-2 text-rose-700">High-risk dealer · BRD §3.4</div>
        <h2 id="hr-modal-title" className="text-ink mb-3 text-[18px] font-semibold tracking-tight">
          {isAdmin ? 'Override required' : 'Admin override required'}
        </h2>
        <div className="text-mute mb-4 space-y-1 text-[12.5px] leading-snug">
          <p>
            <span className="text-ink">{prompt.dealTitle}</span> is for{' '}
            <span className="text-ink">{prompt.dealerName}</span> (high-risk).
          </p>
          <p>
            Moving from <span className="mono">{prompt.fromStage.shortName}</span> to{' '}
            <span className="mono">{prompt.toStage.shortName}</span> crosses the Negotiation
            boundary — it can only proceed with an admin override and a recorded reason.
          </p>
        </div>

        {isAdmin ? (
          <>
            <label className="text-ink mb-1 block text-[12px] font-medium">
              Override reason <span className="text-rose-700">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is it safe to proceed past Negotiation?"
              className="border-line focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
              autoFocus
            />
            <p className="text-mute mt-1 text-[11px]">
              Saved on the stage-history row for compliance review.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="default" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={reason.trim().length < 3}
                onClick={() => onConfirm(reason.trim())}
              >
                Override & move
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="primary" onClick={onCancel}>
              Got it
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
