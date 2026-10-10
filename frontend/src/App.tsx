import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/bandi/:id", element: <WorkbenchPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
