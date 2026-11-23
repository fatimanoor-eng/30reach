import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { type FieldTone, TextField } from "../../components/TextField";
import { useToast } from "../../components/toast-context";
import { type Platform, PLATFORM_ICON, STATUS_KEY, TARGET_KEY } from "../../lib/platforms";
import { CREDITS_QUERY_KEY } from "../../lib/useCredits";
import type { Competitor } from "../../lib/useCompetitors";
import { usePull } from "../pulls/pull-context";
import {
  CHECK_COST,
  duplicateOf,
  handlesToCheck,
  linkedInDisplay,
  MAX_INITIALS,
  parseHandle,
  PLATFORM_NAME,
  PLATFORMS,
  suggestInitials,
} from "./competitor-rules";
import { checkHandle, saveCompetitor, type CompetitorFields } from "./competitors-api";

type Feedback = { tone: FieldTone; message: string };
type Status = Competitor["instagram_status"];

const handleKey = (p: Platform) => TARGET_KEY[p];
const statusKey = (p: Platform) => STATUS_KEY[p];
const NOT_FOUND = "Not found. Check the spelling or leave it empty.";
const FOUND = (p: Platform) =>
  p === "linkedin" ? "Found · public company page" : "Found · public account";

/** What the field shows for a saved value: "@handle", or the LinkedIn page without https://www. */
const shownValue = (p: Platform, saved: string | null | undefined) =>
  !saved ? "" : p === "linkedin" ? linkedInDisplay(saved) : `@${saved}`;

/** Feedback for a saved handle when the panel opens (status from the last check or pull). */
function savedFeedback(c: Competitor | null, p: Platform): Feedback | null {
  if (!c?.[handleKey(p)]) return null;
  const s = c[statusKey(p)];
  if (s === "not_found")
    return { tone: "error", message: "Not found in the last pull. Check the spelling." };
  if (s === "ok") return { tone: "ok", message: FOUND(p) };
  return { tone: "default", message: "Not checked yet. The next Refresh checks it." };
}

/**
 * 07b Add / Edit competitor. Handles (and the LinkedIn company page) are checked on Save (never on
 * blur), only when new or changed, one at a time through `check-handle` (up to 2 credits if it exists,
 * 0 if not). One that isn't found isn't saved: the field turns red and the panel stays open; everything
 * else saves. At least one of Instagram, TikTok or LinkedIn is required.
 */
export function CompetitorPanel({
  open,
  onClose,
  competitor,
  competitors,
  clientId,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  /** null = Add competitor */
  competitor: Competitor | null;
  competitors: Competitor[];
  clientId: string;
  /** "Fix handle" from the 05g toast: put the cursor in this field */
  focus?: Platform;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const pull = usePull();
  const pullBusy = pull.state.kind !== "idle";

  // The row as saved so far (changes after a partial save of a new brand).
  const [saved, setSaved] = useState<Competitor | null>(competitor);
  const [name, setName] = useState(competitor?.name ?? "");
  const [initials, setInitials] = useState(competitor?.initials ?? "");
  const [initialsEdited, setInitialsEdited] = useState(!!competitor);
  const [inputs, setInputs] = useState<Record<Platform, string>>(
    () =>
      Object.fromEntries(
        PLATFORMS.map((p) => [p, shownValue(p, competitor?.[handleKey(p)])]),
      ) as Record<Platform, string>,
  );
  const [feedback, setFeedback] = useState<Record<Platform, Feedback | null>>(
    () =>
      Object.fromEntries(PLATFORMS.map((p) => [p, savedFeedback(competitor, p)])) as Record<
        Platform,
        Feedback | null
      >,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState<Platform | null>(null);
  const [saving, setSaving] = useState(false);
  // Answers already paid for in this panel (so "Save" again never re-checks the same handle).
  const [checked, setChecked] = useState<Record<string, "ok" | "not_found">>({});

  const shownInitials = initialsEdited ? initials : suggestInitials(name);
  const parsed = Object.fromEntries(PLATFORMS.map((p) => [p, parseHandle(p, inputs[p])])) as Record<
    Platform,
    ReturnType<typeof parseHandle>
  >;
  const after = Object.fromEntries(
    PLATFORMS.map((p) => [p, parsed[p].kind === "ok" ? parsed[p].handle : null]),
  ) as Record<Platform, string | null>;
  const before = Object.fromEntries(
    PLATFORMS.map((p) => [p, saved?.[handleKey(p)] ?? null]),
  ) as Record<Platform, string | null>;
  const toCheck = handlesToCheck(before, after).filter((p) => !checked[`${p}:${after[p]}`]);
  const busy = saving || checking !== null;
  const blockedByPull = pullBusy && toCheck.length > 0;

  const setInput = (p: Platform, v: string) => {
    setInputs((s) => ({ ...s, [p]: v }));
    setFeedback((s) => ({ ...s, [p]: null }));
    setFormError(null);
  };

  const finish = async (fields: CompetitorFields, id: string | null) => {
    const newId = await saveCompetitor(clientId, id, fields);
    const row: Competitor = { id: newId, ...fields };
    setSaved(row);
    await queryClient.invalidateQueries({ queryKey: ["competitors"] });
    return row;
  };

  const save = async () => {
    setFormError(null);
    // ── free checks first (no credits)
    let valid = true;
    if (!name.trim()) {
      setNameError("Add the brand’s name.");
      valid = false;
    }
    const nextFeedback = { ...feedback };
    for (const p of PLATFORMS) {
      const r = parsed[p];
      if (r.kind === "invalid") {
        nextFeedback[p] = { tone: "error", message: r.message };
        valid = false;
      } else if (r.kind === "ok") {
        const dup = duplicateOf(competitors, p, r.handle, saved?.id);
        if (dup) {
          const what = p === "linkedin" ? "page" : "handle";
          nextFeedback[p] = { tone: "error", message: `${dup.name} already uses this ${what}.` };
          valid = false;
        }
      }
    }
    setFeedback(nextFeedback);
    if (PLATFORMS.every((p) => parsed[p].kind === "empty")) {
      setFormError("Add at least one handle (Instagram, TikTok or LinkedIn).");
      valid = false;
    }
    if (!valid) return;

    // ── handle / page checks, one at a time (up to 2 credits each if it exists)
    const results: Partial<Record<Platform, "ok" | "not_found">> = {};
    for (const p of handlesToCheck(before, after)) {
      const key = `${p}:${after[p]}`;
      const known = checked[key];
      if (known) {
        results[p] = known;
        continue;
      }
      setChecking(p);
      setFeedback((s) => ({ ...s, [p]: { tone: "default", message: "Checking…" } }));
      const r = await checkHandle(p, after[p]!);
      setChecking(null);
      if (r.kind === "failed") {
        setFeedback((s) => ({ ...s, [p]: null }));
        setFormError(r.message);
        void queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
        return; // nothing saved; answers so far are remembered for the next Save
      }
      const answer = r.kind;
      setChecked((s) => ({ ...s, [key]: answer }));
      results[p] = r.kind;
      setFeedback((s) => ({
        ...s,
        [p]:
          r.kind === "ok"
            ? { tone: "ok", message: FOUND(p) }
            : { tone: "error", message: NOT_FOUND },
      }));
    }
    if (Object.keys(results).length)
      void queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });

    // ── what gets saved: found / unchanged / cleared handles; a not-found handle keeps the old value
    const fields: CompetitorFields = {
      name: name.trim(),
      initials: shownInitials.trim() || suggestInitials(name),
      instagram_handle: null,
      tiktok_handle: null,
      linkedin_url: null,
      instagram_status: "unchecked",
      tiktok_status: "unchecked",
      linkedin_status: "unchecked",
    };
    for (const p of PLATFORMS) {
      const res = results[p];
      let handle: string | null;
      let status: Status;
      if (res === "ok") [handle, status] = [after[p], "ok"];
      else if (res === "not_found")
        [handle, status] = [saved?.[handleKey(p)] ?? null, saved?.[statusKey(p)] ?? "unchecked"];
      else if (after[p] === null) [handle, status] = [null, "unchecked"];
      else [handle, status] = [after[p], saved?.[statusKey(p)] ?? "unchecked"];
      (fields as Record<string, unknown>)[handleKey(p)] = handle;
      (fields as Record<string, unknown>)[statusKey(p)] = handle ? status : "unchecked";
    }
    const notFound = PLATFORMS.filter((p) => results[p] === "not_found");

    // A new brand whose only handle / page wasn't found: nothing to save yet.
    if (PLATFORMS.every((p) => !fields[handleKey(p)])) {
      if (!saved) {
        setFormError("Nothing saved yet: fix the handle or try another.");
        return;
      }
    }

    setSaving(true);
    try {
      await finish(fields, saved?.id ?? null);
    } catch {
      setFormError("Couldn’t save. Check your connection and try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (notFound.length) {
      setFormError(
        `Saved ${fields.name} without the ${notFound.map((p) => PLATFORM_NAME[p]).join(" and ")} ${
          notFound.length === 1 && notFound[0] === "linkedin" ? "page" : "handle"
        }.`,
      );
      return; // keep the panel open on the red field
    }
    toast.show({
      title: `${saved ? "Saved" : "Added"} ${fields.name}`,
      detail: "Changes apply on the next Refresh.",
      pose: "success",
    });
    onClose();
  };

  const field = (p: Platform) => {
    const Icon = PLATFORM_ICON[p];
    const fb = feedback[p];
    return (
      <TextField
        key={p}
        label={PLATFORM_NAME[p]}
        icon={<Icon size={16} />}
        value={inputs[p]}
        onChange={(e) => setInput(p, e.target.value)}
        placeholder={
          p === "instagram"
            ? "@handle or profile link"
            : p === "tiktok"
              ? "@handle (optional)"
              : "Company page link (optional)"
        }
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        data-autofocus={focus === p || undefined}
        tone={fb?.tone ?? "default"}
        message={fb?.message}
      />
    );
  };

  const costNote =
    toCheck.length === 0
      ? "No handle to check · no credits"
      : `Checking costs ${CHECK_COST} credits per handle · up to ${CHECK_COST * toCheck.length} now`;
  const label = name.trim() ? `Save ${name.trim()}` : "Save";

  return (
    <Drawer
      open={open}
      onClose={busy ? () => {} : onClose}
      title={saved ? `Edit ${saved.name}` : "Add competitor"}
      description="30reach checks each handle is public before saving. Changes apply on the next Refresh."
      footer={
        <div className="flex flex-col gap-3">
          {formError && (
            <p role="alert" className="text-small text-spark">
              {formError}
            </p>
          )}
          {blockedByPull && (
            <p className="text-small text-muted">A pull is running. Save when it finishes.</p>
          )}
          <div className="flex flex-col gap-3">
            <p className="font-mono text-label text-muted">{costNote}</p>
            <div className="flex gap-2 md:justify-end">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={busy}
                className="flex-1 md:flex-none"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={busy || blockedByPull}
                className="flex-1 md:flex-none"
              >
                {checking ? `Checking ${PLATFORM_NAME[checking]}…` : saving ? "Saving…" : label}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !blockedByPull) void save();
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
          <TextField
            label="Brand name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            data-autofocus={!focus || undefined}
            autoComplete="off"
            tone={nameError ? "error" : "default"}
            message={nameError ?? undefined}
          />
          <TextField
            label="Initials"
            value={shownInitials}
            maxLength={MAX_INITIALS}
            onChange={(e) => {
              setInitials(e.target.value);
              setInitialsEdited(true);
            }}
            autoComplete="off"
            title="Shown on the brand pill. Suggested from the name; edit if you like."
          />
        </div>
        {PLATFORMS.map(field)}
        <p className="text-small text-muted">
          At least one handle or page. One that isn’t found costs nothing and isn’t saved.
        </p>
        {/* Enter in a field submits */}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
