import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { ClientMark } from "../../app/ClientMark";
import { normaliseWebsite, siteHost } from "../../lib/client-rules";
import { COUNTRIES, countryName, LANGUAGES, languageName } from "../../lib/countries";
import { useClients } from "../../lib/useClient";
import { type ClientDetails, uploadLogo, useUpdateClient } from "./clients-api";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Edit brand (16 "Edit brand" / M19): the Add client Review fields (15d) — name, what they do, website,
 * country, language, industry, logo, brand colour. The slug (URL) stays the same after a rename. A logo
 * is compressed before it's stored (CLAUDE.md rule 8). Drawer from 768 px, full screen on phones.
 */
export function EditBrandDrawer({
  client,
  onClose,
}: {
  client: ClientDetails;
  onClose: () => void;
}) {
  const update = useUpdateClient(client.id);
  const clients = useClients();
  const [name, setName] = useState(client.name);
  const [description, setDescription] = useState(client.description ?? "");
  const [website, setWebsite] = useState(client.website?.replace(/^https?:\/\//, "") ?? "");
  const [country, setCountry] = useState(client.country);
  const [language, setLanguage] = useState(client.language);
  const [industry, setIndustry] = useState(client.industry ?? "");
  const [color, setColor] = useState(client.brand_color ?? "");
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descId = useId();
  const fileId = useId();

  useEffect(() => () => (logo ? URL.revokeObjectURL(logo.url) : undefined), [logo]);

  const host = siteHost(website);
  const websiteError = website.trim() && !host ? "That doesn’t look like a website address." : null;
  const takenBy =
    host && clients.data?.find((c) => c.id !== client.id && siteHost(c.website) === host);
  const colorError =
    color.trim() && !HEX.test(color.trim()) ? "Use a hex colour like #C8493F." : null;
  const canSave = !!name.trim() && !websiteError && !takenBy && !colorError && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let logo_path = removeLogo ? null : client.logo_path;
      if (logo) logo_path = await uploadLogo(client.id, logo.file);
      await update.mutateAsync({
        name: name.trim().slice(0, 80),
        description: description.trim() || null,
        website: website.trim() ? normaliseWebsite(website) : null,
        country,
        language,
        industry: industry.trim() || null,
        brand_color: color.trim() ? color.trim().toUpperCase() : null,
        logo_path,
      });
      onClose();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof Error && e.message === "too_big"
          ? "That SVG is over 200 KB. Try a smaller file or a PNG."
          : "Couldn’t save. Please try again.",
      );
    }
  }

  const preview = {
    name: name || client.name,
    initials: client.initials,
    brand_color: HEX.test(color.trim()) ? color.trim() : null,
    logo_path: removeLogo || logo ? null : client.logo_path,
  };

  return (
    <Drawer
      open
      onClose={() => !busy && onClose()}
      title="Edit brand"
      description="Name, website and how the client looks in 30reach. The link to this client stays the same."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          {logo ? (
            <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-[7px] border border-line bg-white p-0.5">
              <img src={logo.url} alt="" className="size-full object-contain" />
            </span>
          ) : (
            <ClientMark client={preview} size="lg" />
          )}
          <label
            htmlFor={fileId}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 text-body-sm font-medium hover:bg-soft md:min-h-10"
          >
            <ImagePlus size={16} aria-hidden="true" />
            {client.logo_path || logo ? "Change logo" : "Add logo"}
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setLogo({ file, url: URL.createObjectURL(file) });
                setRemoveLogo(false);
              }
              e.target.value = "";
            }}
          />
          {(client.logo_path || logo) && !removeLogo && (
            <button
              type="button"
              onClick={() => {
                setLogo(null);
                setRemoveLogo(true);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 text-small text-muted hover:text-ink md:min-h-8"
            >
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
          )}
        </div>

        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          message={name.trim() ? undefined : "A name is needed."}
          tone={name.trim() ? "default" : "error"}
        />
        <div>
          <label htmlFor={descId} className="mb-2 block mono-label text-muted">
            What they do
          </label>
          <textarea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={400}
            className="[field-sizing:content] min-h-20 w-full resize-none rounded-control border border-line bg-surface px-3.5 py-2.5 text-body outline-none focus:border-ink"
          />
        </div>
        <TextField
          label="Website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="all-the-best.co"
          inputMode="url"
          tone={websiteError || takenBy ? "error" : "default"}
          message={websiteError ?? (takenBy ? `${takenBy.name} already uses ${host}.` : undefined)}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[...COUNTRIES]
              .map((c) => ({ value: c, label: countryName(c) }))
              .sort((a, b) => a.label.localeCompare(b.label))}
          />
          <SelectField
            label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={LANGUAGES.map((l) => ({ value: l, label: languageName(l) }))}
          />
        </div>
        <TextField
          label="Industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. luxury gifting"
          maxLength={80}
        />
        <div>
          <TextField
            label="Brand colour"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#C8493F · empty = initials on ink"
            maxLength={7}
            tone={colorError ? "error" : "default"}
            message={colorError ?? "Black or white brand colours show the initials on ink."}
            icon={
              <input
                type="color"
                aria-label="Pick a brand colour"
                value={HEX.test(color.trim()) ? color.trim() : "#0b0b0c"}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="size-6 cursor-pointer rounded-[4px] border-0 bg-transparent p-0"
              />
            }
          />
        </div>
        {error && (
          <p role="alert" className="text-small text-spark-text">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}
