import { useState, useEffect } from "react";

const cache = {};
const base  = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/ma-covid-viz"

function resolveUrl(path) {
  // path is like "/data/foo.json" — prepend the Vite base so it works on GitHub Pages
  return `${base}${path}`;
}

export function useData(path) {
  const [data, setData]   = useState(cache[path] ?? null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache[path]) { setData(cache[path]); return; }
    fetch(resolveUrl(path))
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { cache[path] = d; setData(d); })
      .catch((e) => setError(e.message));
  }, [path]);

  return { data, error, loading: !data && !error };
}
