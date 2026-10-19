from __future__ import annotations

from collections import Counter
from datetime import datetime
from io import BytesIO
from typing import Any

from PIL import Image, ImageStat


DEFAULT_PROFILE = {
    "crop_name": "Wheat",
    "land_size": "3 acres",
    "soil_type": "Loamy",
    "season": "Rabi",
    "state": "Maharashtra",
    "district": "Pune",
    "village": "Model Farm",
    "preferred_language": "English",
}


SCHEME_RULES = [
    {
        "name": "PM-KISAN",
        "reason": "Direct income support for eligible farmer families with cultivable land.",
        "match": lambda profile: True,
    },
    {
        "name": "PM Fasal Bima Yojana",
        "reason": "Useful when crop risk from weather or pest pressure is high.",
        "match": lambda profile: profile.get("crop_name") in {"Wheat", "Paddy", "Cotton", "Soybean", "Sugarcane"},
    },
    {
        "name": "Kisan Credit Card",
        "reason": "Helps with short-term working capital for seeds, fertilizer, and irrigation.",
        "match": lambda profile: True,
    },
    {
        "name": "PM Krishi Sinchai Yojana",
        "reason": "Good fit when irrigation efficiency and water access need improvement.",
        "match": lambda profile: profile.get("soil_type") in {"Sandy", "Black", "Loamy"},
    },
    {
        "name": "Soil Health Card",
        "reason": "Recommended to optimize fertilizer planning by soil condition.",
        "match": lambda profile: True,
    },
]


def merge_profile(user: Any | None) -> dict[str, Any]:
    profile = DEFAULT_PROFILE.copy()
    if user:
        for key in profile:
            profile[key] = getattr(user, key, None) or profile[key]
        profile["name"] = getattr(user, "name", "Farmer")
        profile["email"] = getattr(user, "email", "")
        profile["mobile_number"] = getattr(user, "mobile_number", "")
        profile["date_of_birth"] = getattr(user, "date_of_birth", "")
    else:
        profile["name"] = "Farmer"
        profile["email"] = ""
        profile["mobile_number"] = ""
        profile["date_of_birth"] = ""
    return profile


def simplify_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return "No answer found."
    replacements = {
        "approximately": "about",
        "cultivation": "farming",
        "application": "use",
        "recommended": "best",
        "irrigation": "watering",
        "nutrient": "plant food",
    }
    simplified = text
    for source, target in replacements.items():
        simplified = simplified.replace(source, target).replace(source.title(), target.title())
    if len(simplified) > 220:
        simplified = simplified[:217].rstrip() + "..."
    return f"Simple answer: {simplified}"


def build_weather_overview(profile: dict[str, Any]) -> dict[str, str]:
    return {"temp":"Unavailable", "condition":"Weather unavailable", "advice":"Use live weather for your farm location.", "humidity":"Unavailable", "wind":"Unavailable", "status":"unavailable"}


def build_market_prices(profile: dict[str, Any]) -> list[dict[str, str]]:
    return []


def market_prediction(profile: dict[str, Any]) -> dict[str, Any]:
    return {"sell_window":"Not predicted", "trend":"No verified forecast", "insight":"Compare dated mandi observations and your costs before selling.", "series":[], "confidence":0, "source":"unavailable"}


def weather_alerts(profile: dict[str, Any]) -> list[str]:
    return ["Check live weather for your district; no field-specific alert is verified here."]


def pest_outbreak_risk(profile: dict[str, Any]) -> dict[str, str]:
    return {"risk":"Not assessed", "likely_issue":"Not diagnosed", "reason":"Local pest observations are required.", "action":"Contact your local KVK with crop symptoms."}


def scheme_eligibility(profile: dict[str, Any]) -> list[dict[str, str]]:
    results = []
    for scheme in SCHEME_RULES:
        if scheme["match"](profile):
            results.append({"name": scheme["name"], "reason": scheme["reason"]})
    return results


def loan_insurance_assistant(profile: dict[str, Any]) -> dict[str, Any]:
    crop = profile.get("crop_name", "Wheat")
    land_size = profile.get("land_size", "3 acres")
    season = profile.get("season", "Rabi")
    district = profile.get("district", "Pune")

    insurance_priority = "PM Fasal Bima Yojana"
    if crop.lower() in {"cotton", "paddy"}:
        insurance_note = f"{crop} in {district} usually benefits from stronger weather-risk cover during the {season.lower()} window."
    else:
        insurance_note = f"Insurance can protect your {crop.lower()} crop against weather and yield shocks in {district}."

    loan_priority = "Kisan Credit Card"
    if "acre" in land_size.lower():
        loan_note = f"For {land_size}, short-term working capital through KCC is usually the first option to compare."
    else:
        loan_note = "Short-term working capital and seasonal input finance should be compared before taking any private loan."

    checklist = [
        "Aadhaar and mobile-linked bank account",
        "Land record or cultivation proof",
        "Crop details, season, and sowing information",
        "Existing loan status and repayment capacity",
    ]

    return {
        "headline": f"Finance desk for {crop} in {district}",
        "loan_priority": {
            "name": loan_priority,
            "reason": loan_note,
            "next_step": "Check eligible limit, interest rate, and repayment cycle before applying."
        },
        "insurance_priority": {
            "name": insurance_priority,
            "reason": insurance_note,
            "next_step": "Review enrollment timeline, insured crop, and claim conditions for your district."
        },
        "checklist": checklist,
        "advice": "Compare official schemes first, avoid rushed borrowing, and review claim or repayment timelines carefully.",
    }


def generate_farm_plan(profile: dict[str, Any], horizon: str = "weekly") -> dict[str, Any]:
    crop = profile.get("crop_name", "Wheat")
    season = profile.get("season", "Rabi")
    soil = profile.get("soil_type", "Loamy")
    cadence = "this week" if horizon == "weekly" else "this month"
    tasks = [
        {"stage": "Sowing / crop stage", "task": f"Review current {crop.lower()} stage and note weak patches {cadence}."},
        {"stage": "Irrigation", "task": f"Adjust watering based on {soil.lower()} soil retention and morning temperature."},
        {"stage": "Fertilizer", "task": "Use split application and avoid overfeeding before cloudy days."},
        {"stage": "Pesticide", "task": "Scout before spraying; use only if economic threshold is visible."},
        {"stage": "Harvest timing", "task": f"Track maturity and mandi trend for your {season.lower()} planning window."},
    ]
    return {"title": f"{horizon.title()} AI Farm Planner", "tasks": tasks}


def daily_briefing(profile: dict[str, Any]) -> dict[str, Any]:
    weather = build_weather_overview(profile)
    market = market_prediction(profile)
    alerts = weather_alerts(profile)
    plan = generate_farm_plan(profile, "weekly")
    return {
        "headline": f"Good morning {profile.get('name', 'Farmer')}, here is your farm update for today.",
        "weather": weather,
        "market": market,
        "alerts": alerts,
        "top_tasks": [task["task"] for task in plan["tasks"][:3]],
    }


def community_insights(posts: list[Any]) -> dict[str, Any]:
    total_posts = len(posts)
    if not posts:
        return {
            "summary": "No community posts yet. Start a discussion to build local farmer intelligence.",
            "highlights": [],
            "common_topics": [],
        }

    content_list = [getattr(post, "content", "") for post in posts]
    joined = " ".join(content_list).lower()
    topics = []
    for keyword in ["weather", "pest", "scheme", "water", "price", "cotton", "paddy", "wheat"]:
        if keyword in joined:
            topics.append(keyword)

    highlights = []
    ranked_posts = sorted(posts, key=lambda p: (getattr(p, "likes", 0) + getattr(p, "dislikes", 0) * -0.2), reverse=True)
    for post in ranked_posts[:3]:
        highlights.append({
            "post_id": getattr(post, "id", 0),
            "content": getattr(post, "content", ""),
            "score": getattr(post, "likes", 0),
        })

    return {
        "summary": f"{total_posts} community posts analysed. Farmers are mainly discussing {', '.join(topics[:3]) or 'general crop support'}.",
        "highlights": highlights,
        "common_topics": topics[:5],
    }


def analyze_leaf_image(contents: bytes) -> dict[str, str]:
    return {"disease":"Not diagnosed", "confidence":"unavailable", "next_step_treatment":"Automated diagnosis is not configured. Ask your local KVK to inspect the crop before selecting treatment."}


def analyze_document_text(text: str) -> dict[str, Any]:
    clean = (text or "").strip()
    if not clean:
        return {
            "summary": "No readable document content detected.",
            "document_type": "Unknown",
            "key_points": [],
        }

    lowered = clean.lower()
    if "survey" in lowered or "cts" in lowered or "land" in lowered:
        doc_type = "Land Record"
    elif "soil" in lowered or "ph" in lowered:
        doc_type = "Soil Report"
    elif "invoice" in lowered or "bill" in lowered:
        doc_type = "Bill / Invoice"
    else:
        doc_type = "Agricultural Document"

    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    return {
        "summary": f"{doc_type} detected. The document contains {min(len(lines), 5)} notable lines for review.",
        "document_type": doc_type,
        "key_points": lines[:5],
    }


def map_context(profile: dict[str, Any]) -> dict[str, Any]:
    district = profile.get("district", "Pune")
    state = profile.get("state", "Maharashtra")
    return {
        "title": f"Map context for {district}, {state}",
        "nearby_layers": [
            "Weather zone",
            "Nearby mandi clusters",
            "Crop advisory region",
            "Soil planning context",
        ],
        "embed_hint": f"https://www.openstreetmap.org/search?query={district}%2C%20{state}",
    }


def build_chat_context(memory_rows: list[Any]) -> dict[str, Any]:
    if not memory_rows:
        return {"summary": "No stored assistant memory yet.", "preferences": []}

    latest_questions = [row.question for row in memory_rows[:5]]
    words = Counter(word.lower() for q in latest_questions for word in q.split() if len(word) > 4)
    return {
        "summary": f"Assistant remembers {len(memory_rows)} recent questions.",
        "preferences": [word for word, _ in words.most_common(5)],
    }


def build_dashboard_payload(profile: dict[str, Any], memory_rows: list[Any] | None = None) -> dict[str, Any]:
    market = market_prediction(profile)
    return {
        "weather": build_weather_overview(profile),
        "markets": build_market_prices(profile),
        "market_prediction": market,
        "weather_alerts": weather_alerts(profile),
        "pest_risk": pest_outbreak_risk(profile),
        "daily_briefing": daily_briefing(profile),
        "scheme_matches": scheme_eligibility(profile),
        "farm_plan": generate_farm_plan(profile, "weekly"),
        "chat_memory": build_chat_context(memory_rows or []),
        "map_context": map_context(profile),
    }
