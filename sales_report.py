"""
Sales report for Royal Hairdresser (Python, standard library only).

Reads data.json (created by the Node server) or falls back to seed.json and prints:
revenue per day, the most booked services, revenue per stylist and the busiest hours.
Also saves daily_sales.csv.

Usage:  python sales_report.py [path/to/data.json]
"""
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent


def build_report(state):
    done = [a for a in state["appointments"] if a["status"] == "completed"]
    per_day, services, stylists, hours = defaultdict(lambda: [0, 0]), Counter(), defaultdict(int), Counter()
    for a in done:
        day = a["start"][:10]
        per_day[day][0] += a["total"]
        per_day[day][1] += 1
        services.update(a["serviceNames"])
        stylists[a["stylist"]] += a["total"]
        hours[a["start"][11:13] + ":00"] += 1
    total = sum(v[0] for v in per_day.values())
    return {
        "days": sorted((d, v[0], v[1]) for d, v in per_day.items()),
        "total": total,
        "visits": len(done),
        "average_bill": round(total / len(done)) if done else 0,
        "top_services": services.most_common(5),
        "stylists": sorted(stylists.items(), key=lambda kv: kv[1], reverse=True),
        "busy_hours": hours.most_common(3),
    }


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "data.json"
    if not path.exists():
        path = HERE / "seed.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    r = build_report(state)

    print(f"Completed visits: {r['visits']}   Revenue: {r['total']} BDT   Average bill: {r['average_bill']} BDT\n")
    print("Daily revenue")
    for day, revenue, count in r["days"]:
        print(f"  {day}  {revenue:>7} BDT  ({count} visits)")
    print("\nTop services:", ", ".join(f"{n} x{c}" for n, c in r["top_services"]) or "-")
    print("Revenue by stylist:", ", ".join(f"{n} {v} BDT" for n, v in r["stylists"]) or "-")
    print("Busiest hours:", ", ".join(f"{h} ({c})" for h, c in r["busy_hours"]) or "-")

    out = HERE / "daily_sales.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "revenue_bdt", "visits"])
        w.writerows(r["days"])
    print(f"\nSaved {out.name}")


if __name__ == "__main__":
    main()
