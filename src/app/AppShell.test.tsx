import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { fakeAuth } from "../test/fake-auth";
import { TestProviders } from "../test/FakeAuth";
import { routes } from "./router";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <TestProviders auth={fakeAuth("team")}>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return router;
}

describe("App shell", () => {
  it("redirects / to Overview", async () => {
    const router = renderAt("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Run your first pull" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/overview");
  });

  // Social pages: jsdom ignores CSS, so the heading reads "Social" (mobile) + the desktop title.
  it.each<[string, string | RegExp]>([
    ["/instagram", /^Social\s*Instagram$/],
    ["/tiktok", /^Social\s*TikTok$/],
    ["/competitors", "Competitors"],
    ["/calendar", "Calendar"],
    ["/ideas", "Idea board"],
    ["/settings", "Settings"],
    ["/more", "More"],
  ])("%s renders its page", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("shows the client name from the database (sidebar, rail, top bar, breadcrumb)", async () => {
    renderAt("/settings");
    // jsdom has no CSS, so the sidebar, mobile top bar and breadcrumb all render it.
    expect((await screen.findAllByText("Northwind Clinic")).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText("Client: Northwind Clinic")).toBeInTheDocument(); // icon rail
    expect(screen.getByText("NO")).toBeInTheDocument(); // rail avatar initials
  });

  it("unknown routes show Page not found", async () => {
    renderAt("/nope");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("brand selection is shared between Instagram and TikTok (and Overview)", async () => {
    const router = renderAt("/instagram");
    const hims = await screen.findByRole("button", { name: "Hims" });
    fireEvent.click(hims);
    expect(hims).toHaveAttribute("aria-pressed", "true");
    await router.navigate("/tiktok");
    expect(await screen.findByRole("button", { name: "Hims" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Overview without a saved pull shows the first-run checklist (03)", async () => {
    renderAt("/overview");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Run your first pull" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 brands: Hers, Hims, Ro")).toBeInTheDocument();
  });

  it('"/" opens Ask Blip, but not while typing', async () => {
    renderAt("/overview");
    await screen.findByRole("heading", { level: 1, name: /^(Overview|Run your first pull)$/ });

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "/" });
    expect(screen.queryByRole("dialog", { name: "Ask Blip" })).not.toBeInTheDocument();
    input.remove();

    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("dialog", { name: "Ask Blip" })).toHaveAttribute("open");
  });

  it("More redirects to Overview from tablet up", async () => {
    window.__mqMatches = true;
    try {
      const router = renderAt("/more");
      await screen.findByRole("heading", { level: 1, name: /^(Overview|Run your first pull)$/ });
      expect(router.state.location.pathname).toBe("/overview");
    } finally {
      window.__mqMatches = false;
    }
  });
});
