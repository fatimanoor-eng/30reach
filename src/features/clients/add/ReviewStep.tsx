import { Globe, Lock, Plus } from "lucide-react";
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
import { MQ_TABLET_UP, useMediaQuery } from "../../../lib/useMediaQuery";
import { suggestInitials } from "../../competitors/competitor-rules";
import { RuleForm } from "../RuleForm";
import { uploadLogo } from "../clients-api";
import { ACCOUNT_PLACEHOLDER, parseAccount } from "./account-input";
import {
  accountLabel,
  competitorMeta,
  type CompetitorDraft,
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
}: {
  draft: ReviewDraft;
  onChange: (d: ReviewDraft) => void;
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
  const competitors = <CompetitorsCard draft={draft} set={set} tried={tried} />;

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

function CompetitorsCard({
  draft,
  set,
  tried,
}: {
  draft: ReviewDraft;
  set: (p: Partial<ReviewDraft>) => void;
  tried: boolean;
}) {
  const tabletUp = useMediaQuery(MQ_TABLET_UP);
  const [adding, setAdding] = useState(false);
  const ticked = draft.competitors.filter((c) => c.ticked).length;
  const update = (c: CompetitorDraft, patch: Partial<CompetitorDraft>) =>
    set({ competitors: draft.competitors.map((x) => (x.key === c.key ? { ...x, ...patch } : x)) });
  return (
    <Card title="Competitors">
      <p className="-mt-3 mb-2 text-small text-muted">
        {draft.competitors.length === 0
          ? "Blip didn’t find any. Add them here or later in Competitors."
          : `${tabletUp ? "Suggested from 2 searches. " : ""}Tick the ones to track · ${ticked} selected.`}
      </p>
      <ul>
        {draft.competitors.map((c) => (
          <li key={c.key} className="border-t border-line py-3 first:border-t-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox
                checked={c.ticked}
                onChange={(e) => update(c, { ticked: e.target.checked })}
              />
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-label font-medium">
                {suggestInitials(c.name.replace(/(^|\s)[^\p{L}\p{N}\s]+(?=\s|$)/gu, " "))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm">{c.name}</span>
                <span className="block truncate text-small text-muted">
                  {competitorMeta(c, { short: !tabletUp })}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {c.accounts.map((a) => {
                  const Icon = ICON[a.platform];
                  return (
                    <Icon
                      key={a.platform}
                      size={16}
                      className={isSupported(a.platform) ? "text-ink" : "text-line-strong"}
                    />
                  );
                })}
              </span>
              <span className="sr-only">
                {c.accounts.length
                  ? `Accounts: ${c.accounts.map((a) => PLATFORM_LABEL[a.platform]).join(", ")}`
                  : "No social links on their site"}
              </span>
            </label>
            {c.ticked && c.accounts.filter((a) => isSupported(a.platform)).length === 0 && (
              <div className="mt-2 grid gap-3 pl-8 md:grid-cols-2">
                {(["instagram", "tiktok"] as const).map((p) => {
                  const v = c.inputs[p] ?? "";
                  const parsed = v.trim() ? parseAccount(p, v) : null;
                  return (
                    <TextField
                      key={p}
                      label={PLATFORM_LABEL[p]}
                      value={v}
                      onChange={(e) => update(c, { inputs: { ...c.inputs, [p]: e.target.value } })}
                      placeholder="@handle"
                      autoCapitalize="none"
                      tone={tried && parsed?.error ? "error" : "default"}
                      message={tried && parsed?.error ? parsed.error : undefined}
                    />
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <AddCompetitorRow
          onCancel={() => setAdding(false)}
          onAdd={(c) => {
            set({ competitors: [...draft.competitors, c] });
            setAdding(false);
          }}
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

/** "Add another competitor" (15d): name + website or handles, same checks as 07b (format only). */
function AddCompetitorRow({
  onAdd,
  onCancel,
  taken,
}: {
  onAdd: (c: CompetitorDraft) => void;
  onCancel: () => void;
  taken: string[];
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [tried, setTried] = useState(false);
  const host = siteHost(website);
  const ig = instagram.trim() ? parseAccount("instagram", instagram) : null;
  const tt = tiktok.trim() ? parseAccount("tiktok", tiktok) : null;
  const websiteError =
    website.trim() && !host
      ? "That doesn’t look like a website address."
      : host && taken.includes(host)
        ? "Already in the list."
        : null;
  const valid =
    name.trim() && !websiteError && !ig?.error && !tt?.error && (host || ig?.value || tt?.value);
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
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
        <TextField
          label="Instagram"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@handle"
          autoCapitalize="none"
          tone={ig?.error ? "error" : "default"}
          message={ig?.error}
        />
        <TextField
          label="TikTok"
          value={tiktok}
          onChange={(e) => setTiktok(e.target.value)}
          placeholder="@handle"
          autoCapitalize="none"
          tone={tt?.error ? "error" : "default"}
          message={tt?.error}
        />
      </div>
      {tried && !valid && (
        <p role="alert" className="text-small text-spark-text">
          Add a name and a website or a handle.
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
              accounts: [
                ...(ig?.value
                  ? [{ platform: "instagram" as const, handle: ig.value, url: null }]
                  : []),
                ...(tt?.value
                  ? [{ platform: "tiktok" as const, handle: tt.value, url: null }]
                  : []),
              ],
              ticked: true,
              inputs: {},
              manual: true,
            });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
