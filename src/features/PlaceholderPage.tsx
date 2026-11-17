import { PageHeader } from "../app/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";

/** Simple placeholder for pages that get built in later slices. */
export function PlaceholderPage({
  title,
  slice,
  text,
}: {
  title: string;
  slice: number;
  text: string;
}) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState label={`Coming in Slice ${slice}`} title={title} text={text} />
      </Card>
    </>
  );
}
