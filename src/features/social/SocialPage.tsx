import { PageHeader } from "../../app/PageHeader";
import { BrandPills } from "../../components/BrandPills";
import { Card } from "../../components/Card";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { EmptyState } from "../../components/EmptyState";
import { KpiTile } from "../../components/KpiTile";
import { LoadError } from "../../components/LoadError";
import { Bone, Skeleton, SkeletonCard, SkeletonKpis } from "../../components/Skeleton";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useBrandSelection } from "../../lib/brand-selection-context";
import type { ShownPlatform as Platform } from "../../lib/platforms";
import { type Competitor, useCompetitors } from "../../lib/useCompetitors";
import { useOverviewFilters, usePlatformNav } from "../overview/filters";
import { type BrandRef, filterPosts } from "../overview/metrics";
import {
  DateRangeControl,
  DateRangeSelect,
  LastPulled,
  PlatformNav,
} from "../overview/OverviewControls";
import { type SavedPull, usePullPosts, useSavedPulls } from "../overview/useOverviewData";
import { RefreshButton } from "../pulls/RefreshButton";
import { FormatsSideBySideCard, HashtagOverlapCard, HeadToHeadCard } from "./CompareCards";
import { BestTimesCard, FormatsCard, HashtagsCard, SocialTopPosts } from "./SocialCards";
import {
  formatsByBrand,
  formatStats,
  hashtagOverlap,
  headToHead,
  heatmap,
  socialKpis,
  topHashtags,
} from "./social-metrics";

const NAME: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };

/**
 * Instagram and TikTok pages (06a all brands · 06b one brand · 06c compare 2–3; M05 / M06).
 * Same layout for both; TikTok shows views (likes + comments still rank). Reads the last saved pull
 * only — never fetches from Firecrawl. Date range from the URL, brand pills shared with Overview.
 * Mobile: one "Social" tab with an Instagram ↔ TikTok switch.
 */
export function SocialPage({ platform }: { platform: Platform }) {
  const saved = useSavedPulls();
  const competitors = useCompetitors();
  const { selected } = useBrandSelection();
  const brands: BrandRef[] = (competitors.data ?? []).map(({ id, name, initials }) => ({
    id,
    name,
    initials,
  }));
  const chosen = selected
    .map((id) => brands.find((b) => b.id === id))
    .filter((b): b is BrandRef => !!b);

  const title =
    chosen.length === 0
      ? NAME[platform]
      : `${chosen.map((b) => b.name).join(" vs ")} on ${NAME[platform]}`;
  const mobileTitle = chosen.length >= 2 ? chosen.map((b) => b.name).join(" vs ") : "Social";
  const crumbs = [NAME[platform], ...(chosen.length >= 2 ? ["Compare"] : [])];
  const latest = saved.data?.latest ?? null;

  const header = (
    <>
      <PageHeader
        title={title}
        mobileTitle={mobileTitle}
        crumbs={crumbs}
        actions={
          <>
            {latest && <LastPulled startedAt={latest.started_at} className="hidden md:flex" />}
            {/* Wrapper hides it on mobile: SegmentedControl sets inline-flex, which beats `hidden`. */}
            <span className="hidden md:inline-flex">
              <DateRangeControl />
            </span>
            <RefreshButton />
          </>
        }
      />
      <PlatformSwitch platform={platform} />
      {/* Tablet/desktop: same Both / Instagram / TikTok switch as Overview (Both → /overview). */}
      <div className="mb-4 hidden md:flex">
        <PlatformNav current={platform} />
      </div>
      {latest && (
        <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
          <LastPulled startedAt={latest.started_at} className="flex min-w-0" />
          <DateRangeSelect />
        </div>
      )}
      <BrandPills brands={brands} />
    </>
  );

  if (saved.isError || competitors.isError) {
    return (
      <>
        {header}
        <LoadError
          className="mt-6"
          title="The saved pull didn’t load"
          text="Check your connection and try again. Nothing was pulled or changed."
          onRetry={() => void Promise.all([saved.refetch(), competitors.refetch()])}
        />
      </>
    );
  }
  if (!saved.data || !competitors.data) {
    return (
      <>
        {header}
        <SocialSkeleton />
      </>
    );
  }
  if (!latest) {
    return (
      <>
        {header}
        <Card className="mt-6">
          <EmptyState
            label="No pull yet"
            title={`No ${NAME[platform]} posts yet`}
            text="Press Refresh to pull your competitors’ public posts. Overview shows what a pull costs first."
          />
        </Card>
      </>
    );
  }
  return (
    <>
      {header}
      <SocialBody
        latest={latest}
        platform={platform}
        brands={brands}
        chosen={chosen}
        competitors={competitors.data}
      />
    </>
  );
}

/** Instagram | TikTok, full width, mobile only (M05) — the Social tab. Keeps date range and brands. */
function PlatformSwitch({ platform }: { platform: Platform }) {
  const go = usePlatformNav();
  return (
    <div className="mb-4 md:hidden">
      <SegmentedControl
        label="Platform"
        fullWidth
        value={platform}
        onChange={(p) => p !== platform && go(p)}
        options={[
          {
            value: "instagram",
            label: (
              <>
                <InstagramIcon size={16} aria-hidden="true" /> Instagram
              </>
            ),
          },
          {
            value: "tiktok",
            label: (
              <>
                <TikTokIcon size={16} aria-hidden="true" /> TikTok
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

function SocialBody({
  latest,
  platform,
  brands,
  chosen,
  competitors,
}: {
  latest: SavedPull;
  platform: Platform;
  brands: BrandRef[];
  chosen: BrandRef[];
  competitors: Competitor[];
}) {
  const { days } = useOverviewFilters();
  const { selected } = useBrandSelection();
  const latestPosts = usePullPosts(latest.id);

  if (latestPosts.isError) {
    return (
      <LoadError
        className="mt-6"
        title="Posts didn’t load"
        text="Check your connection and try again. Nothing was pulled or changed."
        onRetry={() => void latestPosts.refetch()}
      />
    );
  }
  if (!latestPosts.data) return <SocialSkeleton />;

  const allBrandPosts = filterPosts(
    latestPosts.data,
    { platform, days, brandIds: [] },
    latest.started_at,
  );
  const posts = selected.length
    ? allBrandPosts.filter((p) => selected.includes(p.competitor_id))
    : allBrandPosts;

  const hasHandle = (c: Competitor) =>
    platform === "tiktok" ? !!c.tiktok_handle : !!c.instagram_handle;
  const missingHandle =
    chosen.length === 1 && competitors.some((c) => c.id === chosen[0].id && !hasHandle(c));

  if (posts.length === 0) {
    return (
      <Card className="mt-6">
        <EmptyState
          label="Nothing here"
          title={
            missingHandle
              ? `${chosen[0].name} has no ${NAME[platform]} handle`
              : `No ${NAME[platform]} posts in the last ${days} days`
          }
          text={
            missingHandle
              ? "Add one on Competitors; it’s pulled on the next Refresh."
              : days === 7
                ? "Try 30 days, the other platform, or All brands."
                : "Try the other platform or All brands."
          }
        />
      </Card>
    );
  }

  if (chosen.length >= 2) {
    return (
      <div className="mt-6 flex flex-col gap-6">
        <HeadToHeadCard cols={headToHead(posts, chosen)} days={days} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <FormatsSideBySideCard rows={formatsByBrand(posts, chosen)} brands={chosen} />
          <HashtagOverlapCard columns={hashtagOverlap(posts, chosen)} brands={chosen} />
        </div>
      </div>
    );
  }

  const kpis = socialKpis({ posts, allBrandPosts, brands, selected, platform, days });
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiTile key={k.label} label={k.label} value={k.value} caption={k.caption} />
        ))}
      </div>
      <div className="mt-6">
        <SocialTopPosts posts={posts} brands={brands} platform={platform} />
      </div>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <FormatsCard stats={formatStats(posts)} platform={platform} />
          <HashtagsCard tags={topHashtags(posts)} />
        </div>
        <BestTimesCard
          map={heatmap(posts)}
          scope={chosen.length === 1 ? `for ${chosen[0].name}` : "across all brands"}
        />
      </div>
    </>
  );
}

/** 06a in its real shape: KPI tiles, the top posts strip, then formats + hashtags and best times. */
function SocialSkeleton() {
  return (
    <Skeleton label="Loading the saved pull" className="mt-6">
      <SkeletonKpis />
      <SkeletonCard className="mt-6">
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:px-0 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex w-55 shrink-0 flex-col gap-2 md:w-auto">
              <Bone className="h-23" />
              <Bone className="h-3 w-1/3" />
              <Bone className="h-3.5 w-5/6" />
              <Bone className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SkeletonCard>
            <div className="flex flex-col gap-4">
              {["w-11/12", "w-2/3", "w-2/5"].map((w) => (
                <div key={w} className="flex items-center gap-3">
                  <Bone className="h-3.5 w-20 shrink-0" />
                  <Bone className={`h-2.5 ${w}`} />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <div className="flex flex-wrap gap-2">
              {["w-28", "w-16", "w-24", "w-32", "w-20", "w-24"].map((w, i) => (
                <Bone key={i} className={`h-6 rounded-full ${w}`} />
              ))}
            </div>
          </SkeletonCard>
        </div>
        <SkeletonCard>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Bone key={i} className="h-5 rounded-sm" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    </Skeleton>
  );
}
