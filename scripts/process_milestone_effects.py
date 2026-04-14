"""
Generate highlight data for milestone special effects.
Run from covid-viz/: python scripts/process_milestone_effects.py
"""
import csv, json, os
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")

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
            patients[row["Id"]] = [round(float(row["LAT"]),4), round(float(row["LON"]),4)]

# ── Organizations ─────────────────────────────────────────────────────────────
print("Loading organizations...")
orgs = {}
with open(os.path.join(DATA_DIR, "organizations.csv")) as f:
    for row in csv.DictReader(f):
        if row["LAT"] and row["LON"]:
            orgs[row["Id"]] = [round(float(row["LAT"]),4), round(float(row["LON"]),4)]

# ── First COVID patients (diagnosed Jan 20, 2020) ─────────────────────────────
print("Finding first COVID patients...")
first_patients = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        if "COVID" in row["DESCRIPTION"].upper() and row["START"] == "2020-01-20":
            first_patients.add(row["PATIENT"])
print(f"  {len(first_patients)} patients diagnosed on 2020-01-20")

# Their encounter lines (all encounters up to and including Jan 20, 2020)
first_lines = []
with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] not in first_patients: continue
        if row["START"][:10] > "2020-01-20": continue
        p = patients.get(row["PATIENT"])
        o = orgs.get(row["ORGANIZATION"])
        if not p or not o: continue
        first_lines.append([p[0], p[1], o[0], o[1]])

print(f"  {len(first_lines)} encounter lines for first patients")

# Their home locations (for dot markers)
first_homes = []
for pid in first_patients:
    p = patients.get(pid)
    if p: first_homes.append(p)

# ── Surge comparison: Feb 10-16 vs Feb 17-23 ─────────────────────────────────
print("Building surge comparison weeks...")

# All COVID patients
covid_pids = set()
with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        if "COVID" in row["DESCRIPTION"].upper():
            covid_pids.add(row["PATIENT"])

WEEK_BEFORE = ("2020-02-24", "2020-03-01")   # 306 COVID encounters
WEEK_AFTER  = ("2020-03-02", "2020-03-08")   # 850 COVID encounters (+178%)

week_before_lines = []
week_after_lines  = []
week_before_by_class = defaultdict(int)
week_after_by_class  = defaultdict(int)

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] not in covid_pids: continue
        # Only encounters where the reason was COVID (shows the 183% surge clearly)
        if "COVID" not in row.get("REASONDESCRIPTION", "").upper(): continue  # COVID-flagged encounters only
        day = row["START"][:10]
        p = patients.get(row["PATIENT"])
        o = orgs.get(row["ORGANIZATION"])
        if not p or not o: continue
        line = [p[0], p[1], o[0], o[1], row["ENCOUNTERCLASS"]]
        if WEEK_BEFORE[0] <= day <= WEEK_BEFORE[1]:
            week_before_lines.append(line)
            week_before_by_class[row["ENCOUNTERCLASS"]] += 1
        elif WEEK_AFTER[0] <= day <= WEEK_AFTER[1]:
            week_after_lines.append(line)
            week_after_by_class[row["ENCOUNTERCLASS"]] += 1

print(f"  Before ({WEEK_BEFORE[0]}–{WEEK_BEFORE[1]}): {len(week_before_lines)} encounters")
print(f"  After  ({WEEK_AFTER[0]}–{WEEK_AFTER[1]}):  {len(week_after_lines)} encounters")
print(f"  Increase: {((len(week_after_lines)/max(len(week_before_lines),1))-1)*100:.0f}%")
print(f"  Before by class: {dict(week_before_by_class)}")
print(f"  After  by class: {dict(week_after_by_class)}")

save("milestone_effects.json", {
    "m1": {
        "homes":  first_homes,
        "lines":  first_lines,
        "count":  len(first_patients),
    },
    "m2": {
        "before": {
            "label":   "Feb 10–16",
            "count":   len(week_before_lines),
            "byClass": dict(week_before_by_class),
            "lines":   week_before_lines,
        },
        "after": {
            "label":   "Feb 17–23",
            "count":   len(week_after_lines),
            "byClass": dict(week_after_by_class),
            "lines":   week_after_lines,
        },
    },
})
print("Done.")
