import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Drawer } from "../../components/Drawer";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { Tooltip } from "../../components/Tooltip";
import { useToast } from "../../components/toast-context";
import {
  FORMAT_NAME,
  FORMATS,
  PLATFORM_LABEL,
  STATUS_LABEL,
  STATUSES,
  type CalendarCard,
  type CardPlatform,
  type CardStatus,
} from "./calendar-ui";
import { StatusDot } from "./CardTile";
import { deleteCard, saveCard, type CardFields } from "./cards-api";
import type { IsoDay } from "./events/dates";
import { shortDay } from "./format";

const COMING_SOON = "Coming soon";

/**
 * 09 card detail (drawer from 768 px) / M08 (full-screen page with a back arrow and a sticky Save bar).
 * Title is edited in place; the "TIKTOK · VIDEO · FRI 4 DEC" line is three pickers (platform, format,
 * date). Then status, hook, caption, visual idea. New post = the same panel, empty, with a date.
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

  const set = <K extends keyof CardFields>(key: K, value: CardFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const setPlatform = (platform: CardPlatform | null) =>
    setFields((f) => ({
      ...f,
      platform,
      // keep the format only if the new platform has it
      format: platform && f.format && FORMATS[platform].includes(f.format) ? f.format : null,
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

  const PlatformIcon = fields.platform === "tiktok" ? TikTokIcon : InstagramIcon;
  const formats = fields.platform ? FORMATS[fields.platform] : [];

  const header = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 mono-label text-muted">
        {fields.platform && <PlatformIcon size={14} aria-hidden="true" className="shrink-0" />}
        <MetaSelect
          label="Platform"
          value={fields.platform ?? ""}
          onChange={(v) => setPlatform((v || null) as CardPlatform | null)}
          options={[
            ["", "Platform"],
            ["instagram", PLATFORM_LABEL.instagram],
            ["tiktok", PLATFORM_LABEL.tiktok],
          ]}
        />
        <span aria-hidden="true">·</span>
        <MetaSelect
          label="Format"
          value={fields.format ?? ""}
          onChange={(v) => set("format", v || null)}
          disabled={!fields.platform}
          options={[["", "Format"], ...formats.map((f) => [f, FORMAT_NAME[f]] as [string, string])]}
        />
        <span aria-hidden="true">·</span>
        {/* The real date input sits invisibly on top of the text, so a click or tap opens its picker. */}
        <span className="relative inline-flex min-h-11 items-center gap-1 md:min-h-6">
          <span aria-hidden="true">{shortDay(fields.date)}</span>
          <ChevronDown size={12} aria-hidden="true" />
          <input
            type="date"
            aria-label="Date"
            required
            value={fields.date}
            onChange={(e) => e.target.value && set("date", e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                /* older browsers open it themselves */
              }
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
      </div>
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
        className="mt-2 [field-sizing:content] w-full resize-none bg-transparent text-heading outline-none placeholder:text-muted md:text-title"
      />
      {titleError && (
        <p id={titleErrorId} className="mt-1 text-small text-spark">
          Add a title.
        </p>
      )}
    </>
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
        header={header}
        footer={footer}
      >
        <div className="flex flex-col gap-5">
          <div
            className="flex flex-wrap items-center gap-x-1.5"
            role="radiogroup"
            aria-label="Status"
          >
            <span aria-hidden="true" className="mr-1 hidden mono-label text-muted md:inline">
              Status
            </span>
            {STATUSES.map((s) => (
              <StatusChip
                key={s}
                status={s}
                selected={fields.status === s}
                onSelect={() => set("status", s)}
              />
            ))}
          </div>
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

/** A native <select> that looks like part of the mono meta line. */
function MetaSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-flex min-h-11 items-center md:min-h-6">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="[field-sizing:content] cursor-pointer appearance-none bg-transparent pr-4 uppercase outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-0" />
    </span>
  );
}

function StatusChip({
  status,
  selected,
  onSelect,
}: {
  status: CardStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group inline-flex min-h-11 items-center md:min-h-9"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium ${selected ? "bg-ink text-white" : "bg-soft text-ink group-hover:bg-line"}`}
      >
        <StatusDot status={status} size="md" />
        {STATUS_LABEL[status]}
      </span>
    </button>
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
