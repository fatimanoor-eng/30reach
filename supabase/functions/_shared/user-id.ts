// Who made the request (pure; tested in user-id.test.ts). Re-exported by server.ts.

/**
 * The signed-in person's id (27 Nov fix). @supabase/server gives it as `userClaims.id` (the raw JWT's
 * `sub` is in `jwtClaims`); reading `userClaims.sub` returned undefined, so usage_events.actor,
 * pulls.started_by and Blip's first name were always empty.
 */
export function userIdOf(ctx: {
  userClaims?: { id?: unknown } | null;
  jwtClaims?: { sub?: unknown } | null;
}): string | null {
  const id = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
  return typeof id === "string" && id ? id : null;
}
