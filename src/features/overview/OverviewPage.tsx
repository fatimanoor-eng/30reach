import { PageHeader } from "../../app/PageHeader";
import { BrandPills } from "../../components/BrandPills";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { sampleBrands } from "../../lib/sample-data";
import { SelectionSummary } from "../SelectionSummary";

export function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" />
      <BrandPills brands={sampleBrands} />
      <SelectionSummary />
      <Card className="mt-6">
        <EmptyState
          label="Coming in Slice 6"
          title="Overview"
          text="KPIs, the leaderboard and top posts from the last saved pull."
        />
      </Card>
    </>
  );
}
