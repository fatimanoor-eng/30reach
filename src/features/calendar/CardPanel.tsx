import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Drawer } from "../../components/Drawer";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../lib/auth/auth-context";
import { initialsFor } from "../../lib/auth/domain";
import { useProfile } from "../../lib/auth/useProfile";
import { useToast } from "../../components/toast-context";
import { PLATFORM_TINT, type CalendarCard, type CardPlatform } from "./calendar-ui";
import { dateRelation, editedAgo } from "./card-time";
import { deleteCard, saveCard, type CardFields } from "./cards-api";
import { todayIso, type IsoDay } from "./events/dates";
import { shortDay } from "./format";
import { formatFor, formatOptions as optionsFor, PLATFORM_OPTIONS } from "./platform-options";
import { DateChip, SelectChip } from "./SelectChip";
import { StatusPills } from "./StatusPills";

const COMING_SOON = "Coming soon";

/**
 * 09 card detail (drawer from 768 px) / M08 (full-screen page with a back arrow and a sticky Save bar).
 * Card header (Figma annotation): a panel tinted by platform with three select chips (platform, format,
 * date), the title edited in place, a who/when line and the soft status pills. Then hook, caption,
 * visual idea. New post = the same panel, empty, with a date. No ✕ (as in Figma): Esc, the dimmed page,
 * or "‹ Calendar" on phones close it.
 * Not in this slice: "Inspired by" (Slice 10), the health-claim check (Slice 11); "Move to idea board"
 * is shown disabled.
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
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    try {
      await saveCard(clientId, card?.id ?? null, {
        ...fields,
        title,
        hook: clean(fields.hook),
        caption: clean(fields.caption),
        visual_idea: clean(fields.visual_idea),
      });
    } catch {
      setError("Couldn’t save. Check your connection and try again.");
      setSaving(false);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
    setSaving(false);
    onClose();
  };

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
  // Who / when: the card's creator and last edit; a new post shows you and the chosen day only.
  const who = card ? (card.creator?.full_name ?? null) : (profile.data?.full_name ?? null);
  const whoInitials = initialsFor(who, card ? "?" : (user?.email ?? "?"));
  const whoLine = [
    who,
    card ? editedAgo(card.updated_at) : null,
    dateRelation(fields.date, todayIso()),
  ]
    .filter(Boolean)
    .join(" · ");

  const header = (
    <div
      className={`flex flex-col gap-3.5 rounded-panel px-4 py-4 md:px-5 md:py-[18px] ${PLATFORM_TINT[fields.platform ?? "none"]}`}
    >
      <div className="flex flex-wrap items-center gap-x-2">
        <SelectChip
          label="Platform"
          placeholder="Platform"
          value={fields.platform}
          options={PLATFORM_OPTIONS}
          onChange={setPlatform}
        />
        <SelectChip
          label="Format"
          placeholder="Format"
          value={fields.format}
          options={formatOptions}
          onChange={(v) => set("format", v)}
          disabled={!fields.platform}
        />
        <DateChip
          value={fields.date}
          text={shortDay(fields.date)}
          onChange={(v) => set("date", v)}
        />
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
        <span>{whoLine}</span>
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
          <div className="hidden md:block">
            <Tooltip content={COMING_SOON}>
              {(tip) => (
                <Button
                  variant="secondary"
                  aria-disabled="true"
                  aria-describedby={tip["aria-describedby"]}
                  onClick={tip.onToggle}
                  className="cursor-not-allowed opacity-40"
                >
                  Move to idea board
                </Button>
              )}
            </Tooltip>
          </div>
        )}
        <Button onClick={() => void save()} disabled={saving} className="flex-1 md:flex-none">
          {saving ? "Saving…" : "Save"}
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
          <Field label="Hook">
            {(id) => <TextArea id={id} value={fields.hook} onChange={(v) => set("hook", v)} />}
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
    </>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block mono-label text-muted">
        {label}
      </label>
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
