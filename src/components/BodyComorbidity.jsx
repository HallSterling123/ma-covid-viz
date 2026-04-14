import { useEffect, useRef, useState, useCallback } from "react";
import { useData } from "../hooks/useData";
import styles from "./BodyComorbidity.module.css";

/* ─── Scroll constants ────────────────────────────────────────────────────── */
const SCROLL_VH   = 6.5;
const SPLIT_START = 0.12;
const SPLIT_END   = 0.52;
const LABEL_SHOW  = 0.40;

/* ─── Regions + their organ title-IDs in the EBI anatomogram SVG ─────────── */
const REGIONS = [
  {
    id: "brain",    label: "Mental Health",   color: "#bc8cff",
    titleIds: ["brain", "cerebral_cortex", "temporal_lobe", "hippocampus", "amygdala", "cerebellum"],
  },
  {
    id: "lungs",    label: "Respiratory",     color: "#58a6ff",
    titleIds: ["lung", "bronchus", "trachea", "pleura"],
  },
  {
    id: "heart",    label: "Cardiovascular",  color: "#f78166",
    titleIds: ["heart", "coronary_artery", "atrial_appendage"],
  },
  {
    id: "pancreas", label: "Metabolic",       color: "#e3b341",
    titleIds: ["pancreas", "stomach", "liver", "small_intestine"],
  },
  {
    id: "kidneys",  label: "Renal",           color: "#3fb950",
    titleIds: ["kidney", "renal_cortex", "urinary_bladder"],
  },
  {
    id: "joints",   label: "Musculoskeletal", color: "#94a3b8",
    titleIds: ["skeletal_muscle", "bone", "cartilage"],
  },
];

const REGION_COLOR = Object.fromEntries(REGIONS.map(r => [r.id, r.color]));

function lerp(a, b, t)      { return a + (b - a) * t; }
function clamp(v, lo, hi)   { return Math.max(lo, Math.min(hi, v)); }
function easeInOut(t)       { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

/* ─── Color mixing helpers ─────────────────────────────────────────────────── */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function mixHex(c1, c2, t) {
  const [r1,g1,b1] = hexToRgb(c1);
  const [r2,g2,b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const b = Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

// Maximum observed delta across all regions (metabolic ≈ 0.104, renal ≈ 0.062)
const MAX_OBSERVED_DELTA = 0.11;
// Warm "burden" color — organs shift toward this on the right body
const HEAT_COLOR = "#f87171";

/* ─── Apply organ highlights to an injected SVG container ─────────────────── */
// When baselineData is provided (right body in comparison mode), fill color
// shifts from the system color toward HEAT_COLOR in proportion to how much
// higher the prevalence is vs the baseline (close-distance patients).
function applyOrganColors(container, organData, baselineData = null) {
  // Reset all EFO organ fills first
  const efoLayer = container.querySelector("#LAYER_EFO");
  if (efoLayer) {
    efoLayer.querySelectorAll("path, ellipse, circle, polygon").forEach(el => {
      el.style.fill        = "none";
      el.style.fillOpacity = "0";
      el.style.stroke      = "none";
    });
  }

  REGIONS.forEach(region => {
    const prevalence = organData[region.id]?.prevalence ?? 0;
    const baseline   = baselineData ? (baselineData[region.id]?.prevalence ?? 0) : null;

    // Shift color toward warm red proportional to the delta vs close patients
    let fillColor = region.color;
    if (baseline !== null) {
      const delta = prevalence - baseline;
      const heatT = clamp(delta / MAX_OBSERVED_DELTA, 0, 1);
      fillColor   = mixHex(region.color, HEAT_COLOR, heatT * 0.72);
    }

    const glowOpacity = clamp(prevalence * 1.4, 0.06, 0.85);
    const coreOpacity = clamp(prevalence * 0.9, 0.04, 0.60);

    region.titleIds.forEach(titleId => {
      const titleEl = container.querySelector(`title[id="${titleId}"]`);
      if (!titleEl) return;
      const group = titleEl.parentElement;
      if (!group) return;

      group.style.fill          = fillColor;
      group.style.fillOpacity   = String(glowOpacity);
      group.style.stroke        = fillColor;
      group.style.strokeOpacity = String(glowOpacity * 0.25);
      group.style.strokeWidth   = "0.15";

      group.querySelectorAll("path, ellipse, circle, polygon").forEach(el => {
        el.style.fill          = fillColor;
        el.style.fillOpacity   = String(glowOpacity);
        el.style.stroke        = fillColor;
        el.style.strokeOpacity = String(coreOpacity * 0.3);
      });
    });
  });
}

/* ─── Compute the delta-heat color for a region (for legend dots) ─────────── */
function deltaHeatColor(region, closeData, farData) {
  const delta = (farData[region.id]?.prevalence ?? 0) - (closeData[region.id]?.prevalence ?? 0);
  const heatT = clamp(delta / MAX_OBSERVED_DELTA, 0, 1);
  return mixHex(region.color, HEAT_COLOR, heatT * 0.72);
}

/* ─── Style the body outline for dark background ─────────────────────────── */
function styleOutline(container) {
  const outline = container.querySelector("#human_male_outline");
  if (outline) outline.style.fill = "#1e3048";

  // Hide the EBI licence badge
  const badge = container.querySelector("#a4174");
  if (badge) badge.style.display = "none";

  // Make SVG responsive
  const svgEl = container.querySelector("svg");
  if (svgEl) {
    svgEl.setAttribute("width",  "100%");
    svgEl.setAttribute("height", "100%");
    svgEl.style.overflow = "visible";
  }
}

/* ─── Build interpolated organ data for a given splitT ───────────────────── */
function interpData(data, groupKey, t) {
  return Object.fromEntries(
    REGIONS.map(r => [
      r.id,
      { prevalence: lerp(data.overall[r.id].prevalence, data[groupKey][r.id].prevalence, t) },
    ])
  );
}

/* ─── Body container component ────────────────────────────────────────────── */
function BodyContainer({ containerRef, label, sublabel, opacity = 1, style = {} }) {
  return (
    <div className={styles.bodySlot} style={{ opacity, ...style }}>
      {label && (
        <div className={styles.distLabelAbove}>
          <span className={styles.distLabelTitle}>{label}</span>
          <span className={styles.distLabelSub}>{sublabel}</span>
        </div>
      )}
      <div ref={containerRef} className={styles.svgContainer} />
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function BodyComorbidity() {
  const { data, loading } = useData("/data/body_comorbidity.json");
  const outerRef  = useRef(null);
  const leftRef   = useRef(null);
  const rightRef  = useRef(null);
  const svgText   = useRef(null);
  const injected  = useRef(false);

  const [scrollPct, setScrollPct] = useState(0);
  const [splitT,    setSplitT]    = useState(0);
  const targetT  = useRef(0);
  const currentT = useRef(0);
  const rafRef   = useRef(null);

  /* ── Fetch SVG text once ─────────────────────────────────────────────── */
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/homo_sapiens_male.svg`)
      .then(r => r.text())
      .then(text => { svgText.current = text; });
  }, []);

  /* ── Inject SVG + initial styles once data+svg are both ready ────────── */
  useEffect(() => {
    if (!svgText.current || !data || injected.current) return;
    if (!leftRef.current || !rightRef.current) return;

    const clean = svgText.current.replace(/<\?xml[^>]+\?>/, "");
    leftRef.current.innerHTML  = clean;
    rightRef.current.innerHTML = clean;
    styleOutline(leftRef.current);
    styleOutline(rightRef.current);
    applyOrganColors(leftRef.current,  data.overall);
    applyOrganColors(rightRef.current, data.overall);
    injected.current = true;
  }, [data, svgText.current]);   // eslint-disable-line

  /* ── Update organ colors when splitT changes ─────────────────────────── */
  const updateColors = useCallback((t) => {
    if (!data || !injected.current) return;
    if (!leftRef.current || !rightRef.current) return;

    const eased     = easeInOut(t);
    const closeData = interpData(data, "close", eased);
    const farData   = interpData(data, "far",   eased);

    // Left body: pure system colors (baseline)
    applyOrganColors(leftRef.current, closeData);
    // Right body: delta-heat shift kicks in once the split is underway
    applyOrganColors(rightRef.current, farData, t > 0.05 ? closeData : null);
  }, [data]);

  /* ── Scroll handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onScroll = () => {
      if (!outerRef.current) return;
      const rect  = outerRef.current.getBoundingClientRect();
      const total = outerRef.current.offsetHeight - window.innerHeight;
      const pct   = total > 0 ? clamp(-rect.top, 0, total) / total : 0;
      setScrollPct(pct);
      const raw = clamp((pct - SPLIT_START) / (SPLIT_END - SPLIT_START), 0, 1);
      targetT.current = easeInOut(raw);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Smooth lerp RAF loop ────────────────────────────────────────────── */
  useEffect(() => {
    const animate = () => {
      const cur  = currentT.current;
      const tgt  = targetT.current;
      const next = lerp(cur, tgt, 0.10);
      if (Math.abs(next - cur) > 0.0008) {
        currentT.current = next;
        setSplitT(next);
        updateColors(next);
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateColors]);

  if (loading) return <div style={{ height: `${SCROLL_VH * 100}vh` }} />;

  // Scale the split gap with viewport width so bodies don't overlap or fly off-screen
  const MAX_OFFSET = Math.max(200, window.innerWidth * 0.20);
  const offset     = splitT * MAX_OFFSET;
  const rightOpacity  = clamp(splitT * 5, 0, 1);
  const labelOpacity  = clamp((scrollPct - LABEL_SHOW) / 0.12, 0, 1);
  const legendOpacity = clamp(1 - splitT * 5, 0, 1);
  const diffOpacity   = clamp((scrollPct - 0.65) / 0.12, 0, 1);
  const introOpacity  = clamp(1 - splitT * 3.5, 0, 1);

  const { counts, overall, close, far } = data;

  return (
    <div ref={outerRef} style={{ height: `${SCROLL_VH * 100}vh`, position: "relative" }}>
      <div className={styles.sticky}>

        {/* Background glow */}
        <div className={styles.bgGrad} />

        {/* Intro text (fades as split starts) */}
        <div className={styles.introBlock} style={{ opacity: introOpacity }}>
          <h2 className={styles.introTitle}>The chronic cost of distance</h2>
          <p className={styles.introLead}>
            Far-distance patients were already sicker — before COVID began.
            Scroll to compare their pre-existing conditions to those who lived near care.
          </p>
        </div>

        {/* Bodies */}
        <div className={styles.bodiesWrap}>

          {/* Distance labels above bodies — centered then shifted by same offset as bodies */}
          <div className={styles.distLabel}
            style={{ opacity: labelOpacity, left: "50%", transform: `translateX(calc(-50% + ${-offset}px))` }}>
            <span className={styles.distLabelTitle}>Close-Distance</span>
            <span className={styles.distLabelSub}>≤ 5 mi · n={counts.close.toLocaleString()}</span>
          </div>
          <div className={styles.distLabel}
            style={{ opacity: labelOpacity * rightOpacity, left: "50%", transform: `translateX(calc(-50% + ${offset}px))` }}>
            <span className={styles.distLabelTitle}>Far-Distance</span>
            <span className={styles.distLabelSub}>≥ 15 mi · n={counts.far.toLocaleString()}</span>
          </div>

          {/* Left body */}
          <div
            className={styles.bodySlot}
            style={{ transform: `translateX(${-offset}px)` }}
          >
            <div ref={leftRef} className={styles.svgContainer} />
            {splitT > 0.3 && (
              <div className={styles.organLegend} style={{ opacity: clamp((splitT - 0.35) / 0.25, 0, 1) }}>
                {REGIONS.map(r => (
                  <div key={r.id} className={styles.orgRow}>
                    <span className={styles.orgDot} style={{ background: r.color }} />
                    <span className={styles.orgName}>{r.label}</span>
                    <span className={styles.orgPct} style={{ color: r.color }}>
                      {(close[r.id]?.prevalence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right body */}
          <div
            className={styles.bodySlot}
            style={{ transform: `translateX(${offset}px)`, opacity: rightOpacity }}
          >
            <div ref={rightRef} className={styles.svgContainer} />
            {splitT > 0.3 && (
              <div className={styles.organLegend} style={{ opacity: clamp((splitT - 0.35) / 0.25, 0, 1) }}>
                {REGIONS.map(r => {
                  const delta     = (far[r.id]?.prevalence ?? 0) - (close[r.id]?.prevalence ?? 0);
                  const dotColor  = deltaHeatColor(r, close, far);
                  return (
                    <div key={r.id} className={styles.orgRow}>
                      <span className={styles.orgDot} style={{ background: dotColor }} />
                      <span className={styles.orgName}>{r.label}</span>
                      <span className={styles.orgPct} style={{ color: dotColor }}>
                        {(far[r.id]?.prevalence * 100).toFixed(1)}%
                      </span>
                      {Math.abs(delta) >= 0.005 && (
                        <span className={styles.orgDelta}
                          style={{ color: delta > 0 ? "#f87171" : "#3fb950" }}>
                          {delta > 0 ? "▲" : "▼"}
                          {(Math.abs(delta) * 100).toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className={styles.heatNote}>
                  Color shifts toward red where far-distance patients have higher prevalence
                </div>
              </div>
            )}
          </div>

          {/* vs divider */}
          {splitT > 0.15 && splitT < 0.9 && (
            <div className={styles.vsDivider}
              style={{ opacity: clamp((splitT-0.15)/0.15, 0, 1) * clamp((0.9-splitT)/0.08, 0, 1) }}>
              vs
            </div>
          )}
        </div>

        {/* Combined legend (pre-split) */}
        <div className={styles.combinedLegend} style={{ opacity: legendOpacity }}>
          {REGIONS.map(r => (
            <div key={r.id} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: r.color }} />
              <span className={styles.legendName}>{r.label}</span>
              <span className={styles.legendPct} style={{ color: r.color }}>
                {(overall[r.id]?.prevalence * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>

        {/* Difference panel — vertical rectangle between the two bodies */}
        <div className={styles.diffPanel} style={{ opacity: diffOpacity }}>
          <div className={styles.diffPanelTitle}>Notable differences</div>
          {[...REGIONS]
            .map(r => ({ ...r, delta: (far[r.id]?.prevalence ?? 0) - (close[r.id]?.prevalence ?? 0) }))
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 3)
            .map(r => (
              <div key={r.id} className={styles.diffBadge}>
                <span className={styles.diffLabel} style={{ color: r.color }}>{r.label}</span>
                <span className={styles.diffValue}
                  style={{ color: r.delta > 0 ? "#f78166" : "#3fb950" }}>
                  {r.delta > 0 ? "+" : ""}{(r.delta * 100).toFixed(1)}pp
                </span>
                <span className={styles.diffDesc}>
                  {r.delta > 0 ? "higher" : "lower"} in far-distance
                </span>
              </div>
            ))
          }
          <p className={styles.diffPanelNote}>
            Without nearby care, conditions accumulate undetected for years.
            Long-distance patients arrived at the pandemic already compromised —
            the chronic cost of a care desert made visible.
          </p>
        </div>

        {/* Scroll cue */}
        <div className={styles.scrollCue} style={{ opacity: clamp(1 - scrollPct * 7, 0, 1) }}>
          <span>scroll to compare</span>
          <svg width="14" height="20" viewBox="0 0 14 20">
            <path d="M7 0 L7 16 M3 12 L7 16 L11 12"
              stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* Patient count */}
        <div className={styles.countBadge} style={{ opacity: legendOpacity }}>
          {counts.overall.toLocaleString()} COVID patients · Massachusetts
        </div>

      </div>
    </div>
  );
}
