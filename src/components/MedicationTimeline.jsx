import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Loader from "./Loader";

export default function MedicationTimeline() {
  const ref = useRef();
  const { data, loading, error } = useData("/data/medication_timeline.json");
  const [highlighted, setHighlighted] = useState(null);

  useEffect(() => {
    if (!data) return;
    const el = ref.current;
    if (!el) return;

    const { meds, timeline } = data;
    const W = el.clientWidth || 760;
    const H = 360;
    const margin = { top: 20, right: 20, bottom: 44, left: 56 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const color = d3.scaleOrdinal()
      .domain(meds)
      .range(d3.schemeTableau10);

    const parseMonth = d3.timeParse("%Y-%m");
    const parsed = timeline.map((row) => ({
      ...row,
      date: parseMonth(row.month),
    }));

    // Stack
    const stack = d3.stack()
      .keys(meds)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const series = stack(parsed);

    const x = d3.scaleTime()
      .domain(d3.extent(parsed, (d) => d.date))
      .range([0, w]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1]))])
      .nice()
      .range([h, 0]);

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Gridlines
    g.append("g")
      .call(d3.axisLeft(y).tickSize(-w).tickFormat(""))
      .selectAll("line").attr("stroke", "rgba(255,255,255,0.05)");
    g.select(".domain").remove();

    const area = d3.area()
      .x((d) => x(d.data.date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveCatmullRom);

    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "6px")
      .style("padding", "8px 12px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("line-height", "1.8")
      .style("max-width", "240px");

    // Areas
    g.selectAll(".area")
      .data(series)
      .join("path")
      .attr("class", "area")
      .attr("d", area)
      .attr("fill", (d) => color(d.key))
      .attr("opacity", (d) => highlighted ? (d.key === highlighted ? 1 : 0.15) : 0.82)
      .on("mouseover", function (event, d) {
        setHighlighted(d.key);
        const box = el.getBoundingClientRect();
        // Find closest data point
        const mx = x.invert(d3.pointer(event, g.node())[0]);
        const idx = d3.bisector((r) => r.data.date).center(d, mx);
        const row = d[Math.max(0, Math.min(idx, d.length - 1))];
        tooltip.style("opacity", 1).html(
          `<strong>${d.key}</strong><br/>` +
          `${d3.timeFormat("%b %Y")(row.data.date)}: <strong>${row.data[d.key]}</strong> prescriptions`
        );
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 56}px`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 56}px`);
      })
      .on("mouseout", function () {
        setHighlighted(null);
        tooltip.style("opacity", 0);
        g.selectAll(".area").attr("opacity", 0.82);
      });

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b '%y")))
      .selectAll("text").attr("fill", "var(--muted)").attr("font-size", 11);

    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .selectAll("text").attr("fill", "var(--muted)").attr("font-size", 11);

    g.selectAll(".domain, .tick line").attr("stroke", "var(--border)");

  }, [data, highlighted]);

  if (loading || error) return <Loader error={error} />;

  const meds = data?.meds ?? [];
  const color = d3.scaleOrdinal()
    .domain(meds)
    .range(d3.schemeTableau10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div ref={ref} style={{ position: "relative", width: "100%" }} />

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem" }}>
        {meds.map((m) => (
          <div
            key={m}
            onMouseEnter={() => setHighlighted(m)}
            onMouseLeave={() => setHighlighted(null)}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        6,
              fontSize:   12,
              cursor:     "default",
              opacity:    highlighted && highlighted !== m ? 0.35 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: color(m), flexShrink: 0,
            }} />
            <span style={{ color: "var(--text)" }}>{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
