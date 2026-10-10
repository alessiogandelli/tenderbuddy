import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ArchivePage } from "./pages/ArchivePage";
import { BandoPage } from "./pages/BandoPage";
import { CatalogPage } from "./pages/CatalogPage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <ArchivePage /> },
      { path: "/bandi/:id", element: <BandoPage /> },
      { path: "/catalogo", element: <CatalogPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
