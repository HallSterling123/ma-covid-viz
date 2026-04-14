import { HashRouter, Routes, Route } from "react-router-dom";
import Layout      from "./components/Layout";
import Home        from "./pages/Home";
import ExploreData from "./pages/ExploreData";

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/"        element={<Home />} />
          <Route path="/explore" element={<ExploreData />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
