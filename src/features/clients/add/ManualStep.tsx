import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BlipError } from "../../../components/blip/BlipPoses";
import { Button } from "../../../components/Button";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
} from "../../../components/icons/BrandIcons";
import { SelectField } from "../../../components/SelectField";
import { TextField } from "../../../components/TextField";
import { clientPath } from "../../../lib/client-path";
import { normaliseWebsite, siteHost } from "../../../lib/client-rules";
import { COUNTRIES, countryName } from "../../../lib/countries";
import type { Platform } from "../../../lib/platforms";
import { useClients } from "../../../lib/useClient";
import { ACCOUNT_PLACEHOLDER, parseAccount } from "./account-input";
import type { NewClient } from "../clients-api";

type Key = Platform;
const FIELDS: { key: Key; label: string; icon: ReactNode }[] = [
  { key: "instagram", label: "Instagram", icon: <InstagramIcon size={16} /> },
  { key: "tiktok", label: "TikTok", icon: <TikTokIcon size={16} /> },
  { key: "facebook", label: "Facebook", icon: <FacebookIcon size={16} /> },
  { key: "linkedin", label: "LinkedIn", icon: <LinkedInIcon size={16} /> },
  { key: "x", label: "X", icon: <XIcon size={16} /> },
];

/**
 * 15f / M18 Manual entry: after "No website? Add the details by hand" (no intro), or when the site couldn't
 * be read (Blip/Error, "We couldn't read {site}", nothing charged — or 1 credit for an error page — and
 * Try again). Name + website required, country defaults to United States, their accounts optional
 * (format checks only). Continue creates the client and opens its Overview.
 */
export function ManualStep({
  initialWebsite,
  unreadable,
  onTryAgain,
  onSubmit,
  onDirty,
}: {
  initialWebsite: string;
  unreadable: { reason: "no_answer" | "error_page"; credits: number } | null;
  onTryAgain: () => void;
  onSubmit: (c: NewClient) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const clients = useClients();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(initialWebsite.replace(/^https?:\/\//, ""));
  const [country, setCountry] = useState("US");
  const [industry, setIndustry] = useState("");
  const [accounts, setAccounts] = useState<Record<Key, string>>({
    instagram: "",
    tiktok: "",
    facebook: "",
    linkedin: "",
    x: "",
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = siteHost(website);
  const takenBy = host ? clients.data?.find((c) => siteHost(c.website) === host) : undefined;
  const parsed = Object.fromEntries(
    FIELDS.map((f) => [f.key, parseAccount(f.key, accounts[f.key])]),
  ) as Record<Key, ReturnType<typeof parseAccount>>;
  const nameError = !name.trim() ? "A name is needed." : null;
  const websiteError = !website.trim()
    ? "A website is needed."
    : !host
      ? "That doesn’t look like a website address."
      : null;
  const accountErrors = FIELDS.some((f) => parsed[f.key].error);
  const mark = (fn: () => void) => {
    fn();
    onDirty(true);
  };

  async function submit() {
    setTried(true);
    setError(null);
    if (nameError || websiteError || takenBy || accountErrors) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim().slice(0, 80),
        website: normaliseWebsite(website)!,
        country,
        industry: industry.trim() || null,
        accounts: Object.fromEntries(FIELDS.map((f) => [f.key, parsed[f.key].value])),
      });
    } catch {
      setBusy(false);
      setError("Couldn’t add the client. Nothing was saved; please try again.");
    }
  }

  const site = (initialWebsite || website).replace(/^https?:\/\/(www\.)?/, "");
  return (
    <div className="mx-auto max-w-160 px-4 py-6 md:py-12">
      {unreadable ? (
        <div className="flex flex-col items-center text-center">
          <BlipError className="h-auto w-20 md:w-24" />
          <h1 className="mt-4 text-title">We couldn’t read {site}</h1>
          <p className="mt-3 max-w-120 text-body-sm text-muted">
            {unreadable.reason === "error_page"
              ? "The site answered with an error page (1 credit). Add the basics by hand; you can scan again later from client settings."
              : "The site didn’t answer, or it blocks automated visits. Nothing was charged. Add the basics by hand; you can scan again later from client settings."}
          </p>
        </div>
      ) : (
        // Centred like the website step (15b), Fatima 25 Nov.
        <div className="mx-auto flex max-w-120 flex-col items-center text-center">
          <h1 className="text-title">Which client are we adding?</h1>
          <p className="mt-3 text-body-sm text-muted">
            Add the basics by hand. Their competitors come next, in Competitors.
          </p>
        </div>
      )}

      <form
        noValidate
        className="mt-6 flex flex-col gap-5 rounded-card border border-line bg-surface p-4 md:mt-8 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Name"
            value={name}
            onChange={(e) => mark(() => setName(e.target.value))}
            placeholder="Client name"
            maxLength={80}
            autoFocus
            tone={tried && nameError ? "error" : "default"}
            message={tried && nameError ? nameError : undefined}
          />
          <TextField
            label="Website"
            value={website}
            onChange={(e) => mark(() => setWebsite(e.target.value))}
            placeholder="example.com"
            inputMode="url"
            autoCapitalize="none"
            tone={(tried && websiteError) || takenBy ? "error" : "default"}
            message={takenBy ? undefined : tried && websiteError ? websiteError : undefined}
          />
        </div>
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
            onChange={(e) => mark(() => setCountry(e.target.value))}
            options={[...COUNTRIES]
              .map((c) => ({ value: c, label: countryName(c) }))
              .sort((a, b) => a.label.localeCompare(b.label))}
          />
          <TextField
            label="Industry"
            value={industry}
            onChange={(e) => mark(() => setIndustry(e.target.value))}
            placeholder="e.g. skincare, car detailing"
            maxLength={80}
          />
        </div>

        <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
          <legend className="float-left mb-1 mono-label text-muted">
            Their social accounts · optional
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            {FIELDS.map((f, i) => (
              <TextField
                key={f.key}
                // An odd last field (X) takes the whole row instead of sitting alone on half of it.
                className={
                  i === FIELDS.length - 1 && FIELDS.length % 2 === 1 ? "md:col-span-2" : ""
                }
                label={f.label}
                icon={f.icon}
                value={accounts[f.key]}
                onChange={(e) =>
                  mark(() => setAccounts((a) => ({ ...a, [f.key]: e.target.value })))
                }
                placeholder={ACCOUNT_PLACEHOLDER[f.key]}
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
        <div className="flex flex-col-reverse gap-2 pt-1 md:flex-row md:justify-end">
          {unreadable && (
            <Button variant="secondary" onClick={onTryAgain} disabled={busy}>
              Try again
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
