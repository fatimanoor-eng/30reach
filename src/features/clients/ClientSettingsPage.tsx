import { Globe, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app/PageHeader";
import { ClientMark } from "../../app/ClientMark";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { LoadError } from "../../components/LoadError";
import { ModalPresence } from "../../components/ModalPresence";
import { SelectField } from "../../components/SelectField";
import { Switch } from "../../components/Switch";
import { useCurrentUser } from "../../lib/auth/useCurrentUser";
import {
  CHECK_LABEL,
  type CheckKind,
  checksFor,
  checksSummary,
  type ContentRule,
  firstNameFrom,
  platformRows,
  REGULATED,
} from "../../lib/client-rules";
import { COUNTRIES, countryName, languageName } from "../../lib/countries";
import { formatShortDate } from "../../lib/format";
import {
  PLATFORM_ICON,
  PLATFORM_NAME,
  platformsWithAccounts,
  type Platform,
} from "../../lib/platforms";
import { useClient, useClientPath } from "../../lib/useClient";
import { useCompetitors } from "../../lib/useCompetitors";
import { useClientActions } from "./client-actions";
import {
  type ClientDetails,
  type ClientPatch,
  useClientDetails,
  usePlatformRows,
  useSetPlatform,
  useUpdateClient,
} from "./clients-api";
import { EditBrandDrawer } from "./EditBrandDrawer";
import { RuleForm } from "./RuleForm";
import { DemoClientCard } from "../settings/DemoClientCard";

/**
 * 16 Client settings (desktop: two columns) / M19 (phones: stacked cards), Slice 17c. Opened from the
 * switcher ("{Client} settings"). Brand, platforms (always on / team toggle / coming later), content
 * rules + checks decided by code, calendar, competitors link, archive. Permanent delete lives in the
 * switcher's Archived list (16c / 16d).
 */
export function ClientSettingsPage() {
  const summary = useClient().data;
  const details = useClientDetails(summary?.id);
  const update = useUpdateClient(summary?.id);
  const [editing, setEditing] = useState(false);

  if (details.isError) {
    return (
      <>
        <PageHeader title="Client settings" />
        <LoadError title="Client settings didn’t load" onRetry={() => void details.refetch()} />
      </>
    );
  }
  const d = details.data;
  const save = (patch: ClientPatch) => update.mutateAsync(patch);

  return (
    <>
      <PageHeader
        title="Client settings"
        description={
          d
            ? [d.name, d.website?.replace(/^https?:\/\/(www\.)?/, "")].filter(Boolean).join(" · ")
            : undefined
        }
      />
      {!d ? (
        <div aria-busy="true" aria-label="Loading client settings" className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 rounded-card border border-line bg-surface motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <BrandCard client={d} onEdit={() => setEditing(true)} />
            <PlatformsCard clientId={d.id} />
            <RulesCard client={d} save={save} />
          </div>
          <div className="flex flex-col gap-4 xl:w-110 xl:shrink-0">
            <CalendarCard client={d} save={save} />
            <CompetitorsCard />
            {d.is_demo && <DemoClientCard here />}
            <ArchiveCard client={d} />
          </div>
        </div>
      )}
      <ModalPresence open={editing && !!d}>
        {d && <EditBrandDrawer client={d} onClose={() => setEditing(false)} />}
      </ModalPresence>
    </>
  );
}

/** Team rule ids: "team-" + a random suffix (rules live in clients.content_rules). */
function newRuleId() {
  return `team-${crypto.randomUUID().slice(0, 8)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 md:flex-row md:gap-4">
      <dt className="mono-label text-muted md:w-36 md:shrink-0 md:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-body-sm break-words">{children}</dd>
    </div>
  );
}

function BrandCard({ client, onEdit }: { client: ClientDetails; onEdit: () => void }) {
  return (
    <Card
      title="Brand"
      action={
        <Button variant="secondary" onClick={onEdit}>
          Edit brand
        </Button>
      }
    >
      <div className="mb-4 flex items-start gap-3">
        <ClientMark client={client} size="lg" />
        <div className="min-w-0">
          <p className="text-body font-medium">{client.name}</p>
          {client.description && (
            <p className="mt-0.5 text-body-sm text-muted">{client.description}</p>
          )}
        </div>
      </div>
      <dl>
        <Row label="Website">
          {client.website ? (
            <a
              href={client.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-blue hover:underline md:min-h-0"
            >
              {client.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ) : (
            <span className="text-muted">Not set</span>
          )}
        </Row>
        <Row label="Country">
          {countryName(client.country)} · {languageName(client.language)}
        </Row>
        <Row label="Industry">{client.industry || <span className="text-muted">Not set</span>}</Row>
        <Row label="Brand colour">
          {client.brand_color ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-4 rounded-[4px] border border-line"
                style={{ backgroundColor: client.brand_color }}
              />
              {client.brand_color.toUpperCase()}
            </span>
          ) : (
            "None · initials shown on ink"
          )}
        </Row>
      </dl>
    </Card>
  );
}

function PlatformsCard({ clientId }: { clientId: string }) {
  const rows = usePlatformRows(clientId);
  const set = useSetPlatform(clientId);
  const [error, setError] = useState(false);
  return (
    <Card title="Platforms">
      <p className="-mt-2 mb-3 text-body-sm text-muted">
        On when their website links them; the team can switch more on. Pulls only use platforms that
        are on.
      </p>
      {rows.isError ? (
        <LoadError title="Platforms didn’t load" onRetry={() => void rows.refetch()} />
      ) : !rows.data ? (
        <div className="h-48 rounded-control bg-soft motion-safe:animate-pulse" />
      ) : (
        <ul className="flex flex-col">
          {platformRows(rows.data).map((r) => {
            const Icon = r.supported ? PLATFORM_ICON[r.platform as Platform] : Globe;
            return (
              <li
                key={r.platform}
                className="flex min-h-14 items-center gap-3 border-t border-line py-2 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg ${r.kind === "later" ? "text-muted" : ""}`}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-body-sm ${r.kind === "later" ? "text-muted" : ""}`}>
                    {r.name}
                  </p>
                  <p className="truncate text-small text-muted">{r.meta}</p>
                </div>
                {r.kind === "always" ? (
                  <Chip className="gap-1 uppercase">
                    <Lock size={11} aria-hidden="true" />
                    Always on
                  </Chip>
                ) : r.kind === "later" ? (
                  <Chip className="uppercase">Coming later</Chip>
                ) : (
                  <Switch
                    checked={r.on}
                    label={`Track ${r.name}`}
                    disabled={set.isPending}
                    onChange={(on) => {
                      setError(false);
                      set.mutate({ platform: r.platform, on }, { onError: () => setError(true) });
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-spark-text">
          Couldn’t change that platform. Please try again.
        </p>
      )}
    </Card>
  );
}

function RulesCard({
  client,
  save,
}: {
  client: ClientDetails;
  save: (patch: ClientPatch) => Promise<void>;
}) {
  const me = useCurrentUser();
  const [editingTopics, setEditingTopics] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null); // rule id or "new"
  const [error, setError] = useState<string | null>(null);
  const checks = checksFor(client.regulated, client.audience_is_kids);
  const rules = client.content_rules;

  const run = (patch: ClientPatch, after?: () => void) => {
    setError(null);
    save(patch).then(after, () => setError("Couldn’t save. Please try again."));
  };
  const toggleTopic = (t: string) =>
    run({
      regulated: client.regulated.includes(t)
        ? client.regulated.filter((x) => x !== t)
        : REGULATED.filter((x) => x === t || client.regulated.includes(x)),
    });
  const saveRule = (id: string, rule: string, why: string) => {
    const now = new Date().toISOString();
    const next: ContentRule[] =
      id === "new"
        ? [
            ...rules,
            {
              id: newRuleId(),
              rule,
              why: why || null,
              source: "team",
              added_by_name: firstNameFrom(me.name, me.email),
              added_at: now,
            },
          ]
        : rules.map((r) => (r.id === id ? { ...r, rule, why: why || null } : r));
    run({ content_rules: next }, () => setEditingRule(null));
  };

  return (
    <Card title="Content rules and checks">
      <p className="-mt-2 mb-4 rounded-control bg-bg px-3 py-2 text-body-sm">
        <span className="font-medium">Blip detected:</span>{" "}
        {checksSummary(client.regulated, client.audience_is_kids)}
      </p>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="mono-label text-muted">Regulated topics</p>
          <button
            type="button"
            onClick={() => setEditingTopics((e) => !e)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-small font-medium text-blue hover:underline md:min-h-6 md:min-w-0"
          >
            {editingTopics ? "Done" : "Edit"}
          </button>
        </div>
        {editingTopics ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {REGULATED.map((t) => {
                const on = client.regulated.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleTopic(t)}
                    className="inline-flex min-h-11 items-center md:min-h-7"
                  >
                    <Chip tone={on ? "ink" : "neutral"}>{t}</Chip>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center justify-between gap-3 text-body-sm">
              Audience is mainly children
              <Switch
                checked={client.audience_is_kids}
                label="Audience is mainly children"
                onChange={(v) => run({ audience_is_kids: v })}
              />
            </label>
          </div>
        ) : client.regulated.length ? (
          <div className="flex flex-wrap gap-2">
            {client.regulated.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-muted">None</p>
        )}
      </div>

      <div className="mb-4">
        <p className="mb-2 mono-label text-muted">Checks</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(CHECK_LABEL) as CheckKind[]).map((k) => (
            <li key={k} className={`text-body-sm ${checks[k] ? "" : "text-muted"}`}>
              {CHECK_LABEL[k]} · {checks[k] ? "on" : "off"}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-small text-muted">Decided by the regulated topics.</p>
      </div>

      <p className="mb-2 mono-label text-muted">Rules</p>
      <ul className="flex flex-col">
        {rules.map((r) =>
          editingRule === r.id ? (
            <li key={r.id} className="border-t border-line py-3 first:border-t-0">
              <RuleForm
                initial={r}
                onCancel={() => setEditingRule(null)}
                onSave={(rule, why) => saveRule(r.id, rule, why)}
              />
            </li>
          ) : (
            <li
              key={r.id}
              className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-sm font-medium">{r.rule}</p>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingRule(r.id)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-small font-medium text-blue hover:underline md:min-h-6 md:min-w-0"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => run({ content_rules: rules.filter((x) => x.id !== r.id) })}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-small text-muted hover:text-ink md:min-h-6 md:min-w-0"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {r.why && <p className="text-small text-muted">{r.why}</p>}
              {r.source === "blip" && r.quote ? (
                <p className="mt-1 self-start rounded-[6px] bg-bg px-2.5 py-1.5 font-mono text-label text-muted">
                  “{r.quote}” · from the site
                </p>
              ) : r.source === "team" ? (
                <p className="font-mono text-label text-muted">
                  Added by {r.added_by_name || "the team"}
                  {r.added_at ? ` · ${formatShortDate(r.added_at)}` : ""}
                </p>
              ) : null}
            </li>
          ),
        )}
        {rules.length === 0 && editingRule !== "new" && (
          <li className="text-body-sm text-muted">No rules yet.</li>
        )}
      </ul>
      {editingRule === "new" ? (
        <div className="mt-3 border-t border-line pt-3">
          <RuleForm
            onCancel={() => setEditingRule(null)}
            onSave={(rule, why) => saveRule("new", rule, why)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingRule("new")}
          className="mt-2 inline-flex min-h-11 items-center text-small font-medium text-blue hover:underline md:min-h-8"
        >
          + Add a rule
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-spark-text">
          {error}
        </p>
      )}
    </Card>
  );
}

function CalendarCard({
  client,
  save,
}: {
  client: ClientDetails;
  save: (patch: ClientPatch) => Promise<void>;
}) {
  const [error, setError] = useState(false);
  const run = (patch: ClientPatch) => {
    setError(false);
    save(patch).catch(() => setError(true));
  };
  return (
    <Card title="Calendar">
      <p className="-mt-2 mb-3 text-body-sm text-muted">Automatic events for this client.</p>
      <SelectField
        label="Holidays"
        value={client.country}
        onChange={(e) => run({ country: e.target.value })}
        options={[...COUNTRIES]
          .map((c) => ({ value: c, label: countryName(c) }))
          .sort((a, b) => a.label.localeCompare(b.label))}
      />
      <div className="mt-4 flex flex-col gap-0.5">
        <p className="mono-label text-muted">Marketing</p>
        <p className="text-body-sm">
          {client.country === "US"
            ? "US dates (Black Friday, Giving Tuesday…)"
            : "Shared dates (Valentine’s Day, Black Friday…)"}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-body-sm">Health months</p>
          <p className="text-small text-muted">Awareness months for health brands.</p>
        </div>
        <Switch
          checked={client.health_months}
          label="Health months"
          onChange={(v) => run({ health_months: v })}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-small text-spark-text">
          Couldn’t save. Please try again.
        </p>
      )}
    </Card>
  );
}

function CompetitorsCard() {
  const competitors = useCompetitors();
  const path = useClientPath();
  const list = competitors.data ?? [];
  const platforms = platformsWithAccounts(list.length ? list : []);
  return (
    <Card title="Competitors">
      <p className="text-body-sm">
        {competitors.data
          ? list.length
            ? `${list.length} ${list.length === 1 ? "brand" : "brands"} · ${platforms.map((p) => PLATFORM_NAME[p]).join(", ") || "no accounts yet"}`
            : "None yet"
          : "…"}
      </p>
      <Link
        to={path("/competitors")}
        className="mt-2 inline-flex min-h-11 items-center text-small font-medium text-blue hover:underline md:min-h-8"
      >
        Manage competitors
      </Link>
    </Card>
  );
}

function ArchiveCard({ client }: { client: ClientDetails }) {
  const actions = useClientActions();
  return (
    <Card title="Archive client">
      <p className="mb-4 text-body-sm text-muted">
        Hides {client.name} from the switcher and stops pulls. Data is kept; restore any time.
      </p>
      <Button variant="secondary" onClick={() => actions.requestArchive(client)}>
        Archive client
      </Button>
    </Card>
  );
}
