"""
Build individual patient→org flow lines for canvas rendering.
Stores lat/lon pairs grouped by encounter class.
Run from covid-viz/: python scripts/process_individual_flows.py
"""
import csv, json, os
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")
os.makedirs(OUT_DIR, exist_ok=True)

def save(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {path}  ({os.path.getsize(path)//1024} KB)")

# ── Patients ──────────────────────────────────────────────────────────────────
print("Loading patients...")
patients = {}
with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            patients[row["Id"]] = [round(float(row["LAT"]),5), round(float(row["LON"]),5)]

# ── Organizations ─────────────────────────────────────────────────────────────
print("Loading organizations...")
orgs = {}
with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            orgs[row["Id"]] = {
                "ll":   [round(float(row["LAT"]),5), round(float(row["LON"]),5)],
                "name": row["NAME"],
            }

# ── COVID patients ────────────────────────────────────────────────────────────
print("Loading COVID patient set...")
covid_pids = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        if "COVID" in row["DESCRIPTION"].upper():
            covid_pids.add(row["PATIENT"])
print(f"  {len(covid_pids)} COVID patients")

# ── Build unique patient→org pairs per encounter class ────────────────────────
print("Building individual flow lines...")

# unique pairs: (pid, oid, class) — deduplicate so we don't draw thousands
#   of overlapping lines for repeat visits
seen = set()
# Store per class: list of [p_lat, p_lon, o_lat, o_lon]
class_lines = defaultdict(list)

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        pid  = row["PATIENT"]
        oid  = row["ORGANIZATION"]
        cls  = row["ENCOUNTERCLASS"]
        if pid not in covid_pids: continue
        key = (pid, oid, cls)
        if key in seen: continue
        seen.add(key)
        p = patients.get(pid)
        o = orgs.get(oid)
        if not p or not o: continue
        class_lines[cls].append([p[0], p[1], o["ll"][0], o["ll"][1]])

for cls, lines in class_lines.items():
    print(f"  {cls}: {len(lines)} lines")

# ── Save ──────────────────────────────────────────────────────────────────────
save("individual_flows.json", dict(class_lines))

print(f"\nTotal lines: {sum(len(v) for v in class_lines.values())}")
print("Done.")
