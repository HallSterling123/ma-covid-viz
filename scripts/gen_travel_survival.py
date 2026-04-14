"""
Generate travel_survival.json for the stacked bar chart visualization.

For each patient:
  - compute max haversine distance from home to any encounter facility
  - classify insurance as public / private / no_insurance
  - determine survivability (DEATHDATE is empty → survived)

Output: array of bins
  { bin, miles_label, public_survived, public_died, private_survived, private_died,
    no_insurance_survived, no_insurance_died, total, survival_rate }
"""

import csv, json, math, os
from collections import defaultdict

DATA = os.path.join(os.path.dirname(__file__), "../../10k_synthea_covid19_csv 2")
OUT  = os.path.join(os.path.dirname(__file__), "../public/data/travel_survival.json")

# ---------- payer classification ----------
PUBLIC_NAMES    = {"dual eligible", "medicare", "medicaid"}
NO_INS_NAMES    = {"no_insurance"}

def classify_payer(name):
    n = name.strip().lower()
    if n in PUBLIC_NAMES:  return "public"
    if n in NO_INS_NAMES:  return "no_insurance"
    return "private"

# ---------- haversine distance (miles) ----------
def haversine(lat1, lon1, lat2, lon2):
    R = 3958.8  # Earth radius miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

# ---------- load payers ----------
payer_class = {}   # payer_id -> "public" | "private" | "no_insurance"
with open(f"{DATA}/payers.csv") as f:
    for row in csv.DictReader(f):
        payer_class[row["Id"]] = classify_payer(row["NAME"])

# ---------- load organizations ----------
org_loc = {}   # org_id -> (lat, lon)
with open(f"{DATA}/organizations.csv") as f:
    for row in csv.DictReader(f):
        try:
            org_loc[row["Id"]] = (float(row["LAT"]), float(row["LON"]))
        except (ValueError, KeyError):
            pass

# ---------- load patients ----------
pat_loc      = {}   # patient_id -> (lat, lon)
pat_survived = {}   # patient_id -> bool
with open(f"{DATA}/patients.csv") as f:
    for row in csv.DictReader(f):
        try:
            pat_loc[row["Id"]] = (float(row["LAT"]), float(row["LON"]))
        except (ValueError, KeyError):
            pass
        pat_survived[row["Id"]] = (row["DEATHDATE"].strip() == "")

# ---------- load encounters → compute per-patient max distance & dominant payer ----------
# For each patient: track max distance, and count of payer types across encounters
pat_max_dist   = defaultdict(float)             # patient_id -> max miles
pat_payer_cnt  = defaultdict(lambda: defaultdict(int))  # patient_id -> {type -> count}

print("Reading encounters...")
with open(f"{DATA}/encounters.csv") as f:
    for i, row in enumerate(csv.DictReader(f)):
        pid  = row["PATIENT"]
        oid  = row["ORGANIZATION"]
        payd = row["PAYER"]

        if pid not in pat_loc or oid not in org_loc:
            continue

        plat, plon = pat_loc[pid]
        olat, olon = org_loc[oid]
        dist = haversine(plat, plon, olat, olon)
        if dist > pat_max_dist[pid]:
            pat_max_dist[pid] = dist

        ptype = payer_class.get(payd, "private")
        pat_payer_cnt[pid][ptype] += 1

print(f"  processed {i+1:,} encounter rows")

# ---------- classify each patient ----------
BINS = [
    (0,   2,  "0 – 2 mi"),
    (2,   4,  "2 – 4 mi"),
    (4,   7,  "4 – 7 mi"),
    (7,  10,  "7 – 10 mi"),
    (10, 15,  "10 – 15 mi"),
    (15, 1e9, "15+ mi"),
]

# bucket_key -> {public_survived, public_died, private_survived, …}
buckets = defaultdict(lambda: defaultdict(int))

for pid, max_dist in pat_max_dist.items():
    survived = pat_survived.get(pid, True)
    payer_counts = pat_payer_cnt[pid]
    dominant = max(payer_counts, key=payer_counts.get) if payer_counts else "private"

    for lo, hi, label in BINS:
        if lo <= max_dist < hi:
            sfx = "survived" if survived else "died"
            buckets[label][f"{dominant}_{sfx}"] += 1
            break

# ---------- also include patients who never had a recorded encounter ----------
no_enc = set(pat_loc.keys()) - set(pat_max_dist.keys())
print(f"  {len(no_enc):,} patients with no matchable encounters (skipped)")

# ---------- assemble output ----------
result = []
for lo, hi, label in BINS:
    b = buckets[label]
    pub_s  = b["public_survived"]
    pub_d  = b["public_died"]
    pri_s  = b["private_survived"]
    pri_d  = b["private_died"]
    noi_s  = b["no_insurance_survived"]
    noi_d  = b["no_insurance_died"]
    total  = pub_s + pub_d + pri_s + pri_d + noi_s + noi_d
    survived_total = pub_s + pri_s + noi_s
    survival_rate  = round(survived_total / total * 100, 2) if total else 0

    result.append({
        "bin": label,
        "public_survived":       pub_s,
        "public_died":           pub_d,
        "private_survived":      pri_s,
        "private_died":          pri_d,
        "no_insurance_survived": noi_s,
        "no_insurance_died":     noi_d,
        "total":     total,
        "survived":  survived_total,
        "survival_rate": survival_rate,
    })
    print(f"  {label:12s}  n={total:5d}  survival={survival_rate:.1f}%  "
          f"pub={pub_s+pub_d}  pri={pri_s+pri_d}  noi={noi_s+noi_d}")

with open(OUT, "w") as f:
    json.dump(result, f, indent=2)

print(f"\nWrote {OUT}")
