import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";

const INS_KEYS   = ["no_insurance", "private", "public"];
const INS_COLORS = { public: "#3fb950", private: "#58a6ff", no_insurance: "#f78166" };
const INS_LABELS = {
  public:       "Public (Medicare / Medicaid)",
  private:      "Private (commercial)",
  no_insurance: "No Insurance",
};

// Scroll fractions (out of total 1.0) for phase boundaries
const P1_END   = 0.28;   // 0→P1_END:  phase 1 held
const P2_START = 0.68;   // P1_END→P2_START: transition
const P2_END   = 1.0;    // P2_START→1: phase 2 held

// Story text for each step
const STEPS = [
  {
    kicker: "The acute cost of distance",
    heading: "Closer care meant better odds of survival.",
    body:    "Among COVID patients who required emergency care, those who lived near a provider were more likely to survive. Each bar below represents a distance bracket \u2014 and the pattern is consistent: as distance grows, survival falls. This is the acute cost of living in a care desert.",
    note:    "Bars show overall survival rate per distance group. Scroll to break down by insurance.",
  },
  {
    kicker:  "Accounting for coverage\u2026",
    heading: "Could insurance explain the gap?",
    body:    "Each bar is now splitting by insurance type \u2014 publicly insured, privately insured, and uninsured. If coverage were the primary driver, we would expect insurance groups to diverge strongly within the same distance bracket.",
    note:    null,
  },
  {
    kicker:  "Geography trumps insurance",
    heading: "No coverage type could close the distance gap.",
    body:    "Publicly insured, privately insured, and uninsured patients all showed the same downward trend as distance increased. Insurance softens the blow \u2014 but it does not eliminate it. Where you live, not just how you\u2019re covered, determines whether you survive.",
    note:    "Hover any bar for patient counts.",
  },
];

function insRate(d, key) {
  const s = d[`${key}_survived`];
  const t = s + d[`${key}_died`];
  return t > 0 ? (s / t) * 100 : null;
}

// Scroll-driven total: outer div = (SCROLL_VH + 1) × 100vh
const SCROLL_VH = 4.5;

export default function TravelSurvivalAnim() {
  const { data, loading, error } = useData("/data/travel_survival.json");

  const outerRef    = useRef();
  const svgRef      = useRef();
  const chartRef    = useRef();   // { bars, p1Labels, p2Labels, legend, barData }
  const currentZone = useRef(0);  // 0 = phase1, 1 = phase2 (threshold-triggered)
  const [loaded,    setLoaded]    = useState(false);
  const [step,      setStep]      = useState(0);   // 0 | 1 | 2  (for text only)
  const [scrollPct, setScrollPct] = useState(0);

  // ── Build SVG once data arrives ─────────────────────────────────────────
  useEffect(() => {
    if (!data?.length) return;
    const bins = data.filter(d => d.total > 0);
    if (!bins.length) return;

    const el      = svgRef.current;
    const W       = el.clientWidth || 680;
    const margin  = { top: 48, right: 24, bottom: 70, left: 58 };
    const H       = 360;
    const w       = W - margin.left - margin.right;
    const h       = H - margin.top  - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleLinear().domain([50, 100]).range([h, 0]).clamp(true);

    // Grid
    g.append("g").call(
      d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat("")
    ).call(ax => {
      ax.select(".domain").remove();
      ax.selectAll(".tick line").attr("stroke","var(--border)").attr("stroke-dasharray","3,3").attr("opacity",0.5);
    });

    // X axis
    const xBinStep = w / bins.length;
    const xAxisG = g.append("g").attr("transform", `translate(0,${h})`);
    xAxisG.append("line").attr("x2", w).attr("stroke", "var(--border)");
    bins.forEach((d, i) => {
      xAxisG.append("text").attr("x", i*xBinStep+xBinStep/2).attr("y", 22).attr("text-anchor","middle").attr("fill","var(--text)").attr("font-size",11.5).text(d.bin);
      xAxisG.append("text").attr("x", i*xBinStep+xBinStep/2).attr("y", 36).attr("text-anchor","middle").attr("fill","var(--muted)").attr("font-size",9.5).text(`n=${d.total.toLocaleString()}`);
    });

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}%`))
      .call(ax => {
        ax.select(".domain").attr("stroke","var(--border)");
        ax.selectAll("text").attr("fill","var(--muted)").attr("font-size",10);
        ax.selectAll(".tick line").remove();
      });

    svg.append("text").attr("transform","rotate(-90)").attr("x",-(margin.top+h/2)).attr("y",15)
      .attr("text-anchor","middle").attr("fill","var(--muted)").attr("font-size",11).text("Survival Rate (%)");
    svg.append("text").attr("x",margin.left+w/2).attr("y",H-4)
      .attr("text-anchor","middle").attr("fill","var(--muted)").attr("font-size",11).text("Max Distance Travelled to Healthcare Facility");

    // Bar geometry for both phases
    const outerPadFrac = 0.24;
    const innerPadFrac = 0.10;
    const p2GroupW  = xBinStep * (1 - outerPadFrac);
    const p2GroupOff= (xBinStep - p2GroupW) / 2;
    const p2BarStep = p2GroupW / INS_KEYS.length;
    const p2BarW    = p2BarStep * (1 - innerPadFrac);
    const p2BarOff  = (p2BarStep - p2BarW) / 2;
    const p1BarW    = xBinStep / INS_KEYS.length;

    const barData = bins.flatMap((bin, i) =>
      INS_KEYS.map((key, j) => {
        const rate2 = insRate(bin, key) ?? bin.survival_rate;
        return {
          bin, i, j, key,
          x1: i*xBinStep + j*p1BarW,            w1: p1BarW,
          y1: y(bin.survival_rate),              h1: h - y(bin.survival_rate),
          fill1: "#6e7681",
          x2: i*xBinStep + p2GroupOff + j*p2BarStep + p2BarOff,  w2: p2BarW,
          y2: y(rate2),                          h2: h - y(rate2),
          fill2: INS_COLORS[key],
        };
      })
    );

    // Tooltip
    const tooltip = d3.select(el.parentElement)
      .selectAll(".ts-tooltip").data([1]).join("div")
      .attr("class","ts-tooltip")
      .style("position","absolute").style("background","var(--surface)")
      .style("border","1px solid var(--border)").style("border-radius","8px")
      .style("padding","10px 13px").style("font-size","12px")
      .style("pointer-events","none").style("opacity",0)
      .style("line-height","1.8").style("min-width","185px").style("z-index",10);

    // Draw bars at phase-1 positions
    const bars = g.selectAll(".bar").data(barData).join("rect")
      .attr("class","bar")
      .attr("x",      d => d.x1).attr("width",  d => d.w1)
      .attr("y",      d => d.y1).attr("height", d => d.h1)
      .attr("fill",   d => d.fill1).attr("opacity", 0.88)
      .on("mousemove", (event, d) => {
        const t = parseFloat(d3.select(event.currentTarget).attr("data-t") || 0);
        const box = el.parentElement.getBoundingClientRect();
        if (t > 0.5) {
          const rate  = insRate(d.bin, d.key);
          const total = d.bin[`${d.key}_survived`] + d.bin[`${d.key}_died`];
          tooltip.style("opacity",1).html(
            `<strong style="color:${INS_COLORS[d.key]}">${INS_LABELS[d.key]}</strong><br/>` +
            `Distance: <strong style="color:var(--text)">${d.bin.bin}</strong><br/>` +
            `Survival: <strong>${rate != null ? rate.toFixed(1)+"%" : "—"}</strong><br/>` +
            `Survived: ${d.bin[`${d.key}_survived`].toLocaleString()}<br/>` +
            `Died: ${d.bin[`${d.key}_died`].toLocaleString()}<br/>` +
            `Patients: ${total.toLocaleString()}`
          ).style("left",`${event.clientX-box.left+14}px`).style("top",`${event.clientY-box.top-70}px`);
        } else {
          tooltip.style("opacity",1).html(
            `<strong>${d.bin.bin}</strong><br/>` +
            `Overall survival: <strong>${d.bin.survival_rate}%</strong><br/>` +
            `Patients: ${d.bin.total.toLocaleString()}`
          ).style("left",`${event.clientX-box.left+14}px`).style("top",`${event.clientY-box.top-60}px`);
        }
      })
      .on("mouseout", () => tooltip.style("opacity",0));

    // Phase-1 overall labels (one per bin, centered)
    const p1Labels = g.selectAll(".p1-label").data(bins).join("text")
      .attr("class","p1-label")
      .attr("x", (d,i) => i*xBinStep + xBinStep/2)
      .attr("y", d => y(d.survival_rate) - 8)
      .attr("text-anchor","middle").attr("font-size",11).attr("font-weight",700)
      .attr("fill","var(--text)").attr("opacity",1)
      .text(d => `${d.survival_rate}%`);

    // Phase-2 per-bar value labels (hidden initially)
    const p2Labels = g.selectAll(".p2-label").data(barData).join("text")
      .attr("class","p2-label")
      .attr("x", d => d.x2 + d.w2/2).attr("y", d => d.y2 - 5)
      .attr("text-anchor","middle").attr("font-size",8.5).attr("font-weight",600)
      .attr("fill", d => d.fill2).attr("opacity",0)
      .text(d => {
        const r = insRate(d.bin, d.key);
        return r != null ? `${r.toFixed(0)}%` : "";
      });

    // Legend (hidden initially)
    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top - 30})`)
      .attr("opacity", 0);
    INS_KEYS.forEach((key,i) => {
      const lg = legend.append("g").attr("transform",`translate(${i*190},0)`);
      lg.append("rect").attr("width",11).attr("height",11).attr("rx",2).attr("fill",INS_COLORS[key]).attr("opacity",0.85).attr("y",-1);
      lg.append("text").attr("x",15).attr("y",9.5).attr("fill","var(--text)").attr("font-size",11.5).text(INS_LABELS[key]);
    });

    chartRef.current = { bars, p1Labels, p2Labels, legend, barData };
    setLoaded(true);

    return () => {
      d3.select(el.parentElement).selectAll(".ts-tooltip").remove();
    };
  }, [data]);

  // ── Zone-triggered D3 transitions ─────────────────────────────────────────
  const fireTransition = useCallback((toZone) => {
    if (!chartRef.current) return;
    const { bars, p1Labels, p2Labels, legend } = chartRef.current;

    if (toZone === 1 && currentZone.current === 0) {
      currentZone.current = 1;
      const dur = 980;
      bars.interrupt("morph")
        .transition("morph").duration(dur).ease(d3.easeCubicInOut)
        .attr("x",      d => d.x2).attr("width",  d => d.w2)
        .attr("y",      d => d.y2).attr("height", d => d.h2)
        .attr("fill",   d => d.fill2)
        .attr("data-t", 1);
      p1Labels.interrupt()
        .transition().duration(320).attr("opacity", 0);
      p2Labels.interrupt()
        .transition("show").duration(dur * 0.55).delay(dur * 0.45)
        .attr("opacity", 1)
        .attr("x", d => d.x2 + d.w2 / 2)
        .attr("y", d => d.y2 - 5);
      legend.interrupt()
        .transition().duration(dur * 0.5).delay(dur * 0.45).attr("opacity", 1);
      setStep(2);
    } else if (toZone === 0 && currentZone.current === 1) {
      currentZone.current = 0;
      const dur = 680;
      bars.interrupt("morph")
        .transition("morph").duration(dur).ease(d3.easeCubicInOut)
        .attr("x",      d => d.x1).attr("width",  d => d.w1)
        .attr("y",      d => d.y1).attr("height", d => d.h1)
        .attr("fill",   d => d.fill1)
        .attr("data-t", 0);
      p1Labels.interrupt()
        .transition().duration(380).delay(dur * 0.4).attr("opacity", 1);
      p2Labels.interrupt()
        .transition().duration(280).attr("opacity", 0);
      legend.interrupt()
        .transition().duration(280).attr("opacity", 0);
      setStep(0);
    }
  }, []);

  // ── Scroll handler — threshold-triggered only ─────────────────────────────
  useEffect(() => {
    if (!loaded) return;

    const onScroll = () => {
      const outer = outerRef.current;
      if (!outer) return;
      const rect     = outer.getBoundingClientRect();
      const scrolled = Math.max(0, -rect.top);
      const total    = rect.height - window.innerHeight;
      if (total <= 0) return;

      const pct = Math.max(0, Math.min(1, scrolled / total));
      setScrollPct(pct);

      // Update text step (drives text crossfade via CSS)
      const newStep = pct < P1_END ? 0 : pct > P2_START ? 2 : 1;
      setStep(prev => prev !== newStep ? newStep : prev);

      // Trigger zone crossing → fixed-duration D3 transition
      const newZone = pct < P1_END ? 0 : 1;
      if (newZone !== currentZone.current) fireTransition(newZone);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [loaded, fireTransition]);

  if (error) return null;

  const step0 = STEPS[0];
  const step2 = STEPS[2];
  // CSS-transition driven by step state (not raw scroll position)
  const s0Opacity = step <= 1 ? 1 : 0;
  const s2Opacity = step >= 2 ? 1 : 0;

  return (
    <div ref={outerRef} style={{ position: "relative", height: `${(SCROLL_VH + 1) * 100}vh` }}>
      {/* Sticky panel */}
      <div style={{
        position:   "sticky",
        top:        0,
        height:     "100vh",
        display:    "flex",
        alignItems: "center",
        background: "#0d1117",
        overflow:   "hidden",
      }}>
        {/* Progress bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "rgba(255,255,255,0.06)",
        }}>
          <div style={{
            height: "100%", width: `${scrollPct * 100}%`,
            background: "linear-gradient(to right, #3fb950, #58a6ff)",
            transition: "width 0.05s linear",
          }} />
        </div>

        {/* Left story panel */}
        <div style={{
          width:     "clamp(220px, 30%, 340px)",
          flexShrink: 0,
          padding:   "0 3vw 0 5vw",
          position:  "relative",
        }}>
          <p style={{
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--accent)", marginBottom: "0.6rem",
          }}>
            Visualization 02
          </p>
          <h2 style={{
            fontSize: "clamp(1.1rem, 2vw, 1.6rem)", fontWeight: 800,
            lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: "1rem",
          }}>
            How far did patients travel — and did they survive?
          </h2>

          {/* Step 0 text — fades out during transition */}
          <div style={{ position: "relative" }}>
            <div style={{ opacity: s0Opacity, transition: "opacity 0.55s ease", pointerEvents: s0Opacity < 0.1 ? "none" : "auto" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>
                {step0.kicker}
              </p>
              <p style={{ fontSize: "clamp(0.85rem, 1.4vw, 1rem)", fontWeight: 700, lineHeight: 1.4, marginBottom: "0.75rem" }}>
                {step0.heading}
              </p>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.75, marginBottom: "0.75rem" }}>
                {step0.body}
              </p>
              {step0.note && (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", fontStyle: "italic", lineHeight: 1.6 }}>
                  {step0.note}
                </p>
              )}
            </div>

            {/* Step 2 text — fades in after transition */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              opacity: s2Opacity, transition: "opacity 0.55s ease",
              pointerEvents: s2Opacity < 0.1 ? "none" : "auto",
            }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: "0.5rem" }}>
                {step2.kicker}
              </p>
              <p style={{ fontSize: "clamp(0.85rem, 1.4vw, 1rem)", fontWeight: 700, lineHeight: 1.4, marginBottom: "0.75rem" }}>
                {step2.heading}
              </p>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.75, marginBottom: "0.75rem" }}>
                {step2.body}
              </p>
              {step2.note && (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", fontStyle: "italic", lineHeight: 1.6 }}>
                  {step2.note}
                </p>
              )}
            </div>
          </div>

          {/* Scroll cue — only visible in step 0 */}
          {scrollPct < P1_END && (
            <div style={{
              marginTop: "2rem", display: "flex", alignItems: "center", gap: "0.5rem",
              fontSize: "0.7rem", color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em",
              textTransform: "uppercase", animation: "scrollCue 2s ease-in-out infinite",
            }}>
              <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
                <path d="M5 0v9M1 5.5l4 6 4-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Scroll to reveal
            </div>
          )}
        </div>

        {/* Right chart panel */}
        <div style={{
          flex: 1,
          padding:  "0 3vw 0 1vw",
          position: "relative",
          overflow: "visible",
        }}>
          {loading ? (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "2rem" }}>Loading…</div>
          ) : (
            <div style={{ position: "relative" }}>
              <svg ref={svgRef} style={{ width: "100%", display: "block" }} />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scrollCue {
          0%,100% { opacity: 0.25; transform: translateY(0); }
          50%      { opacity: 0.5;  transform: translateY(3px); }
        }
      `}</style>
    </div>
  );
}
