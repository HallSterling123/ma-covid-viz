import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

function TimelineChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const el = ref.current;
    const W = el.clientWidth || 700;
    const H = 320;
    const margin = { top: 20, right: 30, bottom: 50, left: 55 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el)
      .append("svg")
      .attr("width", W)
      .attr("height", H);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const parseMonth = d3.timeParse("%Y-%m");
    const parsed = data.map((d) => ({ date: parseMonth(d.month), count: d.count }));

    const x = d3.scaleTime()
      .domain(d3.extent(parsed, (d) => d.date))
      .range([0, w]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(parsed, (d) => d.count) * 1.15])
      .nice()
      .range([h, 0]);

    // gridlines
    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-w).tickFormat(""))
      .selectAll("line")
      .attr("stroke", "rgba(255,255,255,0.05)");
    g.select(".grid .domain").remove();

    // gradient
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient")
      .attr("id", "area-grad")
      .attr("x1", "0").attr("y1", "0")
      .attr("x2", "0").attr("y2", "1");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "var(--covid)").attr("stop-opacity", 0.6);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "var(--covid)").attr("stop-opacity", 0.02);

    // area
    const area = d3.area()
      .x((d) => x(d.date))
      .y0(h)
      .y1((d) => y(d.count))
      .curve(d3.curveCatmullRom);

    g.append("path")
      .datum(parsed)
      .attr("d", area)
      .attr("fill", "url(#area-grad)");

    // line
    const line = d3.line()
      .x((d) => x(d.date))
      .y((d) => y(d.count))
      .curve(d3.curveCatmullRom);

    g.append("path")
      .datum(parsed)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "var(--covid)")
      .attr("stroke-width", 2.5);

    // dots
    const tooltip = d3.select(el)
      .append("div")
      .attr("class", "d3-tooltip")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "6px")
      .style("padding", "6px 10px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    g.selectAll("circle")
      .data(parsed)
      .join("circle")
      .attr("cx", (d) => x(d.date))
      .attr("cy", (d) => y(d.count))
      .attr("r", 5)
      .attr("fill", "var(--covid)")
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 2)
      .on("mouseover", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d3.timeFormat("%b %Y")(d.date)}</strong><br/>${d.count} COVID encounters`);
      })
      .on("mousemove", (event) => {
        const box = el.getBoundingClientRect();
        tooltip
          .style("left", `${event.clientX - box.left + 12}px`)
          .style("top",  `${event.clientY - box.top  - 28}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    // axes
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b '%y")))
      .selectAll("text")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11);

    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .selectAll("text")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11);

    g.selectAll(".domain").attr("stroke", "var(--border)");
    g.selectAll(".tick line").attr("stroke", "var(--border)");
  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

export default function Timeline() {
  const { data, loading, error } = useData("/data/covid_timeline.json");

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>COVID-19 Encounter Timeline</h1>
      <p className={styles.pageDesc}>
        Monthly count of patient encounters where the documented reason was COVID-19 or Suspected
        COVID-19. The sharp peak in March 2020 reflects the initial Massachusetts outbreak.
      </p>
      <Card title="COVID Encounters per Month" subtitle="Encounters flagged with COVID-19 reason code">
        {loading || error ? <Loader error={error} /> : <TimelineChart data={data} />}
      </Card>

      {data && (
        <div className={styles.insightRow}>
          {[
            { label: "Peak Month",  value: data.reduce((a, b) => a.count > b.count ? a : b).month },
            { label: "Peak Count",  value: data.reduce((a, b) => a.count > b.count ? a : b).count.toLocaleString() },
            { label: "Total COVID Encounters", value: data.reduce((s, d) => s + d.count, 0).toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className={styles.insightCard}>
              <div className={styles.insightValue}>{value}</div>
              <div className={styles.insightLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
