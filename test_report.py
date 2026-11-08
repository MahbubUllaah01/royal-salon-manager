from sales_report import build_report


def appt(start, total, stylist="Stylist 1", services=("Haircut",), status="completed"):
    return {"start": start, "total": total, "stylist": stylist, "serviceNames": list(services), "status": status}


STATE = {"appointments": [
    appt("2026-11-09T11:00", 250),
    appt("2026-11-09T11:30", 400, "Stylist 2", ("Haircut", "Beard Trim")),
    appt("2026-11-10T15:00", 800, services=("Hair Color",)),
    appt("2026-11-10T16:00", 999, status="cancelled"),
]}


def test_totals_ignore_cancelled():
    r = build_report(STATE)
    assert r["total"] == 1450 and r["visits"] == 3 and r["average_bill"] == 483


def test_daily_breakdown():
    assert build_report(STATE)["days"] == [("2026-11-09", 650, 2), ("2026-11-10", 800, 1)]


def test_top_service_and_busy_hour():
    r = build_report(STATE)
    assert r["top_services"][0] == ("Haircut", 2)
    assert r["busy_hours"][0] == ("11:00", 2)


def test_empty_state():
    assert build_report({"appointments": []})["total"] == 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
