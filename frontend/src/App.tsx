import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ParametersPage } from "./pages/ParametersPage";
import { PricePage } from "./pages/PricePage";
import { ReviewPage } from "./pages/ReviewPage";
import { TenderPage } from "./pages/TenderPage";
import { UploadPage } from "./pages/UploadPage";

const router = createBrowserRouter([
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
]);

export function App() {
  return <RouterProvider router={router} />;
}
