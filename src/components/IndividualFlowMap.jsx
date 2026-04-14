import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

const ALL_CLASSES = ["ambulatory", "wellness", "outpatient", "inpatient", "emergency", "urgentcare"];

const CLASS_META = {
  ambulatory: { label: "Ambulatory",  color: "#58a6ff" },
  wellness:   { label: "Wellness",    color: "#3fb950" },
  outpatient: { label: "Outpatient",  color: "#bc8cff" },
  inpatient:  { label: "Inpatient",   color: "#e3b341" },
  emergency:  { label: "Emergency",   color: "#f78166" },
  urgentcare: { label: "Urgent Care", color: "#ffa657" },
};

// Quadratic bezier point at t
function bezierPoint(sx, sy, cpx, cpy, ex, ey, t) {
  const mt = 1 - t;
  return [
    mt * mt * sx + 2 * mt * t * cpx + t * t * ex,
    mt * mt * sy + 2 * mt * t * cpy + t * t * ey,
  ];
}

// Control point perpendicular to midpoint
function controlPoint(sx, sy, ex, ey, curvature = 0.25) {
  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  const dx = ex - sx, dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = len * curvature;
  return [mx - (dy / len) * offset, my + (dx / len) * offset];
}

export default function IndividualFlowMap() {
  const containerRef  = useRef();
  const mapCanvasRef  = useRef();   // static: MA counties
  const lineCanvasRef = useRef();   // static: all lines
  const animCanvasRef = useRef();   // animated: traveling particles
  const rafRef        = useRef();
  const projRef       = useRef();
  const dataRef       = useRef(null);
  const linesRef      = useRef([]);  // projected lines for current filter

  const [activeClasses, setActiveClasses] = useState(new Set(ALL_CLASSES));
  const [animating, setAnimating]         = useState(true);
  const [status, setStatus]               = useState("Loading…");
  const [counts, setCounts]               = useState({});

  // Toggle a class
  const toggle = useCallback((cls) => {
    setActiveClasses(prev => {
      const next = new Set(prev);
      next.has(cls) ? next.delete(cls) : next.add(cls);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setActiveClasses(prev => prev.size === ALL_CLASSES.length ? new Set() : new Set(ALL_CLASSES));
  }, []);

  // ── Load data & draw map once ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [us, flows] = await Promise.all([
          fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json").then(r => r.json()),
          fetch(`${import.meta.env.BASE_URL}data/individual_flows.json`).then(r => r.json()),
        ]);
        if (cancelled) return;
        dataRef.current = { us, flows };

        // Count lines per class
        const c = {};
        ALL_CLASSES.forEach(cls => { c[cls] = (flows[cls] || []).length; });
        setCounts(c);
        setStatus(null);
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${e.message}`);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Draw map layer (only on first load) ──────────────────────────────────
  useEffect(() => {
    if (!dataRef.current || !mapCanvasRef.current) return;
    const { us } = dataRef.current;
    const el  = containerRef.current;
    const W   = el.clientWidth || 820;
    const H   = Math.round(W * 0.6);
    const dpr = window.devicePixelRatio || 1;

    [mapCanvasRef, lineCanvasRef, animCanvasRef].forEach(r => {
      r.current.width  = W * dpr;
      r.current.height = H * dpr;
      r.current.style.width  = `${W}px`;
      r.current.style.height = `${H}px`;
    });

    const maCounties = topojson.feature(us, {
      type: "GeometryCollection",
      geometries: us.objects.counties.geometries.filter(g => g.id.toString().startsWith("25")),
    });

    const proj = d3.geoMercator().fitExtent([[16, 16], [W - 16, H - 16]], maCounties);
    projRef.current = proj;

    const ctx  = mapCanvasRef.current.getContext("2d");
    ctx.scale(dpr, dpr);
    const path = d3.geoPath(proj, ctx);

    ctx.fillStyle   = "#1c2733";
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth   = 0.8;
    maCounties.features.forEach(f => {
      ctx.beginPath();
      path(f);
      ctx.fill();
      ctx.stroke();
    });
  }, [status]); // rerun once data is ready

  // ── Redraw lines layer when filter changes ────────────────────────────────
  useEffect(() => {
    if (!dataRef.current || !projRef.current || !lineCanvasRef.current) return;
    const { flows } = dataRef.current;
    const proj = projRef.current;
    const el   = containerRef.current;
    const W    = el.clientWidth || 820;
    const H    = Math.round(W * 0.6);
    const dpr  = window.devicePixelRatio || 1;
    const ctx  = lineCanvasRef.current.getContext("2d");

    ctx.clearRect(0, 0, W * dpr, H * dpr);

    // Project and store lines for animation
    const projectedLines = [];

    ALL_CLASSES.forEach(cls => {
      if (!activeClasses.has(cls)) return;
      const lines = flows[cls] || [];
      const color = CLASS_META[cls].color;

      // Parse hex to rgb for ctx
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      ctx.strokeStyle = `rgba(${r},${g},${b},0.06)`;
      ctx.lineWidth   = 0.7 * dpr;

      lines.forEach(([plat, plon, olat, olon]) => {
        const [sx, sy] = proj([plon, plat]);
        const [ex, ey] = proj([olon, olat]);
        const [cpx, cpy] = controlPoint(sx, sy, ex, ey, 0.22);

        ctx.beginPath();
        ctx.moveTo(sx * dpr, sy * dpr);
        ctx.quadraticCurveTo(cpx * dpr, cpy * dpr, ex * dpr, ey * dpr);
        ctx.stroke();

        projectedLines.push({ sx, sy, ex, ey, cpx, cpy, color, r, g, b });
      });
    });

    linesRef.current = projectedLines;
  }, [activeClasses, status]);

  // ── Animation loop (traveling particles) ─────────────────────────────────
  useEffect(() => {
    if (!animating || !animCanvasRef.current) return;

    const el  = containerRef.current;
    const W   = (el?.clientWidth || 820);
    const H   = Math.round(W * 0.6);
    const dpr = window.devicePixelRatio || 1;

    // Seed particles from current lines
    let particles = [];
    function seedParticles() {
      const lines = linesRef.current;
      if (!lines.length) return;
      // ~1 particle per 8 lines, capped at 600
      const count = Math.min(Math.round(lines.length / 8), 600);
      particles = Array.from({ length: count }, () => {
        const line = lines[Math.floor(Math.random() * lines.length)];
        return { ...line, t: Math.random(), speed: 0.003 + Math.random() * 0.005 };
      });
    }

    seedParticles();
    let seedTimer = setInterval(seedParticles, 2000);

    const ctx = animCanvasRef.current.getContext("2d");

    function frame() {
      ctx.clearRect(0, 0, W * dpr, H * dpr);

      particles.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) {
          // Respawn on a new random line
          const lines = linesRef.current;
          if (!lines.length) return;
          const line = lines[Math.floor(Math.random() * lines.length)];
          Object.assign(p, { ...line, t: 0, speed: 0.003 + Math.random() * 0.005 });
          return;
        }
        const [px, py] = bezierPoint(p.sx, p.sy, p.cpx, p.cpy, p.ex, p.ey, p.t);
        const alpha = p.t < 0.1 ? p.t / 0.1 : p.t > 0.85 ? (1 - p.t) / 0.15 : 1;
        ctx.beginPath();
        ctx.arc(px * dpr, py * dpr, 1.6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha * 0.9})`;
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(seedTimer);
    };
  }, [animating, activeClasses, status]);

  // Stop animation
  useEffect(() => {
    if (!animating) {
      cancelAnimationFrame(rafRef.current);
      if (animCanvasRef.current) {
        const el  = containerRef.current;
        const W   = el?.clientWidth || 820;
        const H   = Math.round(W * 0.6);
        const dpr = window.devicePixelRatio || 1;
        animCanvasRef.current.getContext("2d").clearRect(0, 0, W * dpr, H * dpr);
      }
    }
  }, [animating]);

  const totalActive = ALL_CLASSES
    .filter(cls => activeClasses.has(cls))
    .reduce((s, cls) => s + (counts[cls] || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>

      {/* Controls */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={toggleAll}
          style={{
            background:   "transparent",
            border:       "1px solid var(--border)",
            color:        "var(--muted)",
            borderRadius: 5,
            padding:      "3px 10px",
            fontSize:     11,
            cursor:       "pointer",
            fontFamily:   "inherit",
          }}
        >
          {activeClasses.size === ALL_CLASSES.length ? "Deselect all" : "Select all"}
        </button>

        {ALL_CLASSES.map(cls => {
          const { label, color } = CLASS_META[cls];
          const active = activeClasses.has(cls);
          return (
            <button
              key={cls}
              onClick={() => toggle(cls)}
              style={{
                background:   active ? color : "transparent",
                border:       `1px solid ${color}`,
                color:        active ? "#fff" : color,
                borderRadius: 5,
                padding:      "3px 10px",
                fontSize:     11,
                cursor:       "pointer",
                fontFamily:   "inherit",
                transition:   "all 0.15s",
              }}
            >
              {label} {counts[cls] ? `(${counts[cls].toLocaleString()})` : ""}
            </button>
          );
        })}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {totalActive.toLocaleString()} flows
          </span>
          <button
            onClick={() => setAnimating(a => !a)}
            style={{
              background:   animating ? "rgba(88,166,255,0.15)" : "transparent",
              border:       "1px solid var(--accent)",
              color:        "var(--accent)",
              borderRadius: 5,
              padding:      "3px 10px",
              fontSize:     11,
              cursor:       "pointer",
              fontFamily:   "inherit",
            }}
          >
            {animating ? "⏸ Pause" : "▶ Animate"}
          </button>
        </div>
      </div>

      {/* Canvas stack */}
      <div ref={containerRef} style={{ position: "relative", width: "100%", borderRadius: 6, overflow: "hidden" }}>
        {status && (
          <div style={{ padding: "3rem", color: "var(--muted)", fontSize: 13 }}>{status}</div>
        )}
        {/* Layers stacked via absolute positioning */}
        <canvas ref={mapCanvasRef}  style={{ display: "block", position: "relative" }} />
        <canvas ref={lineCanvasRef} style={{ display: "block", position: "absolute", top: 0, left: 0 }} />
        <canvas ref={animCanvasRef} style={{ display: "block", position: "absolute", top: 0, left: 0 }} />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}>
        {ALL_CLASSES.map(cls => (
          <div key={cls} style={{ display: "flex", alignItems: "center", gap: 5, opacity: activeClasses.has(cls) ? 1 : 0.3 }}>
            <svg width="20" height="10">
              <path d="M2,9 Q10,1 18,9" fill="none" stroke={CLASS_META[cls].color} strokeWidth="1.5" />
            </svg>
            {CLASS_META[cls].label}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="white" opacity="0.8" /></svg>
          Animated particles travel patient → provider
        </div>
      </div>

    </div>
  );
}
