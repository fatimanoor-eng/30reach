import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(router.state.location.pathname).toBe("/c/northwind-clinic/overview");
  });

  it("old links without a client open the same page for your last client (17b)", async () => {
    const router = renderAt("/ideas?idea=abc");
    await screen.findByRole("heading", { level: 1, name: /^Ideas\s*Idea board$/ });
    expect(router.state.location.pathname).toBe("/c/northwind-clinic/ideas");
    expect(router.state.location.search).toBe("?idea=abc");
  });

  it("a slug no client has shows Client not found", async () => {
    renderAt("/c/nobody/overview");
    expect(await screen.findByRole("heading", { name: "Client not found" })).toBeInTheDocument();
  });

  it("the switcher lists clients with the current one ticked, and its settings (17b)", async () => {
    renderAt("/c/northwind-clinic/calendar");
    const [sidebarCard] = await screen.findAllByRole("button", {
      name: "Client: Northwind Clinic. Switch client",
    });
    fireEvent.click(sidebarCard);
    const menu = await screen.findByRole("group", { name: "Switch client" });
    const row = await within(menu).findByRole("link", { current: true });
    expect(row).toHaveTextContent("Northwind Clinic");
    expect(row).toHaveAttribute("href", "/c/northwind-clinic/calendar"); // same page, other client
    expect(await within(menu).findByText("No pull yet")).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Northwind Clinic settings" })).toHaveAttribute(
      "href",
      "/c/northwind-clinic/settings",
    );
    // Fewer than 6 clients: no search.
    expect(within(menu).queryByPlaceholderText("Search clients")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Switch client" })).not.toBeInTheDocument();
  });

  // Social pages: jsdom ignores CSS, so the heading reads "Social" (mobile) + the desktop title.
  it.each<[string, string | RegExp]>([
    ["/instagram", /^Social\s*Instagram$/],
    ["/tiktok", /^Social\s*TikTok$/],
    ["/linkedin", /^Social\s*LinkedIn$/],
    ["/facebook", /^Social\s*Facebook$/],
    ["/competitors", "Competitors"],
    // The calendar's title is the month on screen ("November" on phones, "November 2026" from 768 px).
    [
      "/calendar",
      /^(January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?$/,
    ],
    ["/ideas", /^Ideas\s*Idea board$/],
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
    // Sidebar card, icon rail and phone app bar each open the switcher.
    expect(screen.getAllByLabelText("Client: Northwind Clinic. Switch client")).toHaveLength(3);
    expect(screen.getAllByText("NO").length).toBeGreaterThanOrEqual(2); // client mark initials
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
      expect(router.state.location.pathname).toBe("/c/northwind-clinic/overview");
    } finally {
      window.__mqMatches = false;
    }
  });
});
