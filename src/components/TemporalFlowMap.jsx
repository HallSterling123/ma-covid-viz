import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

// ── Constants ──────────────────────────────────────────────────────────────────

const CLASS_META = {
  ambulatory: { label: "Ambulatory",  color: "#58a6ff" },
  wellness:   { label: "Wellness",    color: "#3fb950" },
  outpatient: { label: "Outpatient",  color: "#bc8cff" },
  inpatient:  { label: "Inpatient",   color: "#e3b341" },
  emergency:  { label: "Emergency",   color: "#f78166" },
  urgentcare: { label: "Urgent Care", color: "#ffa657" },
};
const ALL_CLASSES = Object.keys(CLASS_META);
const NON_WELLNESS = ALL_CLASSES.filter(c => c !== "wellness");

// Scroll section heights (in viewport-heights).
// Smaller = lines appear faster.
const SCROLL_VH = {
  m1:            1.6,   // milestone 1 pause
  m1_m2:         1.8,   // first case → surge
  m2:            2.6,   // milestone 2 pause (two-phase)
  m2_m3:         0.7,   // surge → subsides
  m3:            1.6,   // milestone 3 pause
  post_m3:       1.0,   // decline to end
  wellness_only: 2.4,   // post-timeline: wellness-only view
  non_wellness:  2.4,   // post-timeline: non-wellness unified view
};
const TOTAL_SCROLL_VH = Object.values(SCROLL_VH).reduce((a,b)=>a+b, 0);

// Timeline milestones (captions during animation)
const MILESTONES = [
  {
    id:    "m1",
    date:  "2020-01-20",
    color: "#e3b341",
    title: "One patient. An unequal network.",
    body:  "January\u00a020,\u00a02020. The first confirmed COVID-19 case in Massachusetts is detected. The gold lines trace this single patient\u2019s care trips \u2014 while the rest of the network hums with routine activity, its geography already set. By March\u00a030, over 9,000 patients would follow.",
    stats: [["First confirmed case", "Jan\u00a020, 2020"], ["Final case count", "9,106"]],
    effect: "highlight_patient",
  },
  {
    id:    "m2",
    date:  "2020-03-02",
    color: "#ffa657",
    title: "The surge tests every gap.",
    body:  "Amber lines show the prior week of COVID care trips (Feb\u00a024\u2013Mar\u00a01). Keep scrolling to see the following week arrive \u2014 and watch which parts of the network absorb the shock, and which cannot.",
    bodyPhase2: "A 125\u202f% surge in a single week. 17\u202f% of encounters were emergency or inpatient visits \u2014 the care that concentrates in cities, far from many patients. Three in four patients had arrived for an unrelated reason, only to leave with a COVID diagnosis.",
    stats: [["Feb\u00a024\u2013Mar\u00a01", "2,313 encounters"], ["Mar\u00a02\u20138", "5,193\u00a0(+125%)"]],
    effect: "surge_compare",
  },
  {
    id:    "m3",
    date:  "2020-03-22",
    color: "#3fb950",
    title: "Wave 1 ends. The map remains.",
    body:  "A stay-at-home advisory on March\u00a024 breaks the surge. But every line you see is permanent \u2014 a record of who had to travel how far to survive. The geography that shaped those trips did not change when the wave ended.",
    stats: [["Peak week (Mar\u00a02\u20138)", "5,193 encounters"], ["By Mar\u00a022", "\u223c1,200 and falling"]],
    effect: null,
  },
];

// Post-timeline special-view captions
const SPECIAL_SECTIONS = [
  {
    id:        "wellness_only",
    color:     "#3fb950",
    title:     "Routine care reaches most communities.",
    body:      "Wellness visits \u2014 checkups, screenings, preventive appointments \u2014 generate short lines. Nearly every community in Massachusetts had access to this level of care. No county is left dark. The lines are local.",
    stats:     [["Visit type", "Wellness only"], ["Access", "State-wide"]],
    dateLabel: "Wellness Visits",
  },
  {
    id:        "non_wellness",
    color:     "#94a3b8",
    title:     "Intensive care leaves the rest behind.",
    body:      "Emergency, inpatient, and urgent-care visits are different. These lines are long. They converge on Boston, Cambridge, Worcester \u2014 the I-95 corridor. For patients in central and western Massachusetts, a medical emergency means a journey. That journey, as the next section shows, costs lives.",
    stats:     [["Visit types", "Emergency · Inpatient · Urgent"], ["Pattern", "Urban concentration"]],
    dateLabel: "Emergency · Inpatient · Outpatient · Urgent",
  },
];

const ALL_CAPTIONS = [...MILESTONES, ...SPECIAL_SECTIONS];

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function cp(sx, sy, ex, ey, k = 0.22) {
  const mx = (sx+ex)/2, my = (sy+ey)/2;
  const dx = ex-sx,     dy = ey-sy;
  const len = Math.sqrt(dx*dx+dy*dy) || 1;
  return [mx - (dy/len)*len*k, my + (dx/len)*len*k];
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function drawLinesBatch(ctx, lines, strokeStyle, lineWidth, dpr) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth   = lineWidth * dpr;
  ctx.lineCap     = "round";
  lines.forEach(({ sx,sy,ex,ey,cpx,cpy }) => {
    ctx.beginPath();
    ctx.moveTo(sx*dpr, sy*dpr);
    ctx.quadraticCurveTo(cpx*dpr, cpy*dpr, ex*dpr, ey*dpr);
    ctx.stroke();
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TemporalFlowMap() {
  const outerRef      = useRef();
  const mapCanvasRef  = useRef();
  const classCanvases = useRef({});
  const mergedCanvas  = useRef();   // all non-wellness lines in one slate color
  const displayRef    = useRef();
  const effectRef     = useRef();

  const animRef = useRef({
    timeline:  null,
    effects:   null,
    sections:  null,
    drawnUpTo: -1,
    pendingDay: 0,
    startDay:   0,    // first day index to render (= m1Idx)
    proj:       null,
    totalDays:  0,
  });

  const [loaded,          setLoaded]         = useState(false);
  const [status,          setStatus]         = useState("Loading…");
  const [dayLabel,        setDayLabel]       = useState("—");
  const [compositeMode,   setCompositeMode]  = useState("normal");
  const [activeMilestone, setActiveMilestone]= useState(null);
  const [captionOpacity,  setCaptionOpacity] = useState(0);
  const [m2Phase,         setM2Phase]        = useState(1);
  const [scrollPct,       setScrollPct]      = useState(0);
  const [todayCounts,     setTodayCounts]    = useState({});

  const compositeModeRef   = useRef("normal");
  const activeMilestoneRef = useRef(null);
  const m2PhaseRef         = useRef(1);
  const rafRef             = useRef();
  // Cross-fade state for smooth canvas mode transitions
  const fadeRef = useRef({ active: false, from: "normal", to: "normal", t: 0 });

  useEffect(() => { compositeModeRef.current   = compositeMode;   }, [compositeMode]);
  useEffect(() => { activeMilestoneRef.current = activeMilestone; }, [activeMilestone]);
  useEffect(() => { m2PhaseRef.current         = m2Phase;         }, [m2Phase]);

  // ── Canvas sizing helper ─────────────────────────────────────────────────
  const sizeCanvas = useCallback((c) => {
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    c.width  = W * dpr; c.height = H * dpr;
    c.style.width  = `${W}px`; c.style.height = `${H}px`;
  }, []);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [us, raw, fx] = await Promise.all([
          fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json").then(r=>r.json()),
          fetch(`${import.meta.env.BASE_URL}data/ambulatory_temporal.json`).then(r=>r.json()),
          fetch(`${import.meta.env.BASE_URL}data/milestone_effects.json`).then(r=>r.json()),
        ]);
        if (cancelled) return;

        const W   = window.innerWidth;
        const H   = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        [mapCanvasRef, displayRef, effectRef].forEach(r => sizeCanvas(r.current));
        ALL_CLASSES.forEach(cls => sizeCanvas(classCanvases.current[cls]));
        sizeCanvas(mergedCanvas.current);

        const maCounties = topojson.feature(us, {
          type: "GeometryCollection",
          geometries: us.objects.counties.geometries.filter(g => g.id.toString().startsWith("25")),
        });
        const proj = d3.geoMercator().fitExtent([[20,20],[W-20,H-20]], maCounties);
        animRef.current.proj = proj;

        // Draw county base map
        const mapCtx = mapCanvasRef.current.getContext("2d");
        mapCtx.scale(dpr, dpr);
        const path = d3.geoPath(proj, mapCtx);
        maCounties.features.forEach(f => {
          mapCtx.beginPath(); path(f);
          mapCtx.fillStyle = "#1a2332"; mapCtx.fill();
          mapCtx.strokeStyle = "#2d3d50"; mapCtx.lineWidth = 0.8; mapCtx.stroke();
        });

        // Pre-project temporal lines
        const { days } = raw;
        const projected = days.map(day => {
          const entry = { d: day.d };
          ALL_CLASSES.forEach(cls => {
            if (!day[cls]) return;
            entry[cls] = day[cls].map(([plat,plon,olat,olon]) => {
              const [sx,sy] = proj([plon,plat]);
              const [ex,ey] = proj([olon,olat]);
              const [cpx,cpy] = cp(sx,sy,ex,ey);
              return { sx, sy, ex, ey, cpx, cpy };
            });
          });
          return entry;
        });

        // Pre-project effect lines
        const projectArr = arr => arr.map(([plat,plon,olat,olon]) => {
          const [sx,sy] = proj([plon,plat]);
          const [ex,ey] = proj([olon,olat]);
          const [cpx,cpy] = cp(sx,sy,ex,ey);
          return { sx, sy, ex, ey, cpx, cpy };
        });

        const effects = {
          m1: {
            lines: projectArr(fx.m1.lines),
            homes: fx.m1.homes.map(([lat,lon]) => proj([lon,lat])),
          },
          m2: {
            before: { lines: projectArr(fx.m2.before.lines) },
            after:  { lines: projectArr(fx.m2.after.lines)  },
          },
        };

        // Milestone day indices
        const milestoneIdxMap = {};
        MILESTONES.forEach(m => {
          let best = 0;
          projected.forEach((d,i) => { if (d.d <= m.date) best = i; });
          milestoneIdxMap[m.id] = best;
        });

        const m1 = milestoneIdxMap["m1"] ?? 0;
        const m2 = milestoneIdxMap["m2"] ?? 0;
        const m3 = milestoneIdxMap["m3"] ?? 0;
        const total = projected.length;

        const sections = [
          { type: "milestone", id: "m1",           dayIdx: m1,      scrollVh: SCROLL_VH.m1 },
          { type: "anim",      dayRange: [m1, m2],                   scrollVh: SCROLL_VH.m1_m2 },
          { type: "milestone", id: "m2",            dayIdx: m2,      scrollVh: SCROLL_VH.m2, m2PhaseAt: 0.42 },
          { type: "anim",      dayRange: [m2, m3],                   scrollVh: SCROLL_VH.m2_m3 },
          { type: "milestone", id: "m3",            dayIdx: m3,      scrollVh: SCROLL_VH.m3 },
          { type: "anim",      dayRange: [m3, total-1],              scrollVh: SCROLL_VH.post_m3 },
          { type: "special",   id: "wellness_only", dayIdx: total-1, scrollVh: SCROLL_VH.wellness_only },
          { type: "special",   id: "non_wellness",  dayIdx: total-1, scrollVh: SCROLL_VH.non_wellness  },
        ];

        animRef.current.timeline  = projected;
        animRef.current.effects   = effects;
        animRef.current.sections  = sections;
        animRef.current.totalDays = total;
        animRef.current.startDay  = m1;
        animRef.current.drawnUpTo = m1 - 1;
        animRef.current.pendingDay = m1;

        setLoaded(true);
        setStatus(null);
      } catch(e) {
        if (!cancelled) setStatus(`Error: ${e.message}`);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sizeCanvas]);

  // ── Composite (supports cross-fade between modes) ─────────────────────────
  const composite = useCallback((mode, dimmed = false) => {
    const dc = displayRef.current;
    const mc = mapCanvasRef.current;
    if (!dc || !mc) return;
    const ctx = dc.getContext("2d");
    ctx.clearRect(0, 0, dc.width, dc.height);
    ctx.drawImage(mc, 0, 0);

    const drawMode = (m, alpha, dm) => {
      if (alpha <= 0) return;
      ctx.save();
      if (m === "wellness_only") {
        ctx.globalAlpha = alpha;
        const wc = classCanvases.current["wellness"];
        if (wc) ctx.drawImage(wc, 0, 0);
      } else if (m === "non_wellness") {
        ctx.globalAlpha = alpha;
        const nc = mergedCanvas.current;
        if (nc) ctx.drawImage(nc, 0, 0);
      } else {
        ctx.globalAlpha = dm ? alpha * 0.12 : alpha;
        ALL_CLASSES.forEach(cls => {
          const cc = classCanvases.current[cls];
          if (cc) ctx.drawImage(cc, 0, 0);
        });
        if (!dm && effectRef.current) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(effectRef.current, 0, 0);
        }
      }
      ctx.restore();
    };

    const fade = fadeRef.current;
    if (fade.active && fade.from !== fade.to) {
      drawMode(fade.from, 1 - fade.t, dimmed);
      drawMode(fade.to,   fade.t,     dimmed);
    } else {
      drawMode(mode, 1.0, dimmed);
    }
  }, []);

  // ── Effect overlay ────────────────────────────────────────────────────────
  const drawEffect = useCallback((milestoneId, phase) => {
    const ec = effectRef.current;
    const { effects } = animRef.current;
    if (!ec || !effects) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = ec.getContext("2d");
    ctx.clearRect(0, 0, ec.width, ec.height);

    if (milestoneId === "m1") {
      ctx.shadowColor = "#e3b341"; ctx.shadowBlur = 8 * dpr;
      drawLinesBatch(ctx, effects.m1.lines, "rgba(255,220,80,0.9)", 1.5, dpr);
      ctx.shadowBlur = 0;
      effects.m1.homes.forEach(([px,py]) => {
        ctx.beginPath();
        ctx.arc(px*dpr, py*dpr, 5*dpr, 0, Math.PI*2);
        ctx.fillStyle = "#e3b341"; ctx.fill();
        ctx.beginPath();
        ctx.arc(px*dpr, py*dpr, 10*dpr, 0, Math.PI*2);
        ctx.strokeStyle = "rgba(227,179,65,0.5)"; ctx.lineWidth = 1.5*dpr; ctx.stroke();
      });
    }
    if (milestoneId === "m2") {
      ctx.shadowColor = "#ffa657"; ctx.shadowBlur = 6 * dpr;
      drawLinesBatch(ctx, effects.m2.before.lines, "rgba(255,166,87,0.75)", 1.2, dpr);
      ctx.shadowBlur = 0;
      if (phase >= 2) {
        ctx.shadowColor = "#f78166"; ctx.shadowBlur = 8 * dpr;
        drawLinesBatch(ctx, effects.m2.after.lines, "rgba(247,129,102,0.82)", 1.2, dpr);
        ctx.shadowBlur = 0;
      }
    }
  }, []);

  const clearEffect = useCallback(() => {
    const ec = effectRef.current;
    if (ec) ec.getContext("2d").clearRect(0, 0, ec.width, ec.height);
  }, []);

  // ── Draw day lines ────────────────────────────────────────────────────────
  const drawDays = useCallback((fromIdx, toIdx) => {
    const { timeline } = animRef.current;
    if (!timeline) return;
    const dpr = window.devicePixelRatio || 1;
    const ctxMap = {};
    ALL_CLASSES.forEach(cls => {
      const cc = classCanvases.current[cls];
      if (cc) ctxMap[cls] = cc.getContext("2d");
    });
    const mergedCtx = mergedCanvas.current?.getContext("2d");

    for (let i = fromIdx; i <= toIdx; i++) {
      const day = timeline[i];
      if (!day) continue;
      ALL_CLASSES.forEach(cls => {
        const lines = day[cls];
        if (!lines?.length) return;
        const ctx = ctxMap[cls];
        if (!ctx) return;
        const [r,g,b] = hexToRgb(CLASS_META[cls].color);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
        ctx.lineWidth = 0.75 * dpr;
        ctx.lineCap   = "round";
        lines.forEach(({ sx,sy,ex,ey,cpx,cpy }) => {
          ctx.beginPath();
          ctx.moveTo(sx*dpr, sy*dpr);
          ctx.quadraticCurveTo(cpx*dpr, cpy*dpr, ex*dpr, ey*dpr);
          ctx.stroke();
        });
        // Draw non-wellness to merged canvas in unified slate color
        if (cls !== "wellness" && mergedCtx) {
          mergedCtx.strokeStyle = "rgba(148,163,184,0.22)";
          mergedCtx.lineWidth = 0.75 * dpr;
          mergedCtx.lineCap   = "round";
          lines.forEach(({ sx,sy,ex,ey,cpx,cpy }) => {
            mergedCtx.beginPath();
            mergedCtx.moveTo(sx*dpr, sy*dpr);
            mergedCtx.quadraticCurveTo(cpx*dpr, cpy*dpr, ex*dpr, ey*dpr);
            mergedCtx.stroke();
          });
        }
      });
    }
    animRef.current.drawnUpTo = toIdx;
  }, []);

  const clearClassCanvases = useCallback(() => {
    ALL_CLASSES.forEach(cls => {
      const cc = classCanvases.current[cls];
      if (cc) cc.getContext("2d").clearRect(0, 0, cc.width, cc.height);
    });
    const nc = mergedCanvas.current;
    if (nc) nc.getContext("2d").clearRect(0, 0, nc.width, nc.height);
    animRef.current.drawnUpTo = animRef.current.startDay - 1;
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    let lastRenderedDay = animRef.current.startDay - 1;
    let running = true;

    function loop() {
      if (!running) return;
      const { pendingDay, startDay } = animRef.current;
      const mode     = compositeModeRef.current;
      const am       = activeMilestoneRef.current;
      const isDimmed = !!(am?.effect) && mode === "normal";
      const fade     = fadeRef.current;

      // Advance cross-fade every frame
      let needsComposite = false;
      if (fade.active) {
        fade.t = Math.min(1, fade.t + 0.038); // ~26 frames ≈ 0.43 s
        if (fade.t >= 1) { fade.active = false; }
        needsComposite = true;
      }

      if (pendingDay !== lastRenderedDay || needsComposite) {
        if (pendingDay > animRef.current.drawnUpTo) {
          drawDays(animRef.current.drawnUpTo + 1, pendingDay);
        } else if (pendingDay < animRef.current.drawnUpTo) {
          clearClassCanvases();
          if (pendingDay >= startDay) drawDays(startDay, pendingDay);
        }
        lastRenderedDay = pendingDay;
        composite(mode, isDimmed);

        const day = animRef.current.timeline?.[pendingDay];
        if (day) {
          const tc = {};
          ALL_CLASSES.forEach(cls => { tc[cls] = day[cls]?.length ?? 0; });
          setTodayCounts(tc);
          setDayLabel(day.d ?? "—");
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [loaded, drawDays, clearClassCanvases, composite]);

  // Recomposite when mode or milestone changes
  useEffect(() => {
    if (!loaded) return;
    const am   = activeMilestoneRef.current;
    const mode = compositeModeRef.current;
    drawEffect(am?.id ?? null, m2Phase);
    composite(mode, !!(am?.effect) && mode === "normal");
  }, [activeMilestone, m2Phase, compositeMode, drawEffect, composite, loaded]);

  // ── Scroll handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;

    function onScroll() {
      const outer = outerRef.current;
      if (!outer) return;
      const rect     = outer.getBoundingClientRect();
      const scrolled = Math.max(0, -rect.top);
      const total    = rect.height - window.innerHeight;
      if (total <= 0) return;

      const pct = Math.max(0, Math.min(1, scrolled / total));
      setScrollPct(pct);

      const sections = animRef.current.sections;
      if (!sections) return;

      const vhPx = window.innerHeight;
      let remaining = scrolled;
      let newDay = animRef.current.startDay;
      let newMilestone  = null;
      let newMilestoneProg = 0;
      let newM2Phase = 1;
      let newMode    = "normal";

      for (const sec of sections) {
        const secPx = sec.scrollVh * vhPx;
        if (remaining <= secPx) {
          const p = Math.max(0, Math.min(1, remaining / secPx));
          if (sec.type === "anim") {
            const [s, e] = sec.dayRange;
            newDay  = Math.round(s + p * (e - s));
          } else if (sec.type === "milestone") {
            newDay = sec.dayIdx;
            newMilestone     = ALL_CAPTIONS.find(m => m.id === sec.id) ?? null;
            newMilestoneProg = p;
            if (sec.id === "m2") newM2Phase = p > (sec.m2PhaseAt ?? 0.5) ? 2 : 1;
          } else if (sec.type === "special") {
            newDay  = animRef.current.totalDays - 1;
            newMode = sec.id;
            newMilestone     = ALL_CAPTIONS.find(m => m.id === sec.id) ?? null;
            newMilestoneProg = p;
          }
          break;
        }
        remaining -= secPx;
        if (sec.type === "anim") newDay = sec.dayRange[1];
        else newDay = sec.dayIdx ?? animRef.current.totalDays - 1;
      }

      animRef.current.pendingDay = newDay;

      // Caption fade: 0→0.15 fade in, 0.15→0.85 full, 0.85→1 fade out
      const op = newMilestone
        ? Math.min(1, Math.min(newMilestoneProg / 0.15, (1 - newMilestoneProg) / 0.15))
        : 0;
      setCaptionOpacity(op);

      const curId   = activeMilestoneRef.current?.id;
      const curMode = compositeModeRef.current;

      if (newMode !== curMode) {
        // Trigger a smooth canvas cross-fade instead of instant switch
        fadeRef.current = { active: true, from: curMode, to: newMode, t: 0 };
        compositeModeRef.current = newMode;
        setCompositeMode(newMode);
        if (newMode !== "normal") clearEffect();
      }
      if (newMilestone?.id !== curId || newM2Phase !== m2PhaseRef.current) {
        setActiveMilestone(newMilestone ?? null);
        setM2Phase(newM2Phase);
        m2PhaseRef.current = newM2Phase;
        if (!newMilestone?.effect || newMode !== "normal") clearEffect();
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [loaded, clearEffect]);

  // ── Derived display values ────────────────────────────────────────────────
  const captionBody = activeMilestone
    ? (m2Phase === 2 && activeMilestone.bodyPhase2) || activeMilestone.body
    : null;

  // Date label: override for special sections
  const displayDate = compositeMode === "wellness_only"
    ? "Wellness Visits"
    : compositeMode === "non_wellness"
    ? "Emergency · Inpatient · Outpatient · Urgent"
    : dayLabel;

  const totalToday = ALL_CLASSES.reduce((s,c) => s + (todayCounts[c] ?? 0), 0);
  const showCounts = compositeMode === "normal" && totalToday > 0;

  return (
    <div ref={outerRef} style={{ position: "relative", height: `${(TOTAL_SCROLL_VH + 1) * 100}vh` }}>
      {/* Sticky viewport */}
      <div style={{
        position: "sticky", top: 0,
        height: "100vh", overflow: "hidden",
        background: "#0d1117",
      }}>
        {/* Hidden class + merged canvases */}
        <div style={{ display: "none" }}>
          {ALL_CLASSES.map(cls => (
            <canvas key={cls} ref={el => { if (el) classCanvases.current[cls] = el; }} />
          ))}
          <canvas ref={mergedCanvas} />
        </div>

        {/* Canvas layers */}
        <canvas ref={mapCanvasRef} style={{ position: "absolute", top:0, left:0, display:"block" }} />
        <canvas ref={displayRef}   style={{ position: "absolute", top:0, left:0, display:"block" }} />
        <canvas ref={effectRef}    style={{ position: "absolute", top:0, left:0, display:"block", pointerEvents:"none" }} />

        {status && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted)", fontSize:13 }}>
            {status}
          </div>
        )}

        {/* Progress bar + date ─────────────────────────────────────────── */}
        {loaded && (
          <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:10 }}>
            <div style={{ height: 2, background:"rgba(255,255,255,0.06)" }}>
              <div style={{
                height:"100%", width:`${scrollPct*100}%`,
                background: compositeMode === "wellness_only" ? "#3fb950"
                          : compositeMode === "non_wellness"  ? "#94a3b8"
                          : "linear-gradient(to right, #58a6ff, #3fb950)",
                transition:"width 0.05s linear",
              }}/>
              {/* Milestone pips */}
              {animRef.current.sections?.filter(s => s.type==="milestone"||s.type==="special").map(sec => {
                const allSecs = animRef.current.sections;
                const totalVh = allSecs.reduce((a,s)=>a+s.scrollVh,0);
                const offset  = allSecs.slice(0,allSecs.indexOf(sec)).reduce((a,s)=>a+s.scrollVh,0);
                const pct     = ((offset + sec.scrollVh/2) / totalVh) * 100;
                const cap     = ALL_CAPTIONS.find(m => m.id === sec.id);
                return (
                  <div key={sec.id} style={{
                    position:"absolute", top:-3, left:`${pct}%`,
                    width:8, height:8, borderRadius:"50%",
                    background: cap?.color ?? "#fff",
                    transform:"translateX(-50%)",
                    boxShadow:`0 0 6px ${cap?.color ?? "#fff"}`,
                  }}/>
                );
              })}
            </div>
            {/* Date strip */}
            <div style={{
              padding:"8px 16px",
              display:"flex", alignItems:"center", gap:"1rem", flexWrap:"wrap",
              background:"linear-gradient(to bottom,rgba(13,17,23,0.8),transparent)",
            }}>
              <span style={{ fontSize:"1.05rem", fontWeight:700, fontVariantNumeric:"tabular-nums", letterSpacing:"0.03em" }}>
                {displayDate}
              </span>
              {showCounts && ALL_CLASSES.filter(c=>(todayCounts[c]??0)>0).map(cls=>(
                <span key={cls} style={{ fontSize:10, color:CLASS_META[cls].color, fontWeight:600 }}>
                  {CLASS_META[cls].label} {todayCounts[cls]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Right-edge milestone dots */}
        {loaded && (
          <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:6, zIndex:10 }}>
            {ALL_CAPTIONS.map(m => (
              <div key={m.id} title={m.title} style={{
                width:8, height:8, borderRadius:"50%",
                background: activeMilestone?.id===m.id ? m.color : `${m.color}55`,
                boxShadow: activeMilestone?.id===m.id ? `0 0 8px ${m.color}` : "none",
                transition:"all 0.3s",
              }}/>
            ))}
          </div>
        )}

        {/* Milestone / special caption — bottom-left ──────────────────── */}
        {activeMilestone && (
          <div style={{
            position:"absolute", bottom:"14%", left:"3%",
            width:"clamp(260px,34%,370px)",
            background:"rgba(10,14,20,0.94)",
            border:`1px solid ${activeMilestone.color}`,
            borderLeft:`4px solid ${activeMilestone.color}`,
            borderRadius:"6px",
            padding:"0.7rem 1rem",
            boxShadow:`0 0 28px ${activeMilestone.color}22`,
            backdropFilter:"blur(10px)",
            zIndex:30,
            opacity: captionOpacity,
            transform:`translateY(${(1-captionOpacity)*14}px)`,
            transition:"opacity 0.45s ease, transform 0.45s ease",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.45rem", marginBottom:"0.35rem" }}>
              {activeMilestone.date ? (
                <span style={{ fontSize:10, color:activeMilestone.color, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase" }}>
                  {activeMilestone.date}
                </span>
              ) : (
                <span style={{ fontSize:10, color:activeMilestone.color, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase" }}>
                  {compositeMode === "wellness_only" ? "Post-Wave Analysis" : "Geographic Pattern"}
                </span>
              )}
            </div>
            <div style={{ fontSize:"0.82rem", fontWeight:700, color:"var(--text)", marginBottom:"0.3rem", lineHeight:1.35 }}>
              {activeMilestone.title}
            </div>
            <p style={{ fontSize:"0.72rem", color:"var(--muted)", lineHeight:1.7, margin:"0 0 0.55rem 0" }}>
              {captionBody}
            </p>
            <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
              {activeMilestone.stats.map(([label,val]) => (
                <div key={label} style={{
                  background:`${activeMilestone.color}18`,
                  border:`1px solid ${activeMilestone.color}44`,
                  borderRadius:4, padding:"3px 8px",
                }}>
                  <div style={{ fontSize:"0.76rem", fontWeight:700, color:activeMilestone.color }}>{val}</div>
                  <div style={{ fontSize:"0.62rem", color:"var(--muted)" }}>{label}</div>
                </div>
              ))}
            </div>
            {/* m2 phase progress */}
            {activeMilestone.id === "m2" && (
              <div style={{ marginTop:"0.5rem", display:"flex", gap:4 }}>
                <div style={{ flex:1, height:3, borderRadius:2, background: m2Phase>=1 ? "#ffa657" : "rgba(255,166,87,0.2)" }}/>
                <div style={{ flex:1, height:3, borderRadius:2, background: m2Phase>=2 ? "#f78166" : "rgba(247,129,102,0.2)" }}/>
              </div>
            )}
          </div>
        )}

        {/* Scroll cue */}
        {loaded && scrollPct < 0.015 && (
          <div style={{
            position:"absolute", bottom:"8%", left:"50%", transform:"translateX(-50%)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:6,
            opacity: 1 - scrollPct/0.015, pointerEvents:"none", zIndex:20,
          }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)", letterSpacing:"0.12em", textTransform:"uppercase" }}>
              Scroll to explore
            </span>
            <div style={{ animation:"bounce 1.6s ease-in-out infinite" }}>
              <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
                <path d="M7 0v14M2 9l5 7 5-7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        )}

        {/* Legend strip — bottom-left, only in normal mode ─────────────── */}
        {loaded && compositeMode === "normal" && (
          <div style={{
            position:"absolute", bottom:"3%", left:"3%", zIndex:20,
            display:"flex", gap:"0.4rem", flexWrap:"wrap",
          }}>
            {ALL_CLASSES.map(cls => (
              <div key={cls} style={{
                display:"flex", alignItems:"center", gap:5,
                background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)",
                border:`1px solid ${CLASS_META[cls].color}44`,
                borderRadius:4, padding:"2px 8px",
                fontSize:10, color:CLASS_META[cls].color, fontWeight:600,
              }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:CLASS_META[cls].color, flexShrink:0 }}/>
                {CLASS_META[cls].label}
              </div>
            ))}
          </div>
        )}

        {/* Wellness label — bottom-left in wellness_only mode */}
        {loaded && compositeMode === "wellness_only" && (
          <div style={{
            position:"absolute", bottom:"3%", left:"3%", zIndex:20,
            background:"rgba(0,0,0,0.6)", backdropFilter:"blur(10px)",
            border:"1px solid #3fb95044", borderRadius:6, padding:"6px 14px",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:"#3fb950" }}/>
            <span style={{ fontSize:12, color:"#3fb950", fontWeight:700 }}>Wellness Visits Only</span>
          </div>
        )}

        {/* Non-wellness label — bottom-left in non_wellness mode */}
        {loaded && compositeMode === "non_wellness" && (
          <div style={{
            position:"absolute", bottom:"3%", left:"3%", zIndex:20,
            background:"rgba(0,0,0,0.6)", backdropFilter:"blur(10px)",
            border:"1px solid #94a3b844", borderRadius:6, padding:"6px 14px",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:"#94a3b8" }}/>
            <span style={{ fontSize:12, color:"#94a3b8", fontWeight:700 }}>Emergency · Inpatient · Outpatient · Urgent Care</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%,100% { transform:translateY(0); }
          50%      { transform:translateY(6px); }
        }
      `}</style>
    </div>
  );
}
