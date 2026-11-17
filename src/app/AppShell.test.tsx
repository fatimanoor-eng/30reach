import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "./router";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("App shell", () => {
  it("redirects / to Overview", async () => {
    const router = renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/overview");
  });

  it.each([
    ["/instagram", "Instagram"],
    ["/tiktok", "TikTok"],
    ["/competitors", "Competitors"],
    ["/calendar", "Calendar"],
    ["/ideas", "Idea board"],
    ["/settings", "Settings"],
    ["/more", "More"],
  ])("%s renders its page", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("unknown routes show Page not found", async () => {
    renderAt("/nope");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("brand selection is shared between Overview and Instagram", async () => {
    const router = renderAt("/overview");
    fireEvent.click(await screen.findByRole("button", { name: /Hims$/ }));
    expect(screen.getByText(/Selection: Hims/)).toBeInTheDocument();
    await router.navigate("/instagram");
    expect(await screen.findByText(/Selection: Hims/)).toBeInTheDocument();
  });

  it('"/" opens Ask Blip, but not while typing', async () => {
    renderAt("/overview");
    await screen.findByRole("heading", { level: 1, name: "Overview" });

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
      await screen.findByRole("heading", { level: 1, name: "Overview" });
      expect(router.state.location.pathname).toBe("/overview");
    } finally {
      window.__mqMatches = false;
    }
  });
});
