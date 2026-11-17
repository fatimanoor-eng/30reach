import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { routes } from "../../app/router";
import { FRESH_SIGN_IN_KEY, type AuthValue } from "../../lib/auth/auth-context";
import { fakeAuth } from "../../test/fake-auth";
import { TestProviders } from "../../test/FakeAuth";

function renderAt(path: string, auth: AuthValue) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <TestProviders auth={auth}>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return router;
}

/** The app's Overview route: the dashboard, or 03 First run when nothing has been pulled yet. */
const OVERVIEW = /^(Overview|Run your first pull)$/;
const h1 = (name: string | RegExp) => screen.findByRole("heading", { level: 1, name });

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("protected routes", () => {
  it("signed out → sign in (01)", async () => {
    const router = renderAt("/calendar", fakeAuth("signedOut"));
    expect(await h1(/Sign in to/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it("wrong account → 02 with their email", async () => {
    const router = renderAt("/overview", fakeAuth("wrongAccount", "ali.khan@gmail.com"));
    expect(await h1("That account can’t get in")).toBeInTheDocument();
    expect(
      screen.getByText(/ali\.khan@gmail\.com isn’t a Breakthirty account/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/wrong-account");
  });

  it("loading shows nothing yet (no flash of sign-in)", () => {
    renderAt("/overview", fakeAuth("loading"));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("team → the app", async () => {
    renderAt("/overview", fakeAuth("team"));
    expect(await h1(OVERVIEW)).toBeInTheDocument();
  });
});

describe("sign in (01)", () => {
  it("Continue with Google starts Google sign-in", async () => {
    const auth = fakeAuth("signedOut");
    renderAt("/sign-in", auth);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("a signed-in team member skips it", async () => {
    const router = renderAt("/sign-in", fakeAuth("team"));
    await h1(OVERVIEW);
    expect(router.state.location.pathname).toBe("/overview");
  });
});

describe("/welcome (01b)", () => {
  it("shows the welcome only after a fresh sign-in", async () => {
    sessionStorage.setItem(FRESH_SIGN_IN_KEY, "1");
    const router = renderAt("/welcome", fakeAuth("team"));
    expect(await h1("Welcome in, Fatima!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open 30reach" }));
    await h1(OVERVIEW);
    expect(router.state.location.pathname).toBe("/overview");
    expect(sessionStorage.getItem(FRESH_SIGN_IN_KEY)).toBeNull();
  });

  it("goes straight to Overview when not fresh", async () => {
    const router = renderAt("/welcome", fakeAuth("team"));
    await h1(OVERVIEW);
    expect(router.state.location.pathname).toBe("/overview");
  });

  it("hook rejection in the URL → 02 with the rejected email", async () => {
    window.history.replaceState(
      null,
      "",
      "/welcome?error=access_denied&error_description=ali.khan%40gmail.com+isn%27t+a+Breakthirty+account.+30reach+only+lets+in+%40breakthirty.com+Google+accounts.",
    );
    renderAt("/welcome", fakeAuth("signedOut"));
    expect(await h1("That account can’t get in")).toBeInTheDocument();
    expect(
      screen.getByText(/ali\.khan@gmail\.com isn’t a Breakthirty account/),
    ).toBeInTheDocument();
  });

  it("any other error → back to 01 with a message", async () => {
    window.history.replaceState(
      null,
      "",
      "/welcome#error=access_denied&error_description=User+cancelled",
    );
    renderAt("/welcome", fakeAuth("signedOut"));
    expect(await h1(/Sign in to/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("User cancelled");
  });
});

describe("wrong account (02)", () => {
  it("Try another Google account switches account", async () => {
    const auth = fakeAuth("wrongAccount", "ali.khan@gmail.com");
    renderAt("/wrong-account", auth);
    fireEvent.click(await screen.findByRole("button", { name: /Try another Google account/ }));
    expect(auth.switchAccount).toHaveBeenCalledOnce();
  });

  it("without a known email, uses neutral copy", async () => {
    renderAt("/wrong-account", fakeAuth("signedOut"));
    expect(
      await screen.findByText(/That Google account isn’t a Breakthirty account/),
    ).toBeInTheDocument();
  });
});

describe("sign out", () => {
  it("Settings has Sign out", async () => {
    const auth = fakeAuth("team");
    renderAt("/settings", auth);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
