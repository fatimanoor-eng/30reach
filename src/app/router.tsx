import { createBrowserRouter } from "react-router";
import { HelloPage } from "./HelloPage";

export const router = createBrowserRouter([{ path: "/", element: <HelloPage /> }]);
