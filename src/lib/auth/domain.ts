/**
 * Team domain rules. The REAL checks are server-side: the Before User Created hook
 * (supabase/migrations/*_auth_hook.sql) and is_team() in RLS. This only decides which screen to show.
 */
export const TEAM_DOMAIN = "breakthirty.com";

export function isTeamEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 && value.indexOf("@") === at && value.slice(at + 1) === TEAM_DOMAIN;
}

/**
 * The hook rejects with: "<email> isn't a Breakthirty account. 30reach only lets in …".
 * Supabase sends that text back as `error_description`; pull the address out for screen 02.
 */
export function parseRejectedEmail(description: string | null | undefined): string | null {
  const match = description?.match(/^(\S+@\S+) isn['’]t a Breakthirty account/);
  return match ? match[1] : null;
}

export function isDomainRejection(description: string | null | undefined): boolean {
  return /isn['’]t a Breakthirty account/.test(description ?? "");
}

/** "Fatima Noor" → "FN"; falls back to the email's first letter. */
export function initialsFor(name: string | null, email: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 1).toUpperCase();
}

/** Google sends errors back in the query or the hash, depending on the flow. */
export function readUrlError(href: string): string | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const params of [url.searchParams, hash]) {
    const description = params.get("error_description") ?? params.get("error");
    if (description) return description.replace(/\+/g, " ");
  }
  return null;
}
