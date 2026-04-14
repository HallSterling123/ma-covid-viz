"""
Pre-process Synthea COVID-19 CSVs into compact JSON for the React app.
Run from the covid-viz directory: python scripts/process_data.py
"""

import csv
import json
import os
from datetime import datetime
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT_DIR  = os.path.join(os.path.dirname(__file__), "../public/data")
os.makedirs(OUT_DIR, exist_ok=True)


def save(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  Wrote {path}  ({os.path.getsize(path)//1024} KB)")


# ---------------------------------------------------------------------------
# 1. PATIENTS — demographics, age at reference date (2020-03-01)
# ---------------------------------------------------------------------------
print("Processing patients...")
REF = datetime(2020, 3, 1)
patients = {}  # id -> {race, gender, county, age, lat, lon, died}

with open(os.path.join(DATA_DIR, "patients.csv")) as f:
    for row in csv.DictReader(f):
        try:
            bd = datetime.strptime(row["BIRTHDATE"], "%Y-%m-%d")
            age = (REF - bd).days // 365
        except:
            age = None
        patients[row["Id"]] = {
            "race":     row["RACE"],
            "gender":   row["GENDER"],
            "county":   row["COUNTY"],
            "age":      age,
            "lat":      float(row["LAT"]) if row["LAT"] else None,
            "lon":      float(row["LON"]) if row["LON"] else None,
            "died":     bool(row["DEATHDATE"]),
        }

# --- demographics aggregates ---
race_counts    = defaultdict(int)
gender_counts  = defaultdict(int)
county_counts  = defaultdict(int)
age_buckets    = defaultdict(int)  # 0-9, 10-19, …, 80+

for p in patients.values():
    race_counts[p["race"]] += 1
    gender_counts[p["gender"]] += 1
    if p["county"]:
        county_counts[p["county"]] += 1
    if p["age"] is not None:
        bucket = min(p["age"] // 10, 8) * 10
        label  = f"{bucket}-{bucket+9}" if bucket < 80 else "80+"
        age_buckets[label] += 1

save("demographics.json", {
    "race":    [{"label": k, "count": v} for k, v in race_counts.items()],
    "gender":  [{"label": k, "count": v} for k, v in gender_counts.items()],
    "county":  sorted([{"label": k, "count": v} for k, v in county_counts.items()],
                       key=lambda x: -x["count"]),
    "ageBuckets": sorted([{"label": k, "count": v} for k, v in age_buckets.items()],
                          key=lambda x: int(x["label"].replace("+","").split("-")[0]) if x["label"].replace("+","").split("-")[0].isdigit() else 999),
})

# ---------------------------------------------------------------------------
# 2. CONDITIONS — top conditions + COVID patient set
# ---------------------------------------------------------------------------
print("Processing conditions...")
COVID_CODES = {"840544004", "840539006"}   # Suspected / Confirmed COVID-19
condition_counts = defaultdict(int)
covid_patient_ids = set()
patient_conditions = defaultdict(set)  # pid -> set of condition descriptions

with open(os.path.join(DATA_DIR, "conditions.csv")) as f:
    for row in csv.DictReader(f):
        desc = row["DESCRIPTION"]
        pid  = row["PATIENT"]
        condition_counts[desc] += 1
        patient_conditions[pid].add(desc)
        if "COVID" in desc.upper():
            covid_patient_ids.add(pid)

top_conditions = sorted(condition_counts.items(), key=lambda x: -x[1])[:20]
save("top_conditions.json", [{"label": k, "count": v} for k, v in top_conditions])

# COVID comorbidities — conditions present in COVID patients (excluding COVID itself)
covid_comorbid = defaultdict(int)
for pid in covid_patient_ids:
    for cond in patient_conditions[pid]:
        if "COVID" not in cond.upper():
            covid_comorbid[cond] += 1

top_comorbid = sorted(covid_comorbid.items(), key=lambda x: -x[1])[:15]
save("covid_comorbidities.json", [{"label": k, "count": v} for k, v in top_comorbid])

# ---------------------------------------------------------------------------
# 3. ENCOUNTERS — timeline of COVID encounters + encounter class breakdown
# ---------------------------------------------------------------------------
print("Processing encounters...")
encounter_classes = defaultdict(int)
covid_timeline    = defaultdict(int)
encounter_patient = {}  # encounter_id -> patient_id

with open(os.path.join(DATA_DIR, "encounters.csv")) as f:
    for row in csv.DictReader(f):
        cls = row["ENCOUNTERCLASS"]
        encounter_classes[cls] += 1
        encounter_patient[row["Id"]] = row["PATIENT"]
        reason = row.get("REASONDESCRIPTION", "")
        if "COVID" in reason.upper():
            month = row["START"][:7]
            covid_timeline[month] += 1

save("encounter_classes.json",
     [{"label": k, "count": v} for k, v in encounter_classes.items()])

save("covid_timeline.json",
     sorted([{"month": k, "count": v} for k, v in covid_timeline.items()],
            key=lambda x: x["month"]))

# ---------------------------------------------------------------------------
# 4. AGE DISTRIBUTION — COVID vs non-COVID patients by age bucket
# ---------------------------------------------------------------------------
print("Computing age distribution...")
age_dist = defaultdict(lambda: {"covid": 0, "non_covid": 0})

for pid, p in patients.items():
    if p["age"] is None:
        continue
    bucket = min(p["age"] // 10, 8) * 10
    label  = f"{bucket}-{bucket+9}" if bucket < 80 else "80+"
    if pid in covid_patient_ids:
        age_dist[label]["covid"] += 1
    else:
        age_dist[label]["non_covid"] += 1

def age_sort_key(x):
    part = x["label"].replace("+","").split("-")[0]
    return int(part) if part.isdigit() else 999

save("age_distribution.json",
     sorted([{"label": k, **v} for k, v in age_dist.items()], key=age_sort_key))

# ---------------------------------------------------------------------------
# 5. PAYERS — payer coverage breakdown
# ---------------------------------------------------------------------------
print("Processing payers...")
payer_rows = []
with open(os.path.join(DATA_DIR, "payers.csv")) as f:
    for row in csv.DictReader(f):
        payer_rows.append({
            "name":          row["NAME"],
            "covered":       float(row["AMOUNT_COVERED"] or 0),
            "uncovered":     float(row["AMOUNT_UNCOVERED"] or 0),
            "customers":     int(row["UNIQUE_CUSTOMERS"] or 0),
            "qols":          float(row["QOLS_AVG"] or 0),
        })

save("payers.json", sorted(payer_rows, key=lambda x: -x["customers"]))

# ---------------------------------------------------------------------------
# 6. MEDICATIONS — top medications for COVID patients
# ---------------------------------------------------------------------------
print("Processing medications...")
covid_meds = defaultdict(int)
with open(os.path.join(DATA_DIR, "medications.csv")) as f:
    for row in csv.DictReader(f):
        if row["PATIENT"] in covid_patient_ids:
            covid_meds[row["DESCRIPTION"]] += 1

top_meds = sorted(covid_meds.items(), key=lambda x: -x[1])[:15]
save("covid_medications.json", [{"label": k, "count": v} for k, v in top_meds])

# ---------------------------------------------------------------------------
# 7. OUTCOMES — mortality and severity for COVID patients
# ---------------------------------------------------------------------------
print("Computing COVID outcomes...")
outcomes = {"survived": 0, "died": 0}
county_covid = defaultdict(lambda: {"total": 0, "covid": 0})

for pid, p in patients.items():
    county = p["county"]
    county_covid[county]["total"] += 1
    if pid in covid_patient_ids:
        county_covid[county]["covid"] += 1
        if p["died"]:
            outcomes["died"] += 1
        else:
            outcomes["survived"] += 1

save("covid_outcomes.json", outcomes)
save("county_covid.json",
     sorted([{"county": k, **v} for k, v in county_covid.items()],
            key=lambda x: -x["covid"]))

# ---------------------------------------------------------------------------
# 8. OBSERVATIONS — O2 saturation, body temp for COVID vs non-COVID
# ---------------------------------------------------------------------------
print("Processing observations (this may take a moment)...")
TARGET_OBS = {
    "Oxygen saturation in Arterial blood": "o2",
    "Body temperature":                    "temp",
    "Systolic Blood Pressure":             "sbp",
    "Diastolic Blood Pressure":            "dbp",
    "Heart rate":                          "hr",
    "Body Weight":                         "weight",
}

obs_data = defaultdict(lambda: {"covid": [], "non_covid": []})

with open(os.path.join(DATA_DIR, "observations.csv")) as f:
    for row in csv.DictReader(f):
        desc = row.get("DESCRIPTION", "")
        if desc not in TARGET_OBS:
            continue
        try:
            val = float(row["VALUE"])
        except (ValueError, TypeError):
            continue
        key   = TARGET_OBS[desc]
        group = "covid" if row["PATIENT"] in covid_patient_ids else "non_covid"
        obs_data[key][group].append(val)

# Compute box-plot stats (min, q1, median, q3, max, mean, n)
def boxplot_stats(values):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    def pct(p):
        idx = (n - 1) * p
        lo, hi = int(idx), min(int(idx) + 1, n - 1)
        return s[lo] + (s[hi] - s[lo]) * (idx - lo)
    return {
        "min":    round(pct(0.05), 2),
        "q1":     round(pct(0.25), 2),
        "median": round(pct(0.50), 2),
        "q3":     round(pct(0.75), 2),
        "max":    round(pct(0.95), 2),
        "mean":   round(sum(s) / n, 2),
        "n":      n,
    }

vitals_summary = {}
for key, groups in obs_data.items():
    vitals_summary[key] = {
        "covid":     boxplot_stats(groups["covid"]),
        "non_covid": boxplot_stats(groups["non_covid"]),
    }

save("vitals_boxplot.json", vitals_summary)

print("\nDone! All JSON files written to public/data/")
