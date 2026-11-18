import { Button } from "./Button";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";

/**
 * A load failed (Overview, Social, Calendar, Competitors, Ideas): Blip/Error, what didn't load,
 * one reassuring line and "Try again". In a card, like the content it replaces.
 */
export function LoadError({
  title,
  text = "Check your connection and try again. Nothing was changed.",
  onRetry,
  className = "",
}: {
  title: string;
  text?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div role="alert">
        <EmptyState
          pose="error"
          label="Couldn’t load"
          title={title}
          text={text}
          actions={
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </div>
    </Card>
  );
}
