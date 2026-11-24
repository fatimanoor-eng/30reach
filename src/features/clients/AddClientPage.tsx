import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalPresence } from "../../components/ModalPresence";
import { useAuth } from "../../lib/auth/auth-context";
import { useCurrentUser } from "../../lib/auth/useCurrentUser";
import { clientPath } from "../../lib/client-path";
import { firstNameFrom, initialsFor } from "../../lib/client-rules";
import { plural } from "../../lib/format";
import { createClient, invalidateClient } from "./clients-api";
import { createScannedClient } from "./add/add-client-api";
import {
  competitorRowsForCreate,
  platformRowsForCreate,
  platformsOn,
  welcomeDetail,
} from "./add/add-client-rules";
import {
  clearFlow,
  type FlowState,
  loadFlow,
  saveFlow,
  START,
  START_PULL_KEY,
} from "./add/add-client-state";
import { parseAccount } from "./add/account-input";
import { AddClientShell } from "./add/AddClientShell";
import { FirstPullStep } from "./add/FirstPullStep";
import { ManualStep } from "./add/ManualStep";
import { ReviewStep } from "./add/ReviewStep";
import { ScanningStep } from "./add/ScanningStep";
import { WebsiteStep } from "./add/WebsiteStep";

/** The manual form has no scan or review: Website → Details → First pull (Fatima, 25 Nov). */
const MANUAL_STEPS = ["Website", "Details", "First pull"];

const STEP_NUMBER: Record<FlowState["step"], number> = {
  website: 1,
  scanning: 2,
  manual: 2,
  unreadable: 2,
  review: 3,
  "first-pull": 4,
};

/**
 * Add client (Slice 17d; 15b–15g, M14–M18), full screen at /add-client:
 * 1 Website → 2 Scan (checklist) → 3 Review → 4 First pull → the new client's Overview (15g).
 * "No website?" or a site that can't be read → the manual form (15f / M18). Progress is kept for this tab
 * (sessionStorage), so a reload carries on without paying twice. Close / Esc asks first once anything has
 * started ("Leave Add client? Nothing is saved.").
 */
export function AddClientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const me = useCurrentUser();
  const [state, setState] = useState<FlowState>(loadFlow);
  const [manualDirty, setManualDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => saveFlow(state), [state]);
  const update = (patch: Partial<FlowState> | ((s: FlowState) => Partial<FlowState>)) =>
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));

  const started = state.step !== "website" || manualDirty || !!state.scan;
  const manualPath = state.step === "manual" || state.step === "unreadable";
  function leave() {
    clearFlow();
    if (state.created) {
      navigate(clientPath(state.created.slug, "/overview"));
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }
  const close = () => (state.created || !started ? leave() : setLeaving(true));

  // Esc = Close (unless a dialog is open: it closes that instead).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function create() {
    const d = state.draft;
    if (!d) return;
    setCreating(true);
    setCreateError(null);
    try {
      const competitors = competitorRowsForCreate(d, parseAccount);
      const client = await createScannedClient(
        {
          client: {
            name: d.name.trim().slice(0, 80),
            initials: initialsFor(d.name),
            website: d.website,
            description: d.description.trim() || null,
            industry: d.industry.trim() || null,
            audience: d.audience.trim() || null,
            country: d.country,
            language: d.language,
            brand_color: d.color.trim() ? d.color.trim().toUpperCase() : null,
            logo_path: d.logoPath,
            regulated: d.regulated,
            audience_is_kids: d.audienceIsKids,
            health_months: d.healthMonths,
            content_rules: d.rules.map((r) =>
              r.source === "team"
                ? {
                    ...r,
                    added_by_name: firstNameFrom(me.name, me.email),
                    added_at: new Date().toISOString(),
                  }
                : r,
            ),
          },
          platforms: platformRowsForCreate(d, parseAccount),
          competitors,
        },
        user?.id ?? null,
        state.scanId,
      );
      invalidateClient(queryClient, client.id);
      update({
        step: "first-pull",
        created: { ...client, competitors: competitors.length, platforms: platformsOn(d) },
      });
    } catch {
      setCreateError("Couldn’t create the client. Nothing was saved; please try again.");
    } finally {
      setCreating(false);
    }
  }

  function openClient(pullNow: boolean) {
    const c = state.created!;
    if (pullNow) {
      try {
        sessionStorage.setItem(START_PULL_KEY(c.id), "1");
      } catch {
        /* blocked: they can press Refresh */
      }
    }
    clearFlow();
    navigate(clientPath(c.slug, "/overview"), {
      state: {
        notice: `${c.name} added`,
        noticeDetail: welcomeDetail(c.competitors, c.platforms, pullNow),
      },
    });
  }

  let body;
  switch (state.step) {
    case "website":
      body = (
        <WebsiteStep
          initial={state.website.replace(/^https?:\/\//, "")}
          onScan={(website) =>
            // Same site after Back: return to Review with the edits kept (nothing is paid again).
            state.draft && state.website === website
              ? update({ step: "review" })
              : setState({ ...START, website, step: "scanning", scanId: crypto.randomUUID() })
          }
          onManual={() => update({ step: "manual", unreadable: null })}
        />
      );
      break;
    case "scanning":
      body = (
        <ScanningStep
          state={state}
          update={update}
          onUnreadable={(u) =>
            update((s) => ({ step: "unreadable", unreadable: u, credits: s.credits + u.credits }))
          }
          onCancelled={() =>
            update({ step: "website", scan: null, suggestions: null, accountsRead: 0 })
          }
          onManual={() => update({ step: "manual", unreadable: null })}
        />
      );
      break;
    case "manual":
    case "unreadable":
      body = (
        <ManualStep
          initialWebsite={state.website}
          unreadable={state.step === "unreadable" ? state.unreadable : null}
          onDirty={setManualDirty}
          onTryAgain={() =>
            update({
              step: "scanning",
              scan: null,
              suggestions: null,
              accountsRead: 0,
              unreadable: null,
            })
          }
          onSubmit={async (c) => {
            const client = await createClient(c, user?.id ?? null);
            invalidateClient(queryClient, client.id);
            clearFlow();
            navigate(clientPath(client.slug, "/overview"), {
              state: {
                notice: `${client.name} added`,
                noticeDetail: "Next: add competitors, then run the first pull.",
              },
            });
          }}
        />
      );
      break;
    case "review":
      body = state.draft ? (
        <ReviewStep
          draft={state.draft}
          onChange={(draft) => update({ draft })}
          onBack={() => update({ step: "website" })}
          onCreate={() => void create()}
          busy={creating}
          error={createError}
        />
      ) : null;
      break;
    case "first-pull":
      body = state.created ? (
        <FirstPullStep
          client={state.created}
          onLater={() => openClient(false)}
          onPullNow={() => openClient(true)}
        />
      ) : null;
      break;
  }

  return (
    <AddClientShell
      step={manualPath ? 2 : STEP_NUMBER[state.step]}
      steps={manualPath ? MANUAL_STEPS : undefined}
      onClose={close}
    >
      {body}
      <ModalPresence open={leaving}>
        <ConfirmDialog
          open={leaving}
          onClose={() => setLeaving(false)}
          title="Leave Add client?"
          description={
            state.credits > 0
              ? `Nothing is saved. ${plural(state.credits, "credit")} already used for scanning show in Usage.`
              : "Nothing is saved."
          }
          confirmLabel="Leave"
          cancelLabel="Keep going"
          onConfirm={() => {
            setLeaving(false);
            leave();
          }}
        />
      </ModalPresence>
    </AddClientShell>
  );
}
