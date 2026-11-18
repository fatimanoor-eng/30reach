import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { Idea } from "../ideas/idea-rules";
import type { CalendarCard } from "./calendar-ui";
import { CardTile } from "./CardTile";
import type { IsoDay } from "./events/dates";
import { IdeaPanelItem } from "./IdeaPanel";

/** Draggable ids: a card's id, or "idea:<id>" for an idea in the panel. Droppables are days. */
export const IDEA_DRAG = "idea:";

/**
 * Drag and drop for the 08 month view: cards move between days, and ideas from the idea panel can
 * be dropped on a day to plan them (same as Plan it). One context around the grid and the panel.
 * Mouse, or touch-and-hold on tablets; the day under the pointer wins.
 */
export function CalendarDnd({
  cards,
  ideas,
  onMoveCard,
  onPlanIdea,
  children,
}: {
  cards: CalendarCard[];
  ideas: Idea[];
  onMoveCard: (id: string, day: IsoDay) => void;
  onPlanIdea: (idea: Idea, day: IsoDay) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [dragging, setDragging] = useState<
    { kind: "card"; card: CalendarCard } | { kind: "idea"; idea: Idea } | null
  >(null);

  const find = (id: string) => {
    if (id.startsWith(IDEA_DRAG)) {
      const idea = ideas.find((i) => i.id === id.slice(IDEA_DRAG.length));
      return idea ? ({ kind: "idea", idea } as const) : null;
    }
    const card = cards.find((c) => c.id === id);
    return card ? ({ kind: "card", card } as const) : null;
  };

  const onDragStart = ({ active }: DragStartEvent) => setDragging(find(String(active.id)));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const item = find(String(active.id));
    if (!item || !over) return;
    const day = String(over.id);
    if (item.kind === "card" && day !== item.card.date) onMoveCard(item.card.id, day);
    if (item.kind === "idea") onPlanIdea(item.idea, day);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {dragging?.kind === "card" && <CardTile card={dragging.card} dragging />}
        {dragging?.kind === "idea" && <IdeaPanelItem idea={dragging.idea} dragging />}
      </DragOverlay>
    </DndContext>
  );
}
