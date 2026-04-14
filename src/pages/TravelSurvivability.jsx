import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useData } from "../hooks/useData";
import Card from "../components/Card";
import Loader from "../components/Loader";
import styles from "./Page.module.css";

const INS_KEYS   = ["public", "private", "no_insurance"];
const INS_COLORS = { public: "#3fb950", private: "#58a6ff", no_insurance: "#f78166" };
const INS_LABELS = {
  public:       "Public (Medicare / Medicaid)",
  private:      "Private (commercial)",
  no_insurance: "No Insurance",
};

// Derive per-insurance survival rate for a bin
function insRate(d, key) {
  const s = d[`${key}_survived`];
  const t = s + d[`${key}_died`];
  return t > 0 ? (s / t) * 100 : null;
}

function GroupedBarChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data?.length) return;
    const bins = data.filter((d) => d.total > 0);
    if (!bins.length) return;

    const el     = ref.current;
    const W      = el.clientWidth || 780;
    const margin = { top: 44, right: 28, bottom: 68, left: 58 };
    const H      = 400;
    const w      = W - margin.left - margin.right;
    const h      = H - margin.top  - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // ── Scales ─────────────────────────────────────────────────────
    const x0 = d3.scaleBand()
      .domain(bins.map((d) => d.bin))
      .range([0, w])
      .paddingInner(0.22)
      .paddingOuter(0.12);

    const x1 = d3.scaleBand()
      .domain(INS_KEYS)
      .range([0, x0.bandwidth()])
      .padding(0.08);

    const y = d3.scaleLinear().domain([50, 100]).range([h, 0]).clamp(true);

    // ── Grid lines ─────────────────────────────────────────────────
    g.append("g")
      .attr("class", "grid")
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickSize(-w)
          .tickFormat("")
      )
      .call((ax) => {
        ax.select(".domain").remove();
        ax.selectAll(".tick line")
          .attr("stroke", "var(--border)")
          .attr("stroke-dasharray", "3,3")
          .attr("opacity", 0.6);
      });

    // ── Tooltip ────────────────────────────────────────────────────
    const tooltip = d3.select(el)
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--surface)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "8px")
      .style("padding", "10px 13px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("line-height", "1.8")
      .style("min-width", "180px");

    // ── Bars ───────────────────────────────────────────────────────
    const binGroups = g.selectAll(".bin-group")
      .data(bins)
      .join("g")
      .attr("class", "bin-group")
      .attr("transform", (d) => `translate(${x0(d.bin)},0)`);

    INS_KEYS.forEach((key) => {
      binGroups.append("rect")
        .attr("x", x1(key))
        .attr("width", x1.bandwidth())
        .attr("fill", INS_COLORS[key])
        .attr("rx", 3)
        .attr("opacity", 0.85)
        .each(function(d) {
          const rate = insRate(d, key);
          if (rate === null) return;
          d3.select(this)
            .attr("y", y(rate))
            .attr("height", h - y(rate));
        })
        .on("mouseover", function(event, d) {
          d3.select(this).attr("opacity", 1);
          const rate   = insRate(d, key);
          const total  = d[`${key}_survived`] + d[`${key}_died`];
          const pctAll = total > 0 ? ((total / d.total) * 100).toFixed(1) : "—";
          tooltip.style("opacity", 1).html(
            `<strong style="color:${INS_COLORS[key]}">${INS_LABELS[key]}</strong><br/>` +
            `<span style="color:var(--muted)">Distance: <strong style="color:var(--text)">${d.bin}</strong></span><br/>` +
            `Survival rate: <strong>${rate !== null ? rate.toFixed(1) + "%" : "—"}</strong><br/>` +
            `Survived: ${d[`${key}_survived`].toLocaleString()}<br/>` +
            `Died: &nbsp;&nbsp;&nbsp;&nbsp;${d[`${key}_died`].toLocaleString()}<br/>` +
            `Patients: ${total.toLocaleString()} (${pctAll}% of bin)`
          );
        })
        .on("mousemove", (event) => {
          const box = el.getBoundingClientRect();
          tooltip
            .style("left", `${event.clientX - box.left + 14}px`)
            .style("top",  `${event.clientY - box.top  - 70}px`);
        })
        .on("mouseout", function() {
          d3.select(this).attr("opacity", 0.85);
          tooltip.style("opacity", 0);
        });
    });

    // ── Overall survival rate markers (diamond per bin) ────────────
    bins.forEach((d) => {
      const cx = x0(d.bin) + x0.bandwidth() / 2;
      const cy = y(d.survival_rate);
      g.append("line")
        .attr("x1", x0(d.bin) + 2).attr("x2", x0(d.bin) + x0.bandwidth() - 2)
        .attr("y1", cy).attr("y2", cy)
        .attr("stroke", "#e3b341")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,2")
        .attr("opacity", 0.9);

      g.append("text")
        .attr("x", cx).attr("y", cy - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("fill", "#e3b341")
        .text(`${d.survival_rate}%`);
    });

    // ── Trend line connecting overall rates ────────────────────────
    const line = d3.line()
      .x((d) => x0(d.bin) + x0.bandwidth() / 2)
      .y((d) => y(d.survival_rate))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(bins)
      .attr("fill", "none")
      .attr("stroke", "#e3b341")
      .attr("stroke-width", 1.8)
      .attr("stroke-dasharray", "5,3")
      .attr("opacity", 0.7)
      .attr("d", line);

    // ── N labels below x-axis ──────────────────────────────────────
    g.selectAll(".n-label")
      .data(bins)
      .join("text")
      .attr("class", "n-label")
      .attr("x", (d) => x0(d.bin) + x0.bandwidth() / 2)
      .attr("y", h + 50)
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("fill", "var(--muted)")
      .text((d) => `n=${d.total.toLocaleString()}`);

    // ── Axes ───────────────────────────────────────────────────────
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x0).tickSize(0))
      .call((ax) => ax.select(".domain").attr("stroke", "var(--border)"))
      .selectAll("text")
      .attr("fill", "var(--text)")
      .attr("font-size", 11.5)
      .attr("dy", "1.4em");

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}%`))
      .call((ax) => {
        ax.select(".domain").attr("stroke", "var(--border)");
        ax.selectAll("text").attr("fill", "var(--muted)").attr("font-size", 10);
        ax.selectAll(".tick line").remove();
      });

    // Y-axis label
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + h / 2))
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11)
      .text("Survival Rate (%)");

    // X-axis label
    svg.append("text")
      .attr("x", margin.left + w / 2)
      .attr("y", H - 2)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--muted)")
      .attr("font-size", 11)
      .text("Max Distance Travelled to Healthcare Facility");

  }, [data]);

  return <div ref={ref} style={{ position: "relative", width: "100%" }} />;
}

function Legend() {
  return (
    <div style={{
      display: "flex", gap: "1.6rem", flexWrap: "wrap",
      alignItems: "center", fontSize: 12.5, marginTop: 10,
    }}>
      {INS_KEYS.map((key) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 3,
            background: INS_COLORS[key], display: "inline-block", flexShrink: 0,
            opacity: 0.85,
          }} />
          <span style={{ color: "var(--text)" }}>{INS_LABELS[key]}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <svg width={30} height={12}>
          <line x1={0} y1={6} x2={30} y2={6} stroke="#e3b341" strokeWidth={2} strokeDasharray="5,3" opacity={0.9} />
        </svg>
        <span style={{ color: "var(--muted)" }}>Overall survival rate</span>
      </div>
    </div>
  );
}

function SummaryTable({ data }) {
  const bins = data.filter((d) => d.total > 0);
  const headerStyle = {
    padding: "6px 10px", fontWeight: 600, fontSize: 11,
    color: "var(--muted)", borderBottom: "1px solid var(--border)",
  };
  const cellStyle = { padding: "7px 10px", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--text)" }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: "left" }}>Distance</th>
            <th style={{ ...headerStyle, textAlign: "right" }}>Total</th>
            <th style={{ ...headerStyle, textAlign: "right", color: "#e3b341" }}>Overall Rate</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.public }}>Public Rate</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.public }}>Public n</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.private }}>Private Rate</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.private }}>Private n</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.no_insurance }}>No Ins. Rate</th>
            <th style={{ ...headerStyle, textAlign: "right", color: INS_COLORS.no_insurance }}>No Ins. n</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((d) => {
            const pubRate = insRate(d, "public");
            const priRate = insRate(d, "private");
            const noiRate = insRate(d, "no_insurance");
            const rateColor = (r) =>
              r === null ? "var(--muted)"
              : r >= 82 ? "#3fb950"
              : r >= 74 ? "#e3b341"
              : "#f78166";
            return (
              <tr key={d.bin}>
                <td style={{ ...cellStyle, fontWeight: 600 }}>{d.bin}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{d.total.toLocaleString()}</td>
                <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: rateColor(d.survival_rate) }}>
                  {d.survival_rate}%
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: rateColor(pubRate) }}>
                  {pubRate !== null ? pubRate.toFixed(1) + "%" : "—"}
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: "var(--muted)" }}>
                  {(d.public_survived + d.public_died).toLocaleString()}
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: rateColor(priRate) }}>
                  {priRate !== null ? priRate.toFixed(1) + "%" : "—"}
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: "var(--muted)" }}>
                  {(d.private_survived + d.private_died).toLocaleString()}
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: rateColor(noiRate) }}>
                  {noiRate !== null ? noiRate.toFixed(1) + "%" : "—"}
                </td>
                <td style={{ ...cellStyle, textAlign: "right", color: "var(--muted)" }}>
                  {(d.no_insurance_survived + d.no_insurance_died).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TravelSurvivability() {
  const { data, loading, error } = useData("/data/travel_survival.json");
  if (loading || error) return <Loader error={error} />;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Travel Distance & Patient Survivability</h1>
      <p className={styles.pageDesc}>
        Each patient's maximum haversine distance from home to any visited facility is bucketed
        into six distance ranges. For each bin, survival rates are shown side-by-side for public
        insurance (Medicare / Medicaid), private (commercial), and uninsured patients.
        The dashed yellow line tracks the overall bin survival rate — falling steadily from
        <strong> 84.8%</strong> under 2 miles to <strong>65.5%</strong> beyond 15 miles.
      </p>

      <Card
        title="Survival Rate by Distance & Insurance Type"
        subtitle="Grouped bars per distance bin · dashed line = overall survival rate · hover for details"
      >
        <GroupedBarChart data={data} />
        <Legend />
      </Card>

      <Card title="Detailed Breakdown" subtitle="Survival rates and patient counts by distance bin and insurance type">
        <SummaryTable data={data} />
      </Card>
    </div>
  );
}
