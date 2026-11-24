import { describe, expect, it } from "vitest";
import { groqTokens, usageRow } from "./usage.ts";

const CLIENT = "11111111-1111-4111-8111-111111111111";

describe("usageRow (Slice 17a)", () => {
  it("Firecrawl spend: credits, provider firecrawl, one request", () => {
    expect(
      usageRow({
        kind: "pull",
        clientId: CLIENT,
        clientName: "OBU Health",
        credits: 2,
        fn: "pull-task",
      }),
    ).toEqual({
      client_id: CLIENT,
      client_name: "OBU Health",
      kind: "pull",
      provider: "firecrawl",
      credits: 2,
      tokens: 0,
      requests: 1,
      fn: "pull-task",
      ref_id: null,
      actor: null,
    });
  });
  it("nothing to record: a free Firecrawl call (handle not found) or a Groq call without tokens", () => {
    expect(usageRow({ kind: "handle_check", clientId: CLIENT, credits: 0 })).toBeNull();
    expect(usageRow({ kind: "pull", credits: null })).toBeNull();
    expect(usageRow({ kind: "groq", tokens: 0 })).toBeNull();
  });
  it("Groq: tokens, never credits", () => {
    const r = usageRow({
      kind: "groq",
      clientId: CLIENT,
      tokens: 3266.4,
      credits: 9,
      fn: "ask-blip",
    });
    expect(r).toMatchObject({ provider: "groq", tokens: 3266, credits: 0, requests: 1 });
  });
  it("drops ids that aren't uuids and clamps negatives", () => {
    const r = usageRow({ kind: "scan", clientId: "obu", refId: "x", actor: "y", credits: -3 });
    expect(r).toBeNull();
    const r2 = usageRow({ kind: "scan", clientId: "obu", credits: 1, requests: -2 });
    expect(r2).toMatchObject({ client_id: null, requests: 0, credits: 1 });
  });
  it("groqTokens reads usage.total_tokens", () => {
    expect(groqTokens({ usage: { total_tokens: 2568 } })).toBe(2568);
    expect(groqTokens({})).toBe(0);
    expect(groqTokens(null)).toBe(0);
  });
});
