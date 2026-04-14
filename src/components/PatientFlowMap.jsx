import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

const ALL_CLASSES = ["emergency", "inpatient", "urgentcare", "outpatient", "ambulatory", "wellness"];

const CLASS_COLORS = {
  emergency:  "#f78166",
  inpatient:  "#e3b341",
  urgentcare: "#ffa657",
  outpatient: "#bc8cff",
  ambulatory: "#58a6ff",
  wellness:   "#3fb950",
};

const CLASS_LABELS = {
  emergency:  "Emergency",
  inpatient:  "Inpatient",
  urgentcare: "Urgent Care",
  outpatient: "Outpatient",
  ambulatory: "Ambulatory",
  wellness:   "Wellness",
};

export default function PatientFlowMap() {
  const svgRef      = useRef();
  const containerRef = useRef();
  const [activeClass, setActiveClass] = useState("all");
  const [status, setStatus]           = useState("Loading…");
  const [tooltip, setTooltip]         = useState(null);
  const dataRef     = useRef(null);
  const projRef     = useRef(null);

  // Draw / redraw when filter changes
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!dataRef.current) {
        try {
          const [us, flow, orgs] = await Promise.all([
            fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json").then(r => r.json()),
            fetch(`${import.meta.env.BASE_URL}data/patient_flow.json`).then(r => r.json()),
            fetch(`${import.meta.env.BASE_URL}data/top_orgs.json`).then(r => r.json()),
          ]);
          if (cancelled) return;
          dataRef.current = { us, flow, orgs };
        } catch (e) {
          if (!cancelled) setStatus(`Error: ${e.message}`);
          return;
        }
      }
      if (!cancelled) drawMap(dataRef.current);
    }

    function drawMap({ us, flow, orgs }) {
      const el  = containerRef.current;
      const svg = d3.select(svgRef.current);
      if (!el) return;

      const W = el.clientWidth || 820;
      const H = Math.round(W * 0.6);

      svg.attr("width", W).attr("height", H);
      svg.selectAll("*").remove();

      // ── MA counties ───────────────────────────────────────────────────────
      const maCounties = topojson.feature(us, {
        type: "GeometryCollection",
        geometries: us.objects.counties.geometries.filter(g => g.id.toString().startsWith("25")),
      });

      const projection = d3.geoMercator().fitExtent([[20, 20], [W - 20, H - 20]], maCounties);
      const geoPath    = d3.geoPath().projection(projection);
      projRef.current  = projection;

      svg.append("g")
        .selectAll("path")
        .data(maCounties.features)
        .join("path")
        .attr("d", geoPath)
        .attr("fill", "#1c2733")
        .attr("stroke", "#30363d")
        .attr("stroke-width", 0.8);

      // ── Project centroids ─────────────────────────────────────────────────
      const { centroids, crossFlows } = flow;
      const project = (lat, lon) => projection([lon, lat]);

      // ── Filter flows ──────────────────────────────────────────────────────
      const filteredFlows = crossFlows.map(f => ({
        ...f,
        value: activeClass === "all" ? f.total : (f[activeClass] || 0),
      })).filter(f => f.value > 0);

      if (!filteredFlows.length) {
        svg.append("text")
          .attr("x", W / 2).attr("y", H / 2)
          .attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", 13)
          .text("No cross-county flows for this encounter type");
        setStatus(null);
        return;
      }

      const maxFlow = d3.max(filteredFlows, d => d.value);
      const strokeW = d3.scaleSqrt().domain([1, maxFlow]).range([1, 10]);
      const opacity  = d3.scaleLinear().domain([1, maxFlow]).range([0.25, 0.85]);

      // ── Draw flow arcs ────────────────────────────────────────────────────
      const flowColor = activeClass === "all" ? "var(--accent)" : CLASS_COLORS[activeClass];

      const arcsG = svg.append("g");

      filteredFlows.forEach(f => {
        const srcC = centroids[f.src];
        const dstC = centroids[f.dst];
        if (!srcC || !dstC) return;

        const [sx, sy] = project(srcC.lat, srcC.lon);
        const [dx, dy] = project(dstC.lat, dstC.lon);

        // Quadratic bezier with perpendicular control point
        const mx = (sx + dx) / 2;
        const my = (sy + dy) / 2;
        const dx2 = dx - sx, dy2 = dy - sy;
        const len = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        const curve = Math.min(len * 0.35, 60);
        const cpx = mx - (dy2 / len) * curve;
        const cpy = my + (dx2 / len) * curve;

        const path = `M${sx},${sy} Q${cpx},${cpy} ${dx},${dy}`;

        // Draw glow
        arcsG.append("path")
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", flowColor)
          .attr("stroke-width", strokeW(f.value) + 4)
          .attr("opacity", 0.06);

        // Draw main arc
        const arcEl = arcsG.append("path")
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", flowColor)
          .attr("stroke-width", strokeW(f.value))
          .attr("opacity", opacity(f.value))
          .attr("stroke-linecap", "round")
          .style("cursor", "pointer");

        // Arrowhead
        const t  = 0.88;
        const ax = (1-t)*(1-t)*sx + 2*(1-t)*t*cpx + t*t*dx;
        const ay = (1-t)*(1-t)*sy + 2*(1-t)*t*cpy + t*t*dy;
        const bx = (1-0.92)*(1-0.92)*sx + 2*(1-0.92)*0.92*cpx + 0.92*0.92*dx;
        const by = (1-0.92)*(1-0.92)*sy + 2*(1-0.92)*0.92*cpy + 0.92*0.92*dy;
        const ang = Math.atan2(ax - bx, ay - by);
        const aw  = Math.min(strokeW(f.value) * 2.5, 14);

        arcsG.append("polygon")
          .attr("points", `0,${-aw} ${aw * 0.5},${aw * 0.5} ${-aw * 0.5},${aw * 0.5}`)
          .attr("transform", `translate(${ax},${ay}) rotate(${(ang * 180 / Math.PI)})`)
          .attr("fill", flowColor)
          .attr("opacity", opacity(f.value) + 0.15);

        arcEl
          .on("mouseover", function (event) {
            d3.select(this).attr("opacity", 1).attr("stroke-width", strokeW(f.value) + 2);
            const box = containerRef.current.getBoundingClientRect();
            const rows = activeClass === "all"
              ? ALL_CLASSES.filter(c => f[c] > 0).map(c => `${CLASS_LABELS[c]}: <strong>${f[c]}</strong>`).join("<br/>")
              : `${CLASS_LABELS[activeClass]}: <strong>${f.value}</strong>`;
            setTooltip({
              x: event.clientX - box.left,
              y: event.clientY - box.top,
              html: `<strong>${f.src} → ${f.dst}</strong><br/>${rows}<br/><span style="color:var(--muted);font-size:11px">Total: ${f.total}</span>`,
            });
          })
          .on("mousemove", function (event) {
            const box = containerRef.current.getBoundingClientRect();
            setTooltip(t => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : null);
          })
          .on("mouseout", function () {
            d3.select(this).attr("opacity", opacity(f.value)).attr("stroke-width", strokeW(f.value));
            setTooltip(null);
          });
      });

      // ── Top treatment orgs ────────────────────────────────────────────────
      const orgValue = o => activeClass === "all" ? o.total : (o[activeClass] || 0);
      const filteredOrgs = orgs.filter(o => orgValue(o) > 0);
      const maxOrg = d3.max(filteredOrgs, orgValue) || 1;
      const orgR   = d3.scaleSqrt().domain([1, maxOrg]).range([3, 14]);

      svg.append("g")
        .selectAll("circle.org")
        .data(filteredOrgs)
        .join("circle")
        .attr("class", "org")
        .attr("cx", d => project(d.lat, d.lon)[0])
        .attr("cy", d => project(d.lat, d.lon)[1])
        .attr("r",  d => orgR(orgValue(d)))
        .attr("fill", "#fff")
        .attr("opacity", 0.18)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
          d3.select(this).attr("opacity", 0.9);
          const box = containerRef.current.getBoundingClientRect();
          setTooltip({
            x: event.clientX - box.left,
            y: event.clientY - box.top,
            html: `<strong>${d.name}</strong><br/>${d.county} County<br/>COVID visits: <strong>${orgValue(d)}</strong>`,
          });
        })
        .on("mousemove", function (event) {
          const box = containerRef.current.getBoundingClientRect();
          setTooltip(t => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : null);
        })
        .on("mouseout", function () {
          d3.select(this).attr("opacity", 0.18);
          setTooltip(null);
        });

      // ── County centroid circles ───────────────────────────────────────────
      const maxPat = d3.max(Object.values(centroids), c => c.patients) || 1;
      const cenR   = d3.scaleSqrt().domain([1, maxPat]).range([5, 18]);

      const centG = svg.append("g");

      Object.entries(centroids).forEach(([name, c]) => {
        const [cx, cy] = project(c.lat, c.lon);
        const r = cenR(c.patients);

        centG.append("circle")
          .attr("cx", cx).attr("cy", cy).attr("r", r)
          .attr("fill", "var(--covid)")
          .attr("opacity", 0.75)
          .attr("stroke", "#0d1117")
          .attr("stroke-width", 1.5)
          .style("cursor", "pointer")
          .on("mouseover", function (event) {
            d3.select(this).attr("opacity", 1);
            const box = containerRef.current.getBoundingClientRect();
            // Sum inbound and outbound for this county
            const outbound = filteredFlows.filter(f => f.src === name).reduce((s, f) => s + f.value, 0);
            const inbound  = filteredFlows.filter(f => f.dst === name).reduce((s, f) => s + f.value, 0);
            setTooltip({
              x: event.clientX - box.left,
              y: event.clientY - box.top,
              html: `<strong>${name} County</strong><br/>Patients: <strong>${c.patients.toLocaleString()}</strong><br/>` +
                    `Seeking care outside: <strong>${outbound.toLocaleString()}</strong><br/>` +
                    `Receiving outside patients: <strong>${inbound.toLocaleString()}</strong>`,
            });
          })
          .on("mousemove", function (event) {
            const box = containerRef.current.getBoundingClientRect();
            setTooltip(t => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : null);
          })
          .on("mouseout", function () {
            d3.select(this).attr("opacity", 0.75);
            setTooltip(null);
          });

        centG.append("text")
          .attr("x", cx).attr("y", cy - r - 4)
          .attr("text-anchor", "middle")
          .attr("fill", "var(--text)")
          .attr("font-size", 9.5)
          .attr("pointer-events", "none")
          .text(name);
      });

      // ── Legend: arc scale ─────────────────────────────────────────────────
      const legG = svg.append("g").attr("transform", `translate(${W - 130},${H - 90})`);
      legG.append("text").attr("fill", "var(--muted)").attr("font-size", 9.5).attr("dy", 0).text("Arc width = flow volume");
      [1, Math.round(maxFlow / 2), maxFlow].forEach((v, i) => {
        const y = 16 + i * 18;
        legG.append("line").attr("x1", 0).attr("x2", 40).attr("y1", y).attr("y2", y)
          .attr("stroke", flowColor).attr("stroke-width", strokeW(v)).attr("stroke-linecap", "round");
        legG.append("text").attr("x", 46).attr("y", y + 4)
          .attr("fill", "var(--muted)").attr("font-size", 9).text(v.toLocaleString());
      });

      setStatus(null);
    }

    init();
    return () => { cancelled = true; };
  }, [activeClass]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Filter controls */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }}>Encounter type:</span>
        {["all", ...ALL_CLASSES].map(cls => (
          <button
            key={cls}
            onClick={() => setActiveClass(cls)}
            style={{
              background:   activeClass === cls ? (cls === "all" ? "var(--accent)" : CLASS_COLORS[cls]) : "transparent",
              border:       `1px solid ${cls === "all" ? "var(--accent)" : CLASS_COLORS[cls]}`,
              color:        activeClass === cls ? "#fff" : (cls === "all" ? "var(--accent)" : CLASS_COLORS[cls]),
              borderRadius: 5,
              padding:      "3px 10px",
              fontSize:     11,
              cursor:       "pointer",
              fontFamily:   "inherit",
              transition:   "all 0.15s",
            }}
          >
            {cls === "all" ? "All" : CLASS_LABELS[cls]}
          </button>
        ))}
      </div>

      {/* Map */}
      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        {status && (
          <div style={{ padding: "3rem", color: "var(--muted)", fontSize: 13 }}>{status}</div>
        )}
        <svg ref={svgRef} style={{ display: "block", width: "100%" }} />

        {tooltip && (
          <div style={{
            position:      "absolute",
            left:          tooltip.x + 14,
            top:           tooltip.y - 10,
            background:    "var(--surface)",
            border:        "1px solid var(--border)",
            borderRadius:  6,
            padding:       "8px 12px",
            fontSize:      12,
            pointerEvents: "none",
            lineHeight:    1.75,
            zIndex:        20,
            maxWidth:      220,
          }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />
        )}
      </div>

      {/* Legend: symbol types */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="var(--covid)" opacity="0.75" /></svg>
          County centroid (sized by patient count)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="white" opacity="0.4" /></svg>
          Treatment facility (sized by COVID visits)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="28" height="14">
            <path d="M2,12 Q14,2 26,12" fill="none" stroke="var(--accent)" strokeWidth="2" />
          </svg>
          Cross-county patient flow (arrows show direction)
        </div>
      </div>
    </div>
  );
}
