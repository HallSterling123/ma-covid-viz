import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { hexbin as d3Hexbin } from "d3-hexbin";
import * as topojson from "topojson-client";

const MA_FIPS = "25"; // Massachusetts state FIPS code

export default function HexbinMap() {
  const ref        = useRef();
  const [tooltip, setTooltip] = useState(null);
  const [status, setStatus]   = useState("Loading map…");

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      try {
        const [us, raw] = await Promise.all([
          fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json").then(r => r.json()),
          fetch("/data/covid_locations.json").then(r => r.json()),
        ]);
        if (cancelled) return;

        const el = ref.current;
        if (!el) return;

        const W = el.clientWidth || 800;
        const H = Math.round(W * 0.58);

        d3.select(el).selectAll("*").remove();

        const svg = d3.select(el)
          .append("svg")
          .attr("width", W)
          .attr("height", H)
          .style("background", "var(--bg)");

        // ── MA counties ──────────────────────────────────────────────────────
        const maCounties = topojson.feature(us, {
          type: "GeometryCollection",
          geometries: us.objects.counties.geometries.filter(
            (g) => g.id.toString().startsWith(MA_FIPS)
          ),
        });

        const projection = d3.geoMercator().fitSize([W, H], maCounties);
        const path       = d3.geoPath().projection(projection);

        svg.append("g")
          .selectAll("path")
          .data(maCounties.features)
          .join("path")
          .attr("d", path)
          .attr("fill", "#1c2733")
          .attr("stroke", "#30363d")
          .attr("stroke-width", 0.8);

        // ── Project patient points ────────────────────────────────────────────
        const pts = raw
          .map((d) => {
            const [x, y] = projection([d.lon, d.lat]);
            return { x, y, died: d.died };
          })
          .filter((d) => d.x >= 0 && d.x <= W && d.y >= 0 && d.y <= H);

        // ── Hexbin ────────────────────────────────────────────────────────────
        const hexRadius = Math.max(8, Math.round(W / 80));
        const hexbinGen = d3Hexbin()
          .x((d) => d.x)
          .y((d) => d.y)
          .radius(hexRadius)
          .extent([[0, 0], [W, H]]);

        const bins = hexbinGen(pts);

        const maxCount = d3.max(bins, (b) => b.length) || 1;
        const maxDeath = d3.max(bins, (b) => d3.sum(b, (d) => d.died)) || 1;

        // Size = case count
        const rScale = d3.scaleSqrt().domain([1, maxCount]).range([hexRadius * 0.35, hexRadius * 1.05]);
        // Color = death rate (deaths / count)
        const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

        const g = svg.append("g");

        g.selectAll("path.hex")
          .data(bins)
          .join("path")
          .attr("class", "hex")
          .attr("d", (b) => hexbinGen.hexagon(rScale(b.length)))
          .attr("transform", (b) => `translate(${b.x},${b.y})`)
          .attr("fill", (b) => {
            const deaths = d3.sum(b, (d) => d.died);
            return colorScale(deaths / b.length);
          })
          .attr("stroke", "#0d1117")
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.88)
          .on("mouseover", function (event, b) {
            d3.select(this).attr("opacity", 1).attr("stroke-width", 1.5).attr("stroke", "#fff");
            const deaths = d3.sum(b, (d) => d.died);
            const box    = el.getBoundingClientRect();
            setTooltip({
              x:       event.clientX - box.left,
              y:       event.clientY - box.top,
              cases:   b.length,
              deaths,
              rate:    ((deaths / b.length) * 100).toFixed(1),
            });
          })
          .on("mousemove", function (event) {
            const box = el.getBoundingClientRect();
            setTooltip((t) => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : null);
          })
          .on("mouseout", function () {
            d3.select(this).attr("opacity", 0.88).attr("stroke-width", 0.5).attr("stroke", "#0d1117");
            setTooltip(null);
          });

        // ── Legend: color ─────────────────────────────────────────────────────
        const legW = 120, legH = 10;
        const legX = W - legW - 16;
        const legY = H - 54;

        const defs   = svg.append("defs");
        const gradId = "hex-death-grad";
        const grad   = defs.append("linearGradient").attr("id", gradId);
        d3.range(0, 1.01, 0.1).forEach((t) => {
          grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(t));
        });

        const legG = svg.append("g").attr("transform", `translate(${legX},${legY})`);
        legG.append("rect").attr("width", legW).attr("height", legH).attr("rx", 3)
          .attr("fill", `url(#${gradId})`);
        legG.append("text").attr("y", -5).attr("fill", "var(--muted)").attr("font-size", 10).text("Death rate");
        legG.append("text").attr("y", legH + 13).attr("fill", "var(--muted)").attr("font-size", 9).text("0%");
        legG.append("text").attr("x", legW).attr("y", legH + 13).attr("text-anchor", "end")
          .attr("fill", "var(--muted)").attr("font-size", 9).text("100%");

        // ── Legend: size ──────────────────────────────────────────────────────
        const szG = svg.append("g").attr("transform", `translate(16,${H - 60})`);
        szG.append("text").attr("fill", "var(--muted)").attr("font-size", 10).attr("dy", "-4").text("Hex size = case count");
        [1, Math.round(maxCount / 2), maxCount].forEach((v, i) => {
          const cx = i * 34 + 14;
          szG.append("circle").attr("cx", cx).attr("cy", 18)
            .attr("r", rScale(v)).attr("fill", "none").attr("stroke", "rgba(255,255,255,0.4)").attr("stroke-width", 1);
          szG.append("text").attr("x", cx).attr("y", 38).attr("text-anchor", "middle")
            .attr("fill", "var(--muted)").attr("font-size", 8).text(v);
        });

        setStatus(null);
      } catch (err) {
        if (!cancelled) setStatus(`Error: ${err.message}`);
      }
    }

    draw();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {status && (
        <div style={{ padding: "2rem", color: "var(--muted)", fontSize: 13 }}>{status}</div>
      )}
      <div ref={ref} style={{ width: "100%" }} />
      {tooltip && (
        <div style={{
          position:     "absolute",
          left:         tooltip.x + 14,
          top:          tooltip.y - 56,
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: 6,
          padding:      "8px 12px",
          fontSize:     12,
          pointerEvents:"none",
          lineHeight:   1.8,
          zIndex:       10,
        }}>
          <strong>Cases:</strong> {tooltip.cases}<br />
          <strong>Deaths:</strong> {tooltip.deaths}<br />
          <strong>Death rate:</strong> {tooltip.rate}%
        </div>
      )}
    </div>
  );
}
