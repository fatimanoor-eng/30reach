import { ArrowUpRight, Globe, Lock, Plus } from "lucide-react";
import { BackButton } from "./BackButton";
import { Checkbox } from "../../../components/Checkbox";
import { useId, useState, type ComponentType } from "react";
import { ClientMark } from "../../../app/ClientMark";
import { BlipIdle } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Chip } from "../../../components/Chip";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  PinterestIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from "../../../components/icons/BrandIcons";
import { SelectField } from "../../../components/SelectField";
import { Switch } from "../../../components/Switch";
import { TextField } from "../../../components/TextField";
import { checksSummary, initialsFor, normaliseWebsite, siteHost } from "../../../lib/client-rules";
import { COUNTRIES, countryName, LANGUAGES, languageName } from "../../../lib/countries";
import type { Platform } from "../../../lib/platforms";
import { MQ_TABLET_UP, useMediaQuery } from "../../../lib/useMediaQuery";
import { suggestInitials } from "../../competitors/competitor-rules";
import { lookAlikeNote } from "../../competitors/look-alike";
import { followersLabel } from "./followers-label";
import { RuleForm } from "../RuleForm";
import { uploadLogo } from "../clients-api";
import { ACCOUNT_PLACEHOLDER, parseAccount } from "./account-input";
import {
  accountLabel,
  competitorMeta,
  competitorPlatforms,
  type CompetitorDraft,
  noAccountsFound,
  type FoundPlatform,
  isSupported,
  PLATFORM_LABEL,
  type PlatformDraft,
  type ReviewDraft,
  reviewErrors,
  summaryLine,
} from "./add-client-rules";

type IconC = ComponentType<{ size?: number | string; className?: string }>;
const ICON: Record<FoundPlatform, IconC> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  x: XIcon,
  youtube: YouTubeIcon,
  pinterest: PinterestIcon,
  threads: Globe,
};
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * 15d / M16 Review: Brand, Content rules (Blip's suggestions with their quotes), Platforms (site links
 * ALWAYS ON; the rest team toggles that open an inline handle / page field), Competitors (tick the ones to
 * track; the strongest 4 pre-ticked; account icons, unsupported in grey; "Add another competitor"), and a
 * sticky bar: "4 COMPETITORS · 2 PLATFORMS · FIRST PULL IS NEXT" · Back · Create client.
 */
export function ReviewStep({
  draft,
  onChange,
  onBack,
  onCreate,
  busy,
  error,
  competitorActions,
}: {
  draft: ReviewDraft;
  onChange: (d: ReviewDraft) => void;
  competitorActions: CompetitorActions;
  onBack: () => void;
  onCreate: () => void;
  busy: boolean;
  error: string | null;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const [tried, setTried] = useState(false);
  const errors = reviewErrors(draft, parseAccount);
  const set = (patch: Partial<ReviewDraft>) => onChange({ ...draft, ...patch });
  const host = draft.website.replace(/^https?:\/\/(www\.)?/, "");

  const brand = <BrandCard draft={draft} set={set} host={host} tried={tried} />;
  const rules = <RulesCard draft={draft} set={set} />;
  const platforms = <PlatformsCard draft={draft} set={set} tried={tried} />;
  const competitors = (
    <CompetitorsCard draft={draft} set={set} tried={tried} actions={competitorActions} />
  );

  return (
    <>
      <div className="mx-auto max-w-280 px-4 pt-6 pb-36 md:px-6 md:pt-10 xl:px-0">
        <h1 className="text-title md:text-display">Review {draft.name.trim() || host}</h1>
        <p className="mt-2 text-body-sm text-muted md:text-body">
          {tabletUp
            ? "Everything Blip found, ready to check. Edit anything; nothing is saved until you press Create client."
            : "Edit anything. Nothing is saved until you press Create client."}
        </p>
        {tabletUp ? (
          <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              {brand}
              {rules}
            </div>
            <div className="flex flex-col gap-4">
              {platforms}
              {competitors}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {brand}
            {platforms}
            {competitors}
            {rules}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-280 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 xl:px-0">
          <div className="flex items-center gap-3">
            {tabletUp && <BackButton onClick={onBack} disabled={busy} />}
            <p className="mono-label text-muted">{summaryLine(draft, { short: !tabletUp })}</p>
          </div>
          {error && (
            <p role="alert" className="text-small text-spark-text">
              {error}
            </p>
          )}
          {tried && errors.length > 0 && !error && (
            <p role="alert" className="text-small text-spark-text">
              Fix the fields marked in red first.
            </p>
          )}
          <div className="flex items-center gap-2">
            {/* Phones: Back bottom-left of the bar, Create on the right. */}
            {!tabletUp && <BackButton onClick={onBack} disabled={busy} />}
            <Button
              className="flex-1 md:flex-none"
              disabled={busy}
              onClick={() => {
                setTried(true);
                if (errors.length === 0) onCreate();
              }}
            >
              {busy ? "Creating…" : "Create client"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function BrandCard({
  draft,
  set,
  host,
  tried,
}: {
  draft: ReviewDraft;
  set: (p: Partial<ReviewDraft>) => void;
  host: string;
  tried: boolean;
}) {
  const fileId = useId();
  const descId = useId();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const colorError = draft.color.trim() && !HEX.test(draft.color.trim());
  return (
    <Card title="Brand">
      <p className="-mt-3 mb-4 text-small text-muted">From {host}. Change anything.</p>
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {draft.logoUrl ? (
            <span className="inline-flex size-16 items-center justify-center overflow-hidden rounded-card border border-line bg-white p-1">
              <img src={draft.logoUrl} alt="" className="size-full object-contain" />
            </span>
          ) : (
            <ClientMark
              client={{
                name: draft.name || host,
                initials: initialsFor(draft.name || host),
                brand_color: HEX.test(draft.color) ? draft.color : null,
              }}
              size="lg"
              className="size-16! rounded-card! text-body"
            />
          )}
          <label
            htmlFor={fileId}
            className="inline-flex min-h-11 cursor-pointer items-center text-small text-blue hover:underline md:min-h-6"
          >
            {uploading ? "Uploading…" : "Change"}
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              setLogoError(null);
              uploadLogo("scans", file)
                .then((path) => set({ logoPath: path, logoUrl: URL.createObjectURL(file) }))
                .catch(() =>
                  setLogoError("Couldn’t use that image. Try a PNG or JPEG under 200 KB."),
                )
                .finally(() => setUploading(false));
            }}
          />
        </div>
        <TextField
          label="Name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={80}
          className="min-w-0 flex-1"
          tone={tried && !draft.name.trim() ? "error" : "default"}
          message={tried && !draft.name.trim() ? "A name is needed." : undefined}
        />
      </div>
      {logoError && <p className="mt-2 text-small text-spark-text">{logoError}</p>}
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor={descId} className="mb-2 block mono-label text-muted">
            What they do
          </label>
          <textarea
            id={descId}
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={2}
            maxLength={400}
            className="[field-sizing:content] min-h-20 w-full resize-none rounded-control border border-line bg-surface px-3.5 py-2.5 text-body outline-none focus:border-ink"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Country"
            value={draft.country}
            onChange={(e) => set({ country: e.target.value })}
            options={[...new Set([draft.country, ...COUNTRIES])]
              .map((c) => ({ value: c, label: countryName(c) }))
              .sort((a, b) => a.label.localeCompare(b.label))}
          />
          <SelectField
            label="Language"
            value={draft.language}
            onChange={(e) => set({ language: e.target.value })}
            options={[...new Set([draft.language, ...LANGUAGES])].map((l) => ({
              value: l,
              label: languageName(l),
            }))}
            className="hidden md:block"
          />
          <TextField
            label="Industry"
            value={draft.industry}
            onChange={(e) => set({ industry: e.target.value })}
            maxLength={80}
          />
          <TextField
            label="Brand colour"
            value={draft.color}
            onChange={(e) => set({ color: e.target.value })}
            placeholder="#RRGGBB"
            maxLength={7}
            tone={colorError ? "error" : "default"}
            message={colorError ? "Use a hex colour like #C8493F." : undefined}
            icon={
              <input
                type="color"
                aria-label="Pick a brand colour"
                value={HEX.test(draft.color.trim()) ? draft.color.trim() : "#0b0b0c"}
                onChange={(e) => set({ color: e.target.value.toUpperCase() })}
                className="size-5 cursor-pointer rounded-[4px] border-0 bg-transparent p-0"
              />
            }
          />
        </div>
      </div>
    </Card>
  );
}

function RulesCard({ draft, set }: { draft: ReviewDraft; set: (p: Partial<ReviewDraft>) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  // 15d: "gifting brand, no regulated topics. Content check is off." — the industry leads when known.
  const summary =
    draft.regulated.length === 0
      ? `${draft.industry.trim() ? `${draft.industry.trim().toLowerCase()}, no` : "No"} regulated topics. Content check is off.`
      : checksSummary(draft.regulated, draft.audienceIsKids);
  return (
    <Card title="Content rules">
      <p className="-mt-3 mb-4 text-small text-muted">
        Blip’s suggestions from the website. Keep, edit or remove them.
      </p>
      <div className="mb-2 flex items-center gap-3 rounded-control bg-bg px-3 py-3 text-body-sm">
        <BlipIdle still className="h-auto w-7 shrink-0" />
        <p>Blip detected: {summary}</p>
      </div>
      <ul>
        {draft.rules.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="border-t border-line py-4">
              <RuleForm
                initial={r}
                onCancel={() => setEditing(null)}
                onSave={(rule, why) => {
                  set({ rules: draft.rules.map((x) => (x.id === r.id ? { ...x, rule, why } : x)) });
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={r.id} className="flex flex-col gap-1.5 border-t border-line py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-sm font-medium">{r.rule}</p>
                <div className="hidden shrink-0 gap-3 md:flex">
                  <RuleActions
                    onEdit={() => setEditing(r.id)}
                    onRemove={() => set({ rules: draft.rules.filter((x) => x.id !== r.id) })}
                  />
                </div>
              </div>
              {r.why && <p className="hidden text-small text-muted md:block">{r.why}</p>}
              {r.quote && (
                <p className="self-start rounded-[6px] bg-bg px-2.5 py-1.5 font-mono text-label text-muted">
                  “{r.quote}” · from the site
                </p>
              )}
              <div className="flex gap-4 md:hidden">
                <RuleActions
                  onEdit={() => setEditing(r.id)}
                  onRemove={() => set({ rules: draft.rules.filter((x) => x.id !== r.id) })}
                />
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <div className="border-t border-line pt-4">
          <RuleForm
            onCancel={() => setEditing(null)}
            onSave={(rule, why) => {
              set({
                rules: [
                  ...draft.rules,
                  {
                    id: `team-${draft.rules.length + 1}-${rule.length}`,
                    rule,
                    why,
                    source: "team",
                  },
                ],
              });
              setEditing(null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="mt-1 inline-flex min-h-11 items-center gap-2 text-body-sm text-blue hover:underline md:min-h-8"
        >
          <Plus size={16} aria-hidden="true" />
          Add a rule
        </button>
      )}
    </Card>
  );
}

function RuleActions({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-11 min-w-11 items-center text-small text-blue hover:underline md:min-h-6 md:min-w-0"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex min-h-11 min-w-11 items-center text-small text-muted hover:text-ink md:min-h-6 md:min-w-0"
      >
        Remove
      </button>
    </>
  );
}

function PlatformsCard({
  draft,
  set,
  tried,
}: {
  draft: ReviewDraft;
  set: (p: Partial<ReviewDraft>) => void;
  tried: boolean;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const update = (p: PlatformDraft, patch: Partial<PlatformDraft>) =>
    set({
      platforms: draft.platforms.map((x) => (x.platform === p.platform ? { ...x, ...patch } : x)),
    });
  return (
    <Card title="Platforms">
      <p className="-mt-3 mb-2 text-small text-muted">
        {tabletUp
          ? "Platforms on their website are always tracked. Add more by hand."
          : "On when their website links them."}
      </p>
      <ul>
        {draft.platforms.map((p) => {
          const Icon = ICON[p.platform];
          const later = !isSupported(p.platform);
          const parsed =
            p.input.trim() && isSupported(p.platform) ? parseAccount(p.platform, p.input) : null;
          const meta =
            p.source === "website"
              ? `${accountLabel(p.account!)} · ${tabletUp ? "from the website" : "website"}`
              : !tabletUp
                ? "Not on their site"
                : p.platform === "linkedin"
                  ? "Not on their site · add a company page"
                  : "Not on their site · add a handle to track it";
          return (
            <li key={p.platform} className="border-t border-line py-3 first:border-t-0">
              <div className="flex min-h-11 items-center gap-3">
                <Icon size={20} className={later ? "text-muted" : ""} />
                <div className="min-w-0 flex-1">
                  <p className={`text-body-sm ${later ? "text-muted" : ""}`}>
                    {PLATFORM_LABEL[p.platform]}
                  </p>
                  <p className="truncate text-small text-muted">{meta}</p>
                </div>
                {p.source === "website" ? (
                  later ? (
                    <Chip className="uppercase">Coming later</Chip>
                  ) : (
                    <Chip className="gap-1 border border-line bg-surface uppercase">
                      <Lock size={11} aria-hidden="true" />
                      Always on
                    </Chip>
                  )
                ) : (
                  <Switch
                    checked={p.on}
                    label={`Track ${PLATFORM_LABEL[p.platform]}`}
                    onChange={(on) => update(p, { on })}
                  />
                )}
              </div>
              {p.source === "team" && p.on && (
                <TextField
                  label={`Their ${PLATFORM_LABEL[p.platform]} · optional`}
                  value={p.input}
                  onChange={(e) => update(p, { input: e.target.value })}
                  placeholder={
                    isSupported(p.platform) ? ACCOUNT_PLACEHOLDER[p.platform] : undefined
                  }
                  autoCapitalize="none"
                  className="mt-2 pl-8"
                  tone={tried && parsed?.error ? "error" : "default"}
                  message={tried && parsed?.error ? parsed.error : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** What Review needs from the page for competitors (Discovery 2.0): reading a row's site, finding a brand. */
export type CompetitorActions = {
  /** Read an unscanned row's home page (1 credit): accounts + logo. */
  onRead: (key: string) => void;
  /** Smart add: a name (≈ 3 credits) or a website (1) → a ticked row. */
  onFind: (query: string) => Promise<"added" | "not_found" | "failed" | "duplicate">;
};

function CompetitorsCard({
  draft,
  set,
  tried,
  actions,
}: {
  draft: ReviewDraft;
  set: (p: Partial<ReviewDraft>) => void;
  tried: boolean;
  actions: CompetitorActions;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const [adding, setAdding] = useState(false);
  const ticked = draft.competitors.filter((c) => c.ticked).length;
  const update = (c: CompetitorDraft, patch: Partial<CompetitorDraft>) =>
    set({ competitors: draft.competitors.map((x) => (x.key === c.key ? { ...x, ...patch } : x)) });
  const tick = (c: CompetitorDraft, on: boolean) => {
    update(c, { ticked: on });
    // Not read yet (a lower rival, or Big in your space): read its site now, once (1 credit).
    if (on && c.scanned === false && !c.scanning) actions.onRead(c.key);
  };
  const platforms = competitorPlatforms(draft);
  const rivals = draft.competitors.filter((c) => c.group !== "big");
  const big = draft.competitors.filter((c) => c.group === "big");
  const row = (c: CompetitorDraft) => (
    <CompetitorRow
      key={c.key}
      c={c}
      platforms={platforms}
      tabletUp={tabletUp}
      tried={tried}
      update={update}
      tick={tick}
    />
  );
  return (
    <Card title="Competitors">
      <p className="-mt-3 mb-2 text-small text-muted">
        {draft.competitors.length === 0
          ? "Blip didn’t find any. Add them here or later in Competitors."
          : `${tabletUp ? "Suggested from their site and web searches. " : ""}Tick the ones to track · ${ticked} selected.`}
      </p>
      {rivals.length > 0 && (
        <section aria-labelledby="rivals-title">
          {big.length > 0 && (
            <h3 id="rivals-title" className="pt-1 pb-1 mono-label text-muted">
              Closest rivals
            </h3>
          )}
          <ul aria-label="Closest rivals">{rivals.map(row)}</ul>
        </section>
      )}
      {big.length > 0 && (
        <section aria-labelledby="big-title" className="mt-3 border-t border-line pt-3">
          <h3 id="big-title" className="mono-label text-muted">
            Big in your space
          </h3>
          <p className="mt-1 mb-1 text-small text-muted">
            Less alike, but strong on social. Off unless you tick them.
          </p>
          <ul aria-label="Big in your space">{big.map(row)}</ul>
        </section>
      )}
      {adding ? (
        <AddCompetitorRow
          onCancel={() => setAdding(false)}
          onFind={actions.onFind}
          onAdded={() => setAdding(false)}
          onAdd={(c) => {
            set({ competitors: [...draft.competitors, c] });
            setAdding(false);
          }}
          platforms={platforms}
          taken={draft.competitors.map((c) => c.domain)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 inline-flex min-h-11 items-center gap-2 text-body-sm text-blue hover:underline md:min-h-8"
        >
          <Plus size={16} aria-hidden="true" />
          Add another competitor
        </button>
      )}
    </Card>
  );
}

/** A competitor's mark: its logo when the scan found a square one, else initials. */
function CompetitorMark({ c }: { c: Pick<CompetitorDraft, "name" | "logoUrl"> }) {
  const [broken, setBroken] = useState(false);
  if (c.logoUrl && !broken)
    return (
      <img
        src={c.logoUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-8 shrink-0 rounded-full border border-line bg-surface object-contain"
      />
    );
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-label font-medium">
      {suggestInitials(c.name.replace(/(^|\s)[^\p{L}\p{N}\s]+(?=\s|$)/gu, " "))}
    </span>
  );
}

function CompetitorRow({
  c,
  platforms,
  tabletUp,
  tried,
  update,
  tick,
}: {
  c: CompetitorDraft;
  platforms: Platform[];
  tabletUp: boolean;
  tried: boolean;
  update: (c: CompetitorDraft, patch: Partial<CompetitorDraft>) => void;
  tick: (c: CompetitorDraft, on: boolean) => void;
}) {
  const none = noAccountsFound(c);
  const second =
    c.group === "big"
      ? [c.followers ? followersLabel(c.followers.count) : null, tabletUp ? c.why : null]
      : [tabletUp ? c.why : null];
  const sub = second.filter(Boolean).join(" · ");
  const rest = c.manual ? "added by hand" : c.about;
  return (
    <li className="border-t border-line py-1.5 first:border-t-0">
      {/* UI polish 26 Nov: the whole row toggles; its link and "add" don't (they're their own controls). */}
      <label className="-mx-2 flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 hover:bg-bg">
        <Checkbox
          size="lg"
          checked={c.ticked}
          onChange={(e) => tick(c, e.target.checked)}
          aria-label={`Track ${c.name}`}
        />
        <CompetitorMark c={c} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm">{c.name}</span>
          <span className="block truncate text-small text-muted">
            {c.website ? (
              <a
                href={c.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${c.domain} (opens in a new tab)`}
                className="-my-3.5 inline-flex min-h-11 items-center gap-0.5 py-3.5 hover:text-ink hover:underline md:my-0 md:min-h-0 md:py-0"
              >
                {c.domain}
                <ArrowUpRight size={12} aria-hidden="true" className="shrink-0" />
              </a>
            ) : (
              competitorMeta(c, { short: true })
            )}
            {tabletUp && rest ? ` · ${rest}` : ""}
          </span>
          {sub && <span className="block truncate text-small text-muted">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {c.scanning ? (
            <span className="font-mono text-label text-muted uppercase">Reading…</span>
          ) : none ? (
            <span className="text-small text-muted">
              {tabletUp ? "No accounts found" : "None found"} ·{" "}
              <button
                type="button"
                onClick={() => update(c, { ticked: true, adding: true })}
                className="-mx-2.5 inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 font-medium text-blue hover:underline md:mx-0 md:min-h-0 md:min-w-0 md:px-0"
              >
                add
              </button>
            </span>
          ) : (
            c.accounts.map((a) => {
              const Icon = ICON[a.platform];
              return (
                <Icon
                  key={a.platform}
                  size={16}
                  className={isSupported(a.platform) ? "text-ink" : "text-line-strong"}
                />
              );
            })
          )}
        </span>
      </label>
      <span className="sr-only">
        {c.scanned === false
          ? "Site not read yet: ticking reads it (1 credit)"
          : c.accounts.length
            ? `Accounts: ${c.accounts.map((a) => PLATFORM_LABEL[a.platform]).join(", ")}`
            : "No social accounts found on their site"}
      </span>
      {c.ticked && none && (
        <AccountFields
          className="mt-2 pl-8"
          platforms={platforms}
          values={c.inputs}
          onChange={(p, v) => update(c, { inputs: { ...c.inputs, [p]: v } })}
          brand={{ name: c.name, website: c.website }}
          showErrors={tried}
          autoFocus={c.adding}
        />
      )}
    </li>
  );
}

/**
 * A competitor's account fields (26 Nov): one per platform the client tracks. The first two show; the rest
 * open with "+ N more platforms" (and stay open once something is typed in them). Format check + the soft
 * look-alike note.
 */
function AccountFields({
  platforms,
  values,
  onChange,
  brand,
  showErrors,
  autoFocus,
  className = "",
}: {
  platforms: Platform[];
  values: Partial<Record<Platform, string>>;
  onChange: (p: Platform, value: string) => void;
  brand: { name: string; website?: string | null };
  showErrors: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const extra = platforms.slice(2);
  const open = all || extra.some((p) => values[p]?.trim());
  const shown = open ? platforms : platforms.slice(0, 2);
  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((p, i) => {
          const v = values[p] ?? "";
          const parsed = v.trim() ? parseAccount(p, v) : null;
          const note = parsed?.value ? lookAlikeNote(parsed.value, brand) : null;
          return (
            <TextField
              key={p}
              label={PLATFORM_LABEL[p]}
              value={v}
              onChange={(e) => onChange(p, e.target.value)}
              placeholder={ACCOUNT_PLACEHOLDER[p]}
              autoCapitalize="none"
              autoFocus={autoFocus && i === 0}
              tone={showErrors && parsed?.error ? "error" : "default"}
              message={showErrors && parsed?.error ? parsed.error : (note ?? undefined)}
            />
          );
        })}
      </div>
      {!open && extra.length > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-blue hover:underline md:min-h-8"
        >
          <Plus size={14} aria-hidden="true" />
          {extra.length} more {extra.length === 1 ? "platform" : "platforms"}
          <span className="sr-only">: {extra.map((p) => PLATFORM_LABEL[p]).join(", ")}</span>
        </button>
      )}
    </div>
  );
}

/**
 * "Add another competitor" (15d; Discovery 2.0 smart add): type a name or a website and Blip finds its
 * site, accounts and logo (a website ≈ 1 credit, a name ≈ 3). Not found, or "Add by hand instead": the
 * name + website / handles form (format checks as 07b, plus the look-alike note).
 */
function AddCompetitorRow({
  platforms,
  onAdd,
  onFind,
  onAdded,
  onCancel,
  taken,
}: {
  platforms: Platform[];
  onAdd: (c: CompetitorDraft) => void;
  onFind: CompetitorActions["onFind"];
  onAdded: () => void;
  onCancel: () => void;
  taken: string[];
}) {
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [result, setResult] = useState<"not_found" | "failed" | "duplicate" | null>(null);
  const [byHand, setByHand] = useState(false);
  const isSite = !!siteHost(query) && /\./.test(query);
  if (byHand)
    return (
      <ManualCompetitorForm
        initialName={isSite ? "" : query.trim()}
        initialWebsite={isSite ? query.trim() : ""}
        notFound={result === "not_found"}
        platforms={platforms}
        onAdd={onAdd}
        onCancel={onCancel}
        taken={taken}
      />
    );
  return (
    <form
      className="mt-2 flex flex-col gap-3 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!query.trim() || finding) return;
        setFinding(true);
        setResult(null);
        const r = await onFind(query.trim());
        setFinding(false);
        if (r === "added") onAdded();
        else if (r === "not_found") {
          setResult(r);
          setByHand(true);
        } else setResult(r);
      }}
    >
      <TextField
        label="Name or website"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Worth a Penny, or worthepenny.com"
        autoCapitalize="none"
        autoFocus
        maxLength={80}
        message={
          result === "failed"
            ? "Couldn’t search just now. Try again, or add it by hand."
            : result === "duplicate"
              ? "Already in the list."
              : isSite
                ? "Blip reads their site for accounts and a logo · about 1 credit"
                : query.trim()
                  ? "Blip finds their site, accounts and logo · about 3 credits"
                  : undefined
        }
        tone={result === "failed" || result === "duplicate" ? "error" : "default"}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setByHand(true)}
          className="inline-flex min-h-11 items-center text-small font-medium text-blue hover:underline md:min-h-8"
        >
          Add by hand instead
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!query.trim() || finding}>
            {finding ? "Finding…" : "Find"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The by-hand form: name + website or accounts (format only, 07b), with the look-alike note. */
function ManualCompetitorForm({
  initialName,
  initialWebsite,
  notFound,
  platforms,
  onAdd,
  onCancel,
  taken,
}: {
  initialName: string;
  initialWebsite: string;
  notFound: boolean;
  platforms: Platform[];
  onAdd: (c: CompetitorDraft) => void;
  onCancel: () => void;
  taken: string[];
}) {
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState(initialWebsite);
  const [inputs, setInputs] = useState<Partial<Record<Platform, string>>>({});
  const [tried, setTried] = useState(false);
  const host = siteHost(website);
  const parsed = platforms
    .filter((p) => inputs[p]?.trim())
    .map((p) => [p, parseAccount(p, inputs[p]!)] as const);
  const websiteError =
    website.trim() && !host
      ? "That doesn’t look like a website address."
      : host && taken.includes(host)
        ? "Already in the list."
        : null;
  const accountError = parsed.some(([, r]) => r.error);
  const valid =
    name.trim() && !websiteError && !accountError && (host || parsed.some(([, r]) => r.value));
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
      {notFound && (
        <p className="text-small text-muted">
          Blip couldn’t find {initialName ? `${initialName}’s` : "their"} site. Add it by hand.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
        />
        <TextField
          label="Website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="example.com"
          inputMode="url"
          autoCapitalize="none"
          tone={websiteError ? "error" : "default"}
          message={websiteError ?? undefined}
        />
      </div>
      <AccountFields
        platforms={platforms}
        values={inputs}
        onChange={(p, v) => setInputs((x) => ({ ...x, [p]: v }))}
        brand={{ name, website: host }}
        showErrors
      />
      {tried && !valid && (
        <p role="alert" className="text-small text-spark-text">
          Add a name and a website or an account.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setTried(true);
            if (!valid) return;
            const domain = host ?? `manual-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
            onAdd({
              key: domain,
              name: name.trim(),
              website: host ? normaliseWebsite(website)! : "",
              domain: host ?? "",
              about: "",
              // Page links for LinkedIn / Facebook; handles (or a YouTube channel id) for the rest.
              accounts: parsed
                .filter(([, r]) => r.value)
                .map(([p, r]) =>
                  p === "facebook" || p === "linkedin"
                    ? { platform: p, handle: null, url: r.value }
                    : { platform: p, handle: r.value, url: null },
                ),
              ticked: true,
              inputs: {},
              manual: true,
              group: "rival",
              scanned: true,
            });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
