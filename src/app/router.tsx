import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { MorePage } from "../features/more/MorePage";
import { NotFoundPage } from "../features/NotFoundPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PlaceholderPage } from "../features/PlaceholderPage";
import { SocialPage } from "../features/social/SocialPage";
import { AppShell } from "./AppShell";

/**
 * Dev-only routes. `import.meta.env.DEV` is replaced with `false` in production builds, so this
 * array is empty there and the gallery's dynamic import is dropped from the bundle entirely.
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "dev/components",
        // Lazy route: render nothing for the split second while the gallery chunk loads.
        HydrateFallback: () => null,
        lazy: () =>
          import("../features/dev/ComponentsGallery").then((m) => ({
            Component: m.ComponentsGallery,
          })),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "instagram", element: <SocialPage key="instagram" platform="instagram" /> },
      { path: "tiktok", element: <SocialPage key="tiktok" platform="tiktok" /> },
      {
        path: "competitors",
        element: (
          <PlaceholderPage
            title="Competitors"
            slice={8}
            text="Add, edit and remove the brands 30reach tracks. Handles are checked on save."
          />
        ),
      },
      {
        path: "calendar",
        element: (
          <PlaceholderPage
            title="Calendar"
            slice={9}
            text="Plan posts around holidays, health months and marketing dates. Planning only, nothing is posted."
          />
        ),
      },
      {
        path: "ideas",
        element: (
          <PlaceholderPage
            title="Idea board"
            slice={10}
            text="Save screenshots, links, notes and competitor posts, then plan them onto the calendar."
          />
        ),
      },
      {
        path: "settings",
        element: (
          <PlaceholderPage
            title="Settings"
            slice={12}
            text="Team and roles, free-tier usage meters, data export and clearing a pull."
          />
        ),
      },
      { path: "more", element: <MorePage /> },
      ...devRoutes,
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
