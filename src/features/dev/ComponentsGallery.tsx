import { Plus, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageHeader } from "../../app/PageHeader";
import { Avatar } from "../../components/Avatar";
import { BlipError, BlipIdle, BlipSuccess } from "../../components/blip/BlipPoses";
import { BottomSheet } from "../../components/BottomSheet";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { BrandPills } from "../../components/BrandPills";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { CreditsMeter } from "../../components/CreditsMeter";
import { EmptyState } from "../../components/EmptyState";
import { KpiTile } from "../../components/KpiTile";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useToast } from "../../components/toast-context";
import { sampleBrands, sampleCredits } from "../../lib/sample-data";

/**
 * DEV ONLY (route /dev/components, not in production builds).
 * Every shared component and its states, for review at 390 / 768 / 1440 and for Playwright.
 */
export function ComponentsGallery() {
  const toast = useToast();
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [platform, setPlatform] = useState<"both" | "instagram" | "tiktok">("both");
  const [open, setOpen] = useState<"dialog" | "sheet" | "responsive" | "idea" | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <PageHeader title="Components" crumbs={["Dev", "Components"]} />
      <div className="flex flex-col gap-6">
        <Section title="Button">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="danger">Remove Found</Button>
            <Button icon={<RefreshCw size={16} />}>Refresh</Button>
            <Button variant="secondary" icon={<Plus size={16} />}>
              Add competitor
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="text">Cancel</Button>
          </div>
        </Section>

        <Section title="Segmented control">
          <div className="flex flex-wrap gap-3">
            <SegmentedControl
              label="Date range"
              value={range}
              onChange={setRange}
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
            />
            <SegmentedControl
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={[
                { value: "both", label: "Both" },
                { value: "instagram", label: "Instagram" },
                { value: "tiktok", label: "TikTok" },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Brand pills"
          info="Pick up to 3 brands to compare. Selection is shared with Overview, Instagram and TikTok."
        >
          <BrandPills brands={sampleBrands} />
        </Section>

        <Section title="Chip">
          <div className="flex flex-wrap gap-2">
            <Chip>#glp1</Chip>
            <Chip>Reel</Chip>
            <Chip tone="ok">OK</Chip>
            <Chip tone="danger">TikTok not found</Chip>
            <Chip tone="flash">Event</Chip>
          </div>
        </Section>

        <Section title="KPI tile">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile label="Posts tracked" value="214" caption="Across 6 brands, both platforms" />
            <KpiTile
              label="Best format"
              value="Reels"
              caption="2.1× the engagement of single images"
            />
            <KpiTile label="Most active" value="Hims" caption="46 posts, about 1.5 a day" />
            <KpiTile
              label="Best time to post"
              value="Tue 6–8 pm"
              caption="US Eastern, by avg engagement"
            />
          </div>
        </Section>

        <Section title="Dialog · Bottom sheet · Toast">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOpen("dialog")}>
              Open dialog
            </Button>
            <Button variant="secondary" onClick={() => setOpen("sheet")}>
              Open bottom sheet
            </Button>
            <Button variant="secondary" onClick={() => setOpen("responsive")}>
              Open responsive dialog
            </Button>
            <Button variant="secondary" onClick={() => setOpen("idea")}>
              Delete idea (confirm)
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({
                  title: "Pull complete",
                  detail: "228 posts · 112 credits used · 476 left",
                  pose: "success",
                  action: { label: "See what's new", onClick: () => {} },
                })
              }
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({
                  title: "Finished with problems",
                  detail: "Found · TikTok handle not found",
                  pose: "error",
                  action: { label: "Fix handle", onClick: () => {} },
                })
              }
            >
              Error toast
            </Button>
          </div>
        </Section>

        <Section title="Avatar · Credits meter">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar initials="All" tone="all" />
            <Avatar initials="Hi" />
            <Avatar initials="Ro" tone="pop" />
            <Avatar initials="He" tone="blue" />
            <Avatar initials="FN" tone="user" size="md" />
            <Avatar initials="FN" tone="user" size="lg" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-card bg-sidebar p-4">
              <CreditsMeter state={{ status: "ready", credits: sampleCredits }} />
            </div>
            <CreditsMeter state={{ status: "ready", credits: sampleCredits }} variant="card" />
            <div className="rounded-card bg-sidebar p-4">
              <CreditsMeter state={{ status: "loading" }} />
            </div>
            <div className="rounded-card bg-sidebar p-4">
              <CreditsMeter state={{ status: "error", retry: () => {} }} />
            </div>
            <CreditsMeter
              state={{ status: "ready", credits: { ...sampleCredits, stale: true } }}
              variant="card"
            />
          </div>
        </Section>

        <Section title="Blip (static poses until Slice 13)">
          <div className="flex flex-wrap gap-6">
            <BlipIdle className="h-auto w-24" title="Blip idle" />
            <BlipSuccess className="h-auto w-24" title="Blip success" />
            <BlipError className="h-auto w-24" title="Blip error" />
          </div>
        </Section>

        <Card title="Empty state" info="Blip/Idle + mono label + title + one line + actions.">
          <EmptyState
            label="No pulls yet"
            title="Pull your first data"
            text="Competitors are pre-filled. Pull to see what's working."
            actions={<Button>Pull data now</Button>}
          />
        </Card>
      </div>

      {/* Confirm pattern (Remove competitor / Clear pull / Delete idea): ConfirmDialog, centred. */}
      <ConfirmDialog
        open={open === "dialog"}
        onClose={close}
        title="Remove Found?"
        description="Found's saved posts will disappear from the dashboards and won't be pulled again. Ideas saved from its posts stay on the idea board."
        confirmLabel="Remove Found"
        onConfirm={close}
      />
      <ConfirmDialog
        open={open === "idea"}
        onClose={close}
        title="Delete idea?"
        description="The idea, its note and comments are deleted. Calendar cards made from it stay."
        confirmLabel="Delete idea"
        onConfirm={close}
      />
      <BottomSheet
        open={open === "sheet"}
        onClose={close}
        title="Refresh competitor data?"
        description="Pulls the latest public posts for 6 brands and replaces the pull from 6 Nov."
        primary={{ label: "Pull now", onClick: close }}
      />
      <ConfirmDialog
        open={open === "responsive"}
        onClose={close}
        title="Clear saved pull?"
        description="The latest pull's posts and thumbnails will be deleted. Ideas keep their saved copy."
        confirmLabel="Clear pull"
        onConfirm={close}
      />
    </>
  );
}

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <Card title={title} info={info}>
      {children}
    </Card>
  );
}
