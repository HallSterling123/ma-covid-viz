import { useState, useEffect } from "react";

const cache = {};

export function useData(path) {
  const [data, setData]   = useState(cache[path] ?? null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache[path]) { setData(cache[path]); return; }
    fetch(path)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { cache[path] = d; setData(d); })
      .catch((e) => setError(e.message));
  }, [path]);

  return { data, error, loading: !data && !error };
}
