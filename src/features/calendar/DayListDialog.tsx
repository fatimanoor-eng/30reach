import { Plus } from "lucide-react";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import type { CalendarCard } from "./calendar-ui";
import { CardTile } from "./CardTile";
import type { IsoDay } from "./events/dates";
import { dayLabel } from "./format";

/**
 * A day's full list (polish: "+N more" in a month cell). Every card on that day, AI and manual alike;
 * a card opens 09, "Add post" adds another on this day.
 */
export function DayListDialog({
  day,
  cards,
  onClose,
  onOpenCard,
  onAddPost,
}: {
  day: IsoDay;
  cards: CalendarCard[];
  onClose: () => void;
  onOpenCard: (id: string) => void;
  onAddPost: (day: IsoDay) => void;
}) {
  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title={dayLabel(day)}
      description={`${cards.length} ${cards.length === 1 ? "post" : "posts"} planned`}
      primary={{
        label: "Add post",
        icon: <Plus size={16} />,
        onClick: () => {
          onClose();
          onAddPost(day);
        },
      }}
      cancelLabel="Close"
    >
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li key={card.id}>
            <CardTile
              card={card}
              onClick={() => {
                onClose();
                onOpenCard(card.id);
              }}
            />
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
