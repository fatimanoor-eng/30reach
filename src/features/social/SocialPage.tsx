import { useNavigate } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { BrandPills } from "../../components/BrandPills";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { sampleBrands } from "../../lib/sample-data";
import { SelectionSummary } from "../SelectionSummary";

type Platform = "instagram" | "tiktok";
const titles: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };

/**
 * Instagram and TikTok pages (same layout; TikTok shows views).
 * Mobile: one "Social" tab with an Instagram ↔ TikTok switch at the top (ANNOTATIONS › Mobile).
 */
export function SocialPage({ platform }: { platform: Platform }) {
  const navigate = useNavigate();

  return (
    <>
      <SegmentedControl
        label="Platform"
        className="mb-4 md:hidden"
        value={platform}
        onChange={(p) => navigate(`/${p}`)}
        options={[
          { value: "instagram", label: "Instagram" },
          { value: "tiktok", label: "TikTok" },
        ]}
      />
      <PageHeader title={titles[platform]} />
      <BrandPills brands={sampleBrands} />
      <SelectionSummary />
      <Card className="mt-6">
        <EmptyState
          label="Coming in Slice 7"
          title={titles[platform]}
          text={
            platform === "tiktok"
              ? "Same layout as Instagram, with views instead of likes."
              : "KPIs, top posts, formats, hashtags and best times to post."
          }
        />
      </Card>
    </>
  );
}
