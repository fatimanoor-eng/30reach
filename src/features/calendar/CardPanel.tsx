import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { cardToIdea } from "../ideas/ideas-api";
import { InspiredBy } from "../ideas/InspiredBy";
import { useId, useState, type ReactNode } from "react";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Drawer } from "../../components/Drawer";
import { useAuth } from "../../lib/auth/auth-context";
import { initialsFor } from "../../lib/auth/domain";
import { useProfile } from "../../lib/auth/useProfile";
import { useToast } from "../../components/toast-context";
import { PLATFORM_TINT, type CalendarCard, type CardPlatform } from "./calendar-ui";
import { dateRelation, pastAndNotPosted, whoLine } from "./card-time";
import { deleteCard, saveCard, type CardFields } from "./cards-api";
import { todayIso, type IsoDay } from "./events/dates";
import { shortDay } from "./format";
import { formatFor, formatOptions as optionsFor, PLATFORM_OPTIONS } from "./platform-options";
import { DateChip, SelectChip } from "./SelectChip";
import { StatusPills } from "./StatusPills";
import { Tooltip } from "../../components/Tooltip";
import { AiError, checkClaims, suggestHooks } from "../../lib/ai/ai-api";
import { checkKey, needsCheck, storedCheck } from "./card-check";
import { HealthCheck, type HealthCheckState } from "./HealthCheck";
import { HookSuggestions, type HooksState } from "./HookSuggestions";

/**
 * 09 card detail (drawer from 768 px) / M08 (full-screen page with a back arrow and a sticky Save bar).
 * Card header (Figma annotation): a panel tinted by platform with three select chips (platform, format,
 * date), the title edited in place, a who/when line and the soft status pills. Then hook, caption,
 * visual idea. New post = the same panel, empty, with a date. No ✕ (as in Figma): Esc, the dimmed page,
 * or "‹ Calendar" on phones close it.
 * "Inspired by" links to the idea a card was planned from; "Move to idea board" (card_to_idea)
 * sends it back.
 * Slice 11: Save saves first, then (if the text changed since the last check) the drawer stays open
 * with "Checking for health claims…" and the advisory result; the button becomes "Done". A failed or
 * rate-limited check says "Couldn't check this time": the card is saved either way. "Suggest hooks"
 * offers three hooks from the title, caption, platform and what works for competitors.
 */
export function CardPanel({
  open,
  onClose,
  card,
  newDate,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  /** null = New post */
  card: CalendarCard | null;
  newDate: IsoDay;
  clientId: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fields, setFields] = useState<CardFields>(() => ({
    date: card?.date ?? newDate,
    platform: card?.platform ?? null,
    format: card?.format ?? null,
    title: card?.title ?? "",
    hook: card?.hook ?? null,
    caption: card?.caption ?? null,
    visual_idea: card?.visual_idea ?? null,
    status: card?.status ?? "idea",
  }));
  // After the first save of a new card, later saves update that row (not insert another).
  const [savedId, setSavedId] = useState<string | null>(card?.id ?? null);
  const [justSaved, setJustSaved] = useState<string | null>(null); // fields key at the last save
  // The check result and the text it was for (shown only while the text still matches).
  const [check, setCheck] = useState<{ key: string; value: HealthCheckState } | null>(() => {
    const stored = storedCheck(card);
    return stored && card ? { key: checkKey(card), value: stored } : null;
  });
  const [hooks, setHooks] = useState<HooksState>({ state: "idle" });
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formatRequest, setFormatRequest] = useState(0);
  const [moveOpen, setMoveOpen] = useState(false);
  const navigate = useNavigate();
  // 09 "Move to idea board" (card_to_idea). Closes first so the toast and its Open are reachable.
  const move = useMutation({
    mutationFn: () => cardToIdea(card!.id),
    onSuccess: (ideaId) => {
      setMoveOpen(false);
      onClose();
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({
        title: "Moved to the idea board",
        pose: "success",
        action: { label: "Open", onClick: () => navigate(`/ideas?idea=${ideaId}`) },
      });
    },
  });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const titleErrorId = useId();
  const statusLabelId = useId();
  const { user } = useAuth();
  const profile = useProfile();

  const set = <K extends keyof CardFields>(key: K, value: CardFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const setPlatform = (platform: CardPlatform | null) =>
    setFields((f) => ({
      ...f,
      platform,
      // keep the format only if the new platform has it
      format: formatFor(platform, f.format),
    }));

  const save = async () => {
    const title = fields.title.trim();
    if (!title) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    setError(null);
    const clean = (v: string | null) => (v?.trim() ? v.trim() : null);
    const cleaned: CardFields = {
      ...fields,
      title,
      hook: clean(fields.hook),
      caption: clean(fields.caption),
      visual_idea: clean(fields.visual_idea),
    };
    let id: string;
    try {
      id = (await saveCard(clientId, savedId, cleaned)).id;
    } catch {
      setError("Couldn’t save. Check your connection and try again.");
      setSaving(false);
      return;
    }
    setSavedId(id);
    await queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
    setSaving(false);
    const lastChecked =
      check && (check.value.state === "clear" || check.value.state === "flagged")
        ? check.key
        : null;
    if (!needsCheck(cleaned, lastChecked)) {
      onClose();
      return;
    }
    // Saved. Now the advisory check: the drawer stays open to show it ("Done" closes).
    setJustSaved(JSON.stringify(fields));
    void runCheck(id, cleaned);
  };

  async function runCheck(id: string, f: CardFields) {
    const key = checkKey(f);
    setCheck({ key, value: { state: "checking" } });
    try {
      const r = await checkClaims(id, {
        title: f.title,
        hook: f.hook,
        caption: f.caption,
        visualIdea: f.visual_idea,
      });
      setCheck({
        key,
        value: r.status === "clear" ? { state: "clear" } : { state: "flagged", issues: r.issues },
      });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
    } catch (err) {
      const rateLimited = err instanceof AiError && err.kind === "rate_limited";
      setCheck({ key, value: { state: "failed", rateLimited } });
    }
  }

  async function loadHooks() {
    setHooks({ state: "loading" });
    try {
      const r = await suggestHooks(clientId, {
        title: fields.title.trim(),
        caption: fields.caption?.trim() || null,
        platform: fields.platform,
        format: fields.format,
      });
      setHooks({ state: "ready", hooks: r.hooks });
    } catch (err) {
      setHooks({
        state: "failed",
        rateLimited: err instanceof AiError && err.kind === "rate_limited",
      });
    }
  }

  const done = justSaved !== null && justSaved === JSON.stringify(fields);
  const shownCheck = check && check.key === checkKey(fields) ? check.value : null;
  const canSuggest = !!(fields.title.trim() || fields.caption?.trim());

  const confirmDelete = async () => {
    if (!card) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCard(card.id);
    } catch {
      setDeleteError("Couldn’t delete it. Check your connection and try again.");
      setDeleting(false);
      return;
    }
    // Close first so `?card=` is gone before the list refetches (else the page would report the
    // card as missing and that toast would replace this one).
    setDeleting(false);
    setConfirmOpen(false);
    onClose();
    toast.show({ title: `Deleted “${card.title}”`, pose: "success" });
    void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
  };

  const formatOptions = optionsFor(fields.platform);
  // Who: "New card · {you}" while creating, "{creator} · edited … ago" once saved. When: the
  // date's relation sits next to the date chip, with an amber note for a past, unposted day.
  const who = card ? (card.creator?.full_name ?? null) : (profile.data?.full_name ?? null);
  const whoInitials = initialsFor(who, card ? "?" : (user?.email ?? "?"));
  const who_ = whoLine(who, card ? { updatedAt: card.updated_at } : null);
  const today = todayIso();
  const relation = dateRelation(fields.date, today);
  const isPast = pastAndNotPosted(fields.date, today, fields.status);

  const header = (
    <div
      className={`flex flex-col gap-3.5 rounded-panel px-4 py-4 md:px-5 md:py-[18px] ${PLATFORM_TINT[fields.platform ?? "none"]}`}
    >
      <div className="flex flex-col gap-1.5">
        {/* Platform, format and date: one line from 768 px (the drawer); they wrap only on
            phones. The date's relation goes beside them, or below when there's no room. */}
        <div className="flex flex-wrap items-center gap-x-2">
          <div className="flex flex-wrap items-center gap-x-2 md:flex-nowrap">
            <SelectChip
              label="Platform"
              placeholder="Platform"
              value={fields.platform}
              options={PLATFORM_OPTIONS}
              onChange={(p) => {
                setPlatform(p);
                // Next step: the format menu opens by itself when the format is still empty.
                if (!formatFor(p, fields.format)) setFormatRequest((n) => n + 1);
              }}
            />
            <SelectChip
              label="Format"
              placeholder="Format"
              value={fields.format}
              options={formatOptions}
              onChange={(v) => set("format", v)}
              disabled={!fields.platform}
              disabledReason="Choose a platform first"
              openRequest={formatRequest}
            />
            <DateChip
              value={fields.date}
              text={shortDay(fields.date)}
              onChange={(v) => set("date", v)}
            />
          </div>
          <span className="text-small whitespace-nowrap text-muted-strong">{relation}</span>
        </div>
        {isPast && (
          <p className="flex items-center gap-1.5 text-small text-amber-text">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-amber" />
            This date is in the past
          </p>
        )}
      </div>
      <div>
        <textarea
          aria-label="Title"
          rows={1}
          value={fields.title}
          placeholder="Post title"
          data-autofocus={card ? undefined : true}
          aria-invalid={titleError || undefined}
          aria-describedby={titleError ? titleErrorId : undefined}
          onChange={(e) => {
            set("title", e.target.value.replace(/\n/g, " "));
            setTitleError(false);
          }}
          className="[field-sizing:content] w-full resize-none bg-transparent text-heading outline-none placeholder:text-muted md:text-heading-md"
        />
        {titleError && (
          <p id={titleErrorId} className="mt-1 text-small text-spark">
            Add a title.
          </p>
        )}
      </div>
      <p className="flex items-center gap-2 text-small text-muted-strong">
        <Avatar initials={whoInitials} tone="user" />
        <span>{who_}</span>
      </p>
      <div className="flex flex-col gap-1 md:gap-2">
        <p id={statusLabelId} className="mono-label text-muted-strong">
          Status
        </p>
        <StatusPills
          value={fields.status}
          onChange={(v) => set("status", v)}
          labelledBy={statusLabelId}
        />
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center gap-3">
      {card && (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setConfirmOpen(true);
          }}
          className="min-h-11 text-body-sm font-medium text-spark hover:underline"
        >
          Delete<span className="hidden md:inline"> card</span>
        </button>
      )}
      <div className="flex flex-1 items-center justify-end gap-2">
        {card && (
          // Not on phones (M08 has Delete + Save only).
          <Button
            variant="secondary"
            onClick={() => {
              move.reset();
              setMoveOpen(true);
            }}
            className="max-md:hidden"
          >
            Move to idea board
          </Button>
        )}
        <Button
          onClick={() => (done ? onClose() : void save())}
          disabled={saving}
          className="flex-1 md:flex-none"
        >
          {saving ? "Saving…" : done ? "Done" : "Save"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={card ? `Post card: ${card.title}` : "New post"}
        backLabel="Calendar"
        hideClose
        header={header}
        footer={footer}
      >
        <div className="flex flex-col gap-5">
          <Field
            label="Hook"
            action={
              <Tooltip content="Add a title or caption first" enabled={!canSuggest}>
                {(tip) => (
                  <button
                    type="button"
                    aria-disabled={!canSuggest || hooks.state === "loading" || undefined}
                    aria-describedby={canSuggest ? undefined : tip["aria-describedby"]}
                    onClick={(e) =>
                      !canSuggest ? tip.onToggle(e) : hooks.state !== "loading" && void loadHooks()
                    }
                    className={`-my-3 min-h-11 text-small font-medium md:my-0 md:min-h-0 ${
                      canSuggest ? "text-blue hover:underline" : "cursor-not-allowed text-muted"
                    }`}
                  >
                    Suggest hooks
                  </button>
                )}
              </Tooltip>
            }
          >
            {(id) => (
              <>
                <TextArea id={id} value={fields.hook} onChange={(v) => set("hook", v)} />
                <HookSuggestions
                  value={hooks}
                  onPick={(h) => {
                    set("hook", h);
                    setHooks({ state: "idle" });
                  }}
                  onRetry={() => void loadHooks()}
                  onHide={() => setHooks({ state: "idle" })}
                />
              </>
            )}
          </Field>
          <Field label="Caption">
            {(id) => (
              <TextArea
                id={id}
                value={fields.caption}
                onChange={(v) => set("caption", v)}
                minRows
              />
            )}
          </Field>
          <Field label="Visual idea">
            {(id) => (
              <TextArea
                id={id}
                value={fields.visual_idea}
                onChange={(v) => set("visual_idea", v)}
              />
            )}
          </Field>
          <InspiredBy ideaId={card?.idea_id ?? null} />
          {shownCheck && (
            <HealthCheck
              value={shownCheck}
              onRetry={() => {
                if (!savedId) return;
                const clean = (v: string | null) => (v?.trim() ? v.trim() : null);
                void runCheck(savedId, {
                  ...fields,
                  title: fields.title.trim(),
                  hook: clean(fields.hook),
                  caption: clean(fields.caption),
                  visual_idea: clean(fields.visual_idea),
                });
              }}
            />
          )}
          {error && (
            <p role="alert" className="text-small text-spark">
              {error}
            </p>
          )}
        </div>
      </Drawer>
      {card && (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => !deleting && setConfirmOpen(false)}
          title={`Delete “${card.title}”?`}
          description="It comes off the calendar for the whole team. This can’t be undone."
          confirmLabel={deleting ? "Deleting…" : "Delete card"}
          onConfirm={() => void confirmDelete()}
          busy={deleting}
        >
          {deleteError && <p className="text-center text-small text-spark">{deleteError}</p>}
        </ConfirmDialog>
      )}
      {card && (
        <ConfirmDialog
          open={moveOpen}
          onClose={() => !move.isPending && setMoveOpen(false)}
          title="Move it to the idea board?"
          description={
            card.idea_id
              ? "It comes off the calendar and its idea goes back on the board, ready to plan again."
              : "It comes off the calendar and becomes a note on the idea board, with its title, hook, caption and visual idea as saved."
          }
          confirmLabel={move.isPending ? "Moving…" : "Move to idea board"}
          onConfirm={() => move.mutate()}
          busy={move.isPending}
        >
          {move.isError && (
            <p role="alert" className="text-center text-small text-spark">
              Couldn’t move it. Check your connection and try again.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  /** right side of the label row ("Suggest hooks") */
  action?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="block mono-label text-muted">
          {label}
        </label>
        {action}
      </div>
      {children(id)}
    </div>
  );
}

function TextArea({
  id,
  value,
  onChange,
  minRows = false,
}: {
  id: string;
  value: string | null;
  onChange: (value: string) => void;
  /** taller to start with (caption) */
  minRows?: boolean;
}) {
  return (
    <textarea
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      rows={minRows ? 3 : 1}
      className={`[field-sizing:content] w-full resize-none rounded-control border border-line bg-surface px-3.5 py-2.5 text-body outline-none focus:border-ink ${minRows ? "min-h-20" : "min-h-11"}`}
    />
  );
}
