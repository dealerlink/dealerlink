'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import { DealCard, type DealCardData } from './deal-card';

interface DraggableDealCardProps {
  card: DealCardData;
  disabled?: boolean;
}

export function DraggableDealCard({ card, disabled = false }: DraggableDealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <DealCard card={card} asOverlay />
    </div>
  );
}
