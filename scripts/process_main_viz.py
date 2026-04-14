"""
Generate data for the three main visualizations.
Run from covid-viz/: python scripts/process_main_viz.py
"""
import csv, json, os
from collections import defaultdict
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")
os.makedirs(OUT_DIR, exist_ok=True)

def save(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {path}  ({os.path.getsize(path)//1024} KB)")


# ── 1. PATIENTS ──────────────────────────────────────────────────────────────
print("Loading patients...")
patients = {}
with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        patients[row["Id"]] = {
            "lat":  float(row["LAT"])  if row["LAT"]  else None,
            "lon":  float(row["LON"])  if row["LON"]  else None,
            "died": bool(row["DEATHDATE"]),
        }

# ── 2. COVID patient set ──────────────────────────────────────────────────────
print("Loading conditions...")
covid_patients = set()
patient_conditions = defaultdict(set)

with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        pid  = row["PATIENT"]
        desc = row["DESCRIPTION"]
        patient_conditions[pid].add(desc)
        if "COVID" in desc.upper():
            covid_patients.add(pid)

# ── VIZ 1: COVID patient locations ───────────────────────────────────────────
print("Building patient location data...")
locations = []
for pid in covid_patients:
    p = patients.get(pid)
    if p and p["lat"] and p["lon"]:
        locations.append({
            "lat":  round(p["lat"], 5),
            "lon":  round(p["lon"], 5),
            "died": 1 if p["died"] else 0,
        })

save("covid_locations.json", locations)
print(f"  {len(locations)} COVID patient locations")


# ── VIZ 2: Co-morbidity matrix ────────────────────────────────────────────────
print("Building co-morbidity matrix...")

# Count condition frequency among COVID patients only (exclude COVID itself)
cond_counts = defaultdict(int)
for pid in covid_patients:
    for c in patient_conditions[pid]:
        if "COVID" not in c.upper():
            cond_counts[c] += 1

# Pick top 14 conditions
TOP_N = 14
top_conds = [c for c, _ in sorted(cond_counts.items(), key=lambda x: -x[1])[:TOP_N]]

# Build NxN co-occurrence matrix
matrix = [[0] * TOP_N for _ in range(TOP_N)]
for pid in covid_patients:
    pcs = patient_conditions[pid]
    indices = [i for i, c in enumerate(top_conds) if c in pcs]
    for a in indices:
        for b in indices:
            if a != b:
                matrix[a][b] += 1

save("comorbidity_matrix.json", {
    "labels": top_conds,
    "matrix": matrix,
})


# ── VIZ 3: Medication timeline ────────────────────────────────────────────────
print("Building medication timeline...")

# Get top 10 medications across ALL COVID months
med_total = defaultdict(int)
med_monthly = defaultdict(lambda: defaultdict(int))  # month -> med -> count

with open(os.path.join(DATA_DIR, "medications.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] not in covid_patients:
            continue
        month = row["START"][:7]
        # Only 2020 months when COVID was active
        if not month.startswith("2020"):
            continue
        med = row["DESCRIPTION"]
        # Truncate very long names
        if len(med) > 50:
            med = med[:47] + "…"
        med_total[med] += 1
        med_monthly[month][med] += 1

# Top 10 meds by total count during 2020
top_meds_full = [m for m, _ in sorted(med_total.items(), key=lambda x: -x[1])[:10]]

# Create short display names by stripping dosage suffixes
import re
def short_name(s):
    # Remove dosage patterns like "500 MG", "0.4 ML", "24 HR", NDA codes
    s = re.sub(r'^\d[\d.]* [A-Z]{2} ', '', s)          # leading dose
    s = re.sub(r'NDA\d+ \d+ ACTUAT ', '', s)            # NDA prefix
    s = re.sub(r'\s+\d[\d.]* (MG|ML|UNT|ACTUAT).*', '', s)  # trailing dose
    s = re.sub(r'\s+\[.*?\]', '', s)                    # [brand]
    s = s.strip()
    return s[:36] if len(s) > 36 else s

# Deduplicate short names
seen = {}
short_names = {}
for m in top_meds_full:
    s = short_name(m)
    if s in seen:
        seen[s] += 1
        s = f"{s} ({seen[s]})"
    else:
        seen[s] = 1
    short_names[m] = s

months = sorted(med_monthly.keys())
timeline = []
for month in months:
    entry = {"month": month}
    for med in top_meds_full:
        entry[short_names[med]] = med_monthly[month].get(med, 0)
    timeline.append(entry)

short_meds = [short_names[m] for m in top_meds_full]

save("medication_timeline.json", {
    "meds":     short_meds,
    "timeline": timeline,
})

print("\nDone.")
