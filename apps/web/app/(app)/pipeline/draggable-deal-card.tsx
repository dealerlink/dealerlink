'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';

import { DealCard, type DealCardData } from './deal-card';

interface DraggableDealCardProps {
  card: DealCardData;
  disabled?: boolean;
}

/**
 * Draggable kanban card. dnd-kit's PointerSensor attaches a pointerdown
 * listener that calls preventDefault(), which kills the anchor's native
 * click handling. We render the card without an internal Link and route
 * via useRouter on click — but only when no drag is in progress.
 */
export function DraggableDealCard({ card, disabled = false }: DraggableDealCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
  };

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    router.push(`/pipeline/${card.id}`);
  }

  return (
    <a
      ref={setNodeRef}
      style={style}
      href={`/pipeline/${card.id}`}
      onClick={onClick}
      className="block focus:outline-none"
      {...listeners}
      {...attributes}
    >
      <DealCard card={card} asOverlay />
    </a>
  );
}
