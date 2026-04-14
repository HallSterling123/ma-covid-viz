import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Loader from "./Loader";

export default function ChordDiagram() {
  const ref = useRef();
  const { data, loading, error } = useData("/data/comorbidity_matrix.json");

  useEffect(() => {
    if (!data) return;
    const el = ref.current;
    if (!el) return;

    const W      = el.clientWidth || 640;
    const size   = Math.min(W, 580);
    const outerR = size / 2 - 90;
    const innerR = outerR - 22;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el)
      .append("svg")
      .attr("width", size)
      .attr("height", size)
      .attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`);

    const { labels, matrix } = data;
    const N = labels.length;

    const color = d3.scaleOrdinal()
      .domain(d3.range(N))
      .range(d3.quantize(d3.interpolateRainbow, N + 1));

    const chord = d3.chord()
      .padAngle(0.04)
      .sortSubgroups(d3.descending);

    const chords = chord(matrix);

    const arc  = d3.arc().innerRadius(innerR).outerRadius(outerR);
    const ribbon = d3.ribbon().radius(innerR - 1);

    // ── Ribbons ───────────────────────────────────────────────────────────────
    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "6px")
      .style("padding", "7px 11px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("line-height", "1.7")
      .style("max-width", "220px");

    const ribbonG = svg.append("g").attr("fill-opacity", 0.65);

    ribbonG.selectAll("path")
      .data(chords)
      .join("path")
      .attr("d", ribbon)
      .attr("fill", (d) => color(d.source.index))
      .attr("stroke", (d) => d3.rgb(color(d.source.index)).darker())
      .attr("stroke-width", 0.5)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill-opacity", 0.9);
        const box = el.getBoundingClientRect();
        tooltip.style("opacity", 1).html(
          `<strong>${labels[d.source.index]}</strong><br/>↔ <strong>${labels[d.target.index]}</strong><br/>` +
          `Co-occurs in <strong>${d.source.value.toLocaleString()}</strong> patients`
        );
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 60}px`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 60}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 0.65);
        tooltip.style("opacity", 0);
      });

    // ── Arcs (groups) ─────────────────────────────────────────────────────────
    const group = svg.append("g");

    const groupPaths = group.selectAll("g")
      .data(chords.groups)
      .join("g");

    groupPaths.append("path")
      .attr("d", arc)
      .attr("fill", (d) => color(d.index))
      .attr("stroke", (d) => d3.rgb(color(d.index)).darker())
      .attr("stroke-width", 0.5)
      .on("mouseover", function (event, d) {
        // Fade unrelated ribbons
        ribbonG.selectAll("path")
          .attr("fill-opacity", (r) =>
            r.source.index === d.index || r.target.index === d.index ? 0.9 : 0.08
          );
        const total = d3.sum(matrix[d.index]);
        const box   = el.getBoundingClientRect();
        tooltip.style("opacity", 1).html(
          `<strong>${labels[d.index]}</strong><br/>` +
          `Total co-occurrences: <strong>${total.toLocaleString()}</strong>`
        );
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 60}px`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip.style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 60}px`);
      })
      .on("mouseout", function () {
        ribbonG.selectAll("path").attr("fill-opacity", 0.65);
        tooltip.style("opacity", 0);
      });

    // ── Labels ────────────────────────────────────────────────────────────────
    const labelR = outerR + 10;

    groupPaths.append("text")
      .each(function (d) { d.angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", "0.35em")
      .attr("transform", (d) =>
        `rotate(${(d.angle * 180) / Math.PI - 90}) translate(${labelR},0)${d.angle > Math.PI ? " rotate(180)" : ""}`
      )
      .attr("text-anchor", (d) => (d.angle > Math.PI ? "end" : "start"))
      .attr("fill", "var(--text)")
      .attr("font-size", 10.5)
      .text((d) => {
        const lbl = labels[d.index];
        // Trim "(finding)", "(disorder)" suffixes
        return lbl.replace(/\s*\((finding|disorder|body structure)\)/i, "");
      });

  }, [data]);

  if (loading || error) return <Loader error={error} />;

  return (
    <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
      <div ref={ref} style={{ position: "relative", width: "100%" }} />
    </div>
  );
}
