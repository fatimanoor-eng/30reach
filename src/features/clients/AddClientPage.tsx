import { useQueryClient } from "@tanstack/react-query";
import { X as XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
} from "../../components/icons/BrandIcons";
import { Logo } from "../../components/Logo";
import { ModalPresence } from "../../components/ModalPresence";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useAuth } from "../../lib/auth/auth-context";
import { clientPath } from "../../lib/client-path";
import { normaliseWebsite, parseXHandle, siteHost } from "../../lib/client-rules";
import { COUNTRIES, countryName } from "../../lib/countries";
import type { Platform } from "../../lib/platforms";
import { useClients } from "../../lib/useClient";
import { parseHandle } from "../competitors/competitor-rules";
import { createClient, invalidateClient } from "./clients-api";

type Accounts = Record<Platform | "x", string>;
const EMPTY: Accounts = { instagram: "", tiktok: "", facebook: "", linkedin: "", x: "" };

const ACCOUNT_FIELDS: {
  key: Platform | "x";
  label: string;
  placeholder: string;
  icon: ReactNode;
}[] = [
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "@handle",
    icon: <InstagramIcon size={16} />,
  },
  { key: "tiktok", label: "TikTok", placeholder: "@handle", icon: <TikTokIcon size={16} /> },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "Page link",
    icon: <FacebookIcon size={16} />,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "Company page link",
    icon: <LinkedInIcon size={16} />,
  },
  {
    key: "x",
    label: "X",
    placeholder: "@handle",
    icon: <span className="text-small font-medium">𝕏</span>,
  },
];

/** What someone typed → stored value, or an error line. Format only: nothing is charged here. */
function parseAccount(
  key: Platform | "x",
  value: string,
): { value: string | null; error?: string } {
  if (key === "x") {
    const h = parseXHandle(value);
    return h === undefined
      ? { value: null }
      : h
        ? { value: h }
        : { value: null, error: "Use 1–15 letters, numbers or underscores." };
  }
  const r = parseHandle(key, value);
  return r.kind === "ok"
    ? { value: r.handle }
    : r.kind === "empty"
      ? { value: null }
      : { value: null, error: r.message };
}

/**
 * Add client, manual entry (15f without the error; Slice 17c). Full screen, "Add client" top bar with
 * Close ("Leave Add client? Nothing is saved." once something is typed; Esc = Close). Name and website
 * are required, country defaults to United States, their own social accounts are optional. Continue
 * creates the client (+ its platforms) and opens its Overview (first-run). Scanning a website (15b–15d)
 * comes with Slice 17d.
 */
export function AddClientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const clients = useClients();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("US");
  const [industry, setIndustry] = useState("");
  const [accounts, setAccounts] = useState<Accounts>(EMPTY);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const host = siteHost(website);
  const takenBy = host ? clients.data?.find((c) => siteHost(c.website) === host) : undefined;
  const parsed = Object.fromEntries(
    ACCOUNT_FIELDS.map((f) => [f.key, parseAccount(f.key, accounts[f.key])]),
  ) as Record<Platform | "x", { value: string | null; error?: string }>;
  const nameError = !name.trim() ? "A name is needed." : null;
  const websiteError = !website.trim()
    ? "A website is needed."
    : !host
      ? "That doesn’t look like a website address."
      : null;
  const accountErrors = ACCOUNT_FIELDS.some((f) => parsed[f.key].error);
  const dirty = !!(name || website || industry || Object.values(accounts).some(Boolean));
  const active = (clients.data ?? []).some((c) => !c.archived_at);

  const close = () => {
    if (dirty) setLeaving(true);
    else leave();
  };
  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }

  async function submit() {
    setTried(true);
    setError(null);
    if (nameError || websiteError || takenBy || accountErrors) return;
    setBusy(true);
    try {
      const client = await createClient(
        {
          name: name.trim().slice(0, 80),
          website: normaliseWebsite(website)!,
          country,
          industry: industry.trim() || null,
          accounts: Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f.key, parsed[f.key].value])),
        },
        user?.id ?? null,
      );
      invalidateClient(queryClient, client.id);
      navigate(clientPath(client.slug, "/overview"), {
        state: {
          notice: `${client.name} added`,
          noticeDetail: "Next: add competitors, then run the first pull.",
        },
      });
    } catch {
      setBusy(false);
      setError("Couldn’t add the client. Nothing was saved; please try again.");
    }
  }

  return (
    <div
      className="min-h-dvh bg-bg"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !leaving) close();
      }}
    >
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-surface px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Logo className="hidden h-5 w-auto md:block" />
          <span aria-hidden="true" className="hidden h-5 w-px bg-line md:block" />
          <p className="text-body font-medium">Add client</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-body-sm hover:bg-soft md:min-h-10"
        >
          <XIcon size={18} aria-hidden="true" />
          Close
        </button>
      </header>

      <main className="mx-auto max-w-160 px-4 py-8 md:py-12">
        <h1 className="text-title md:text-display">Which client are we adding?</h1>
        <p className="mt-3 text-body text-muted">
          Add the basics by hand. Their competitors come next, in Competitors.
        </p>

        <form
          noValidate
          className="mt-8 flex flex-col gap-5 rounded-card border border-line bg-surface p-4 md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="All The Best Co"
            maxLength={80}
            autoFocus
            tone={tried && nameError ? "error" : "default"}
            message={tried && nameError ? nameError : undefined}
          />
          <TextField
            label="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="all-the-best.co"
            inputMode="url"
            autoCapitalize="none"
            tone={(tried && websiteError) || takenBy ? "error" : "default"}
            message={takenBy ? undefined : tried && websiteError ? websiteError : undefined}
          />
          {takenBy && (
            <p role="alert" className="-mt-3 text-small text-spark-text">
              {takenBy.name} already uses {host} ·{" "}
              <Link to={clientPath(takenBy.slug, "/overview")} className="font-medium underline">
                Open it
              </Link>
            </p>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            <SelectField
              label="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              options={[...COUNTRIES]
                .map((c) => ({ value: c, label: countryName(c) }))
                .sort((a, b) => a.label.localeCompare(b.label))}
            />
            <TextField
              label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. luxury gifting"
              maxLength={80}
            />
          </div>

          <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
            <legend className="float-left mb-1 mono-label text-muted">
              Their social accounts · optional
            </legend>
            <div className="grid gap-4 md:grid-cols-2">
              {ACCOUNT_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  icon={f.icon}
                  value={accounts[f.key]}
                  onChange={(e) => setAccounts((a) => ({ ...a, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  autoCapitalize="none"
                  tone={tried && parsed[f.key].error ? "error" : "default"}
                  message={tried ? parsed[f.key].error : undefined}
                />
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-small text-spark-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="submit" disabled={busy} fullWidth className="md:w-auto">
              {busy ? "Adding…" : "Continue"}
            </Button>
          </div>
        </form>
        {!active && clients.data && (
          <p className="mt-4 text-center text-small text-muted">
            There are no active clients yet. Add the first one to start.
          </p>
        )}
      </main>

      <ModalPresence open={leaving}>
        <ConfirmDialog
          open={leaving}
          onClose={() => setLeaving(false)}
          title="Leave Add client?"
          description="Nothing is saved."
          confirmLabel="Leave"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setLeaving(false);
            leave();
          }}
        />
      </ModalPresence>
    </div>
  );
}
