import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ParametersPage } from "./pages/ParametersPage";
import { PricePage } from "./pages/PricePage";
import { ReviewPage } from "./pages/ReviewPage";
import { TenderPage } from "./pages/TenderPage";
import { UploadPage } from "./pages/UploadPage";

// Deployed under a sub-path (e.g. GitHub Pages `/tenderbuddy/`), the router must
// strip the base from the URL. `VITE_BASE` drives `BASE_URL`; locally it is `/`.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: "/", element: <UploadPage /> },
        {
          path: "/bandi/:id",
          element: <TenderPage />,
          children: [
            { index: true, element: <ReviewPage /> },
            { path: "parameters", element: <ParametersPage /> },
            { path: "price", element: <PricePage /> },
          ],
        },
      ],
    },
  ],
  { basename },
);

export function App() {
  return <RouterProvider router={router} />;
}
