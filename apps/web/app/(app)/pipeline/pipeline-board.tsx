'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DealStage } from '@dealerlink/db';
import { useState, useTransition } from 'react';

import { transitionDealStage } from '@/lib/actions/deals';

import { DealCard, type DealCardData } from './deal-card';
import { DraggableDealCard } from './draggable-deal-card';
import { DroppableColumn } from './droppable-column';
import { HighRiskModal, type HighRiskPrompt } from './high-risk-modal';
import { STAGE_NUMBER, STAGES, clientAllowedTargets } from './stage-meta';

export interface PipelineBoardProps {
  initialByStage: Record<DealStage, DealCardData[]>;
  viewerRole: 'admin' | 'sales' | 'accounts' | 'dispatch';
  viewerId: string;
}

type Toast = { kind: 'error' | 'info'; message: string } | null;

function stageOf(idOrLocator: string): DealStage | null {
  if (!idOrLocator.startsWith('stage:')) return null;
  return idOrLocator.slice('stage:'.length) as DealStage;
}

export function PipelineBoard({ initialByStage, viewerRole }: PipelineBoardProps) {
  const [byStage, setByStage] = useState<Record<DealStage, DealCardData[]>>(initialByStage);
  const [dragging, setDragging] = useState<DealCardData | null>(null);
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<Toast>(null);
  const [highRiskPrompt, setHighRiskPrompt] = useState<HighRiskPrompt | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function stageMeta(key: DealStage) {
    return STAGES.find((s) => s.key === key)!;
  }

  function commitMove(
    dealId: string,
    fromStage: DealStage,
    toStage: DealStage,
    overrideReason?: string,
  ) {
    const fromList = byStage[fromStage] ?? [];
    const card = fromList.find((c) => c.id === dealId);
    if (!card) return;
    const next = {
      ...byStage,
      [fromStage]: fromList.filter((c) => c.id !== dealId),
      [toStage]: [card, ...(byStage[toStage] ?? [])],
    };
    setByStage(next);

    startTransition(async () => {
      const result = await transitionDealStage({
        id: dealId,
        toStage,
        ...(overrideReason ? { overrideReason } : {}),
      });
      if (!result.ok) {
        setByStage(byStage);
        const msg =
          result.error.code === 'FORBIDDEN' && /high-risk/i.test(result.error.message)
            ? 'High-risk dealer — admin override required to move past Negotiation.'
            : result.error.message;
        setToast({ kind: 'error', message: msg });
      }
    });
  }

  const fromStageOf = (dealId: string): DealStage | null => {
    for (const s of STAGES) {
      if (byStage[s.key]?.some((c) => c.id === dealId)) return s.key;
    }
    return null;
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const stage = fromStageOf(id);
    if (!stage) return;
    const card = byStage[stage]?.find((c) => c.id === id) ?? null;
    setDragging(card);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const dealId = String(e.active.id);
    const toStage = stageOf(String(e.over.id));
    if (!toStage) return;
    const fromStage = fromStageOf(dealId);
    if (!fromStage || fromStage === toStage) return;

    const allowed = clientAllowedTargets(fromStage, viewerRole);
    if (!allowed.includes(toStage)) {
      setToast({ kind: 'error', message: `Can't move from ${fromStage} to ${toStage}.` });
      return;
    }

    const card = byStage[fromStage]?.find((c) => c.id === dealId);
    if (!card) return;

    // High-risk guard: dealer.risk === 'high' AND target stage past Negotiation.
    const breachesGuard =
      card.dealer.riskLevel === 'high' && STAGE_NUMBER[toStage] > STAGE_NUMBER.negotiation;
    if (breachesGuard) {
      setHighRiskPrompt({
        dealId,
        dealTitle: card.title,
        dealerName: card.dealer.name,
        fromStage: stageMeta(fromStage),
        toStage: stageMeta(toStage),
        viewerRole,
      });
      return;
    }

    commitMove(dealId, fromStage, toStage);
  }

  function onOverrideConfirm(overrideReason: string) {
    if (!highRiskPrompt) return;
    const { dealId, fromStage, toStage } = highRiskPrompt;
    setHighRiskPrompt(null);
    commitMove(dealId, fromStage.key, toStage.key, overrideReason);
  }

  // Compute per-column highlight relative to the currently dragged card.
  const draggingFromStage = dragging ? fromStageOf(dragging.id) : null;
  const allowedTargets = draggingFromStage
    ? clientAllowedTargets(draggingFromStage, viewerRole)
    : null;

  return (
    <div className="relative">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const cards = byStage[stage.key] ?? [];
            const totalValue = cards.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0);
            const highlight =
              draggingFromStage == null || stage.key === draggingFromStage
                ? 'none'
                : allowedTargets?.includes(stage.key)
                  ? 'valid'
                  : 'invalid';
            return (
              <DroppableColumn
                key={stage.key}
                stage={stage}
                count={cards.length}
                totalValue={totalValue}
                highlight={highlight}
              >
                {cards.length === 0 ? (
                  <div className="text-mute editorial flex h-full items-center justify-center text-[11.5px] italic">
                    —
                  </div>
                ) : (
                  cards.map((card) => <DraggableDealCard key={card.id} card={card} />)
                )}
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? <DealCard card={dragging} dragging asOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <HighRiskModal
        prompt={highRiskPrompt}
        onCancel={() => setHighRiskPrompt(null)}
        onConfirm={onOverrideConfirm}
      />

      {toast && (
        <div
          role="status"
          className="border-line fixed bottom-6 right-6 z-40 max-w-[360px] rounded-[6px] border bg-white px-4 py-3 text-[12.5px] shadow-md"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-1 inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
              style={{ background: toast.kind === 'error' ? '#B91C1C' : '#4F46E5' }}
            />
            <div className="flex-1">{toast.message}</div>
            <button
              type="button"
              className="text-mute hover:text-ink text-[11px]"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
