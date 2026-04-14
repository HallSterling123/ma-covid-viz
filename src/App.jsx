import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout      from "./components/Layout";
import Home        from "./pages/Home";
import ExploreData from "./pages/ExploreData";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"        element={<Home />} />
          <Route path="/explore" element={<ExploreData />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
