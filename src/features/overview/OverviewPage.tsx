import { PageHeader } from "../../app/PageHeader";
import { BlipIdle } from "../../components/blip/BlipPoses";
import { BrandPills } from "../../components/BrandPills";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { KpiTile } from "../../components/KpiTile";
import { useBrandSelection } from "../../lib/brand-selection-context";
import { useClient } from "../../lib/useClient";
import { type Competitor, useCompetitors } from "../../lib/useCompetitors";
import { RefreshButton } from "../pulls/RefreshButton";
import { useOverviewFilters } from "./filters";
import { FirstRun } from "./FirstRun";
import { LeaderboardCard } from "./LeaderboardCard";
import {
  type BrandRef,
  filterPosts,
  type Filters,
  kpis,
  leaderboard,
  topPosts,
  whatsNew,
} from "./metrics";
import { DateRangeControl, DateRangeSelect, LastPulled, PlatformNav } from "./OverviewControls";
import { TopPostsCard } from "./TopPostsCard";
import { type SavedPull, usePullPosts, useSavedPulls } from "./useOverviewData";
import { WhatsNewBar } from "./WhatsNewBar";

/** 03 First run (no real pull yet) or 04 Overview, from the last saved pull. Never fetches from Firecrawl. */
export function OverviewPage() {
  const client = useClient();
  const saved = useSavedPulls();
  const competitors = useCompetitors();

  if (saved.isError || competitors.isError || client.isError) {
    return (
      <>
        <PageHeader title="Overview" actions={<RefreshButton />} />
        <Card>
          <EmptyState
            label="Couldn’t load"
            title="The saved pull didn’t load"
            text="Check your connection and try again. Nothing was pulled or changed."
            actions={
              <Button
                variant="secondary"
                onClick={() =>
                  void Promise.all([saved.refetch(), competitors.refetch(), client.refetch()])
                }
              >
                Try again
              </Button>
            }
          />
        </Card>
      </>
    );
  }
  if (!saved.data || !competitors.data || !client.data) return <OverviewSkeleton />;
  if (!saved.data.latest)
    return <FirstRun clientName={client.data.name} competitors={competitors.data} />;
  return (
    <Dashboard
      latest={saved.data.latest}
      previous={saved.data.previous}
      competitors={competitors.data}
    />
  );
}

function Dashboard({
  latest,
  previous,
  competitors,
}: {
  latest: SavedPull;
  previous: SavedPull | null;
  competitors: Competitor[];
}) {
  const { days } = useOverviewFilters();
  const { selected } = useBrandSelection();
  const latestPosts = usePullPosts(latest.id);
  const previousPosts = usePullPosts(previous?.id);

  const brands: BrandRef[] = competitors.map(({ id, name, initials }) => ({ id, name, initials }));
  // Overview always covers both platforms; Instagram / TikTok have their own pages.
  const f: Filters = { platform: "both", days, brandIds: selected };
  const inScope = selected.length ? brands.filter((b) => selected.includes(b.id)) : brands;

  const header = (
    <>
      <PageHeader
        title="Overview"
        actions={
          <>
            <LastPulled startedAt={latest.started_at} className="hidden md:flex" />
            {/* Wrapper hides it on mobile: SegmentedControl sets inline-flex, which beats `hidden`. */}
            <span className="hidden md:inline-flex">
              <DateRangeControl />
            </span>
            <RefreshButton />
          </>
        }
      />
      <LastPulled startedAt={latest.started_at} className="-mt-3 mb-4 flex md:hidden" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PlatformNav current="both" />
        <DateRangeSelect className="md:hidden" />
      </div>
      <BrandPills brands={brands} />
    </>
  );

  if (latestPosts.isError) {
    return (
      <>
        {header}
        <Card className="mt-6">
          <EmptyState
            label="Couldn’t load"
            title="Posts didn’t load"
            text="Nothing was pulled or changed. Try again."
            actions={
              <Button variant="secondary" onClick={() => void latestPosts.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      </>
    );
  }
  if (!latestPosts.data) {
    return (
      <>
        {header}
        <SkeletonBlocks />
      </>
    );
  }

  const posts = filterPosts(latestPosts.data, f, latest.started_at);
  const news =
    previous && previousPosts.data
      ? whatsNew(
          latestPosts.data,
          previousPosts.data,
          f,
          latest.started_at,
          previous.started_at,
          brands,
        )
      : null;

  return (
    <>
      {header}
      {news && previous && (
        <WhatsNewBar
          latestPullId={latest.id}
          previousStartedAt={previous.started_at}
          summary={news.summary}
        />
      )}

      {posts.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            label="Nothing here"
            title={`No posts in the last ${days} days`}
            text={
              days === 7
                ? "Try 30 days, another platform, or All brands."
                : "Try another platform or All brands."
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            {kpis(posts, brands, f).map((k) => (
              <KpiTile
                key={k.label}
                label={k.label}
                shortLabel={k.shortLabel}
                value={k.value}
                caption={k.caption}
                mobileSuffix={k.mobileSuffix}
              />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <LeaderboardCard rows={leaderboard(posts, inScope)} rankDelta={news?.rankDelta} />
            <TopPostsCard posts={topPosts(posts, 6)} brands={brands} newIds={news?.newPostIds} />
          </div>
        </>
      )}
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <PageHeader title="Overview" actions={<RefreshButton />} />
      <SkeletonBlocks />
    </>
  );
}

function SkeletonBlocks() {
  const block = "rounded-tile bg-soft motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading the saved pull" className="mt-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-28 ${block}`} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className={`h-96 ${block}`} />
        <div className={`flex h-96 items-center justify-center ${block}`}>
          <BlipIdle className="h-auto w-16 opacity-60" />
        </div>
      </div>
    </div>
  );
}
