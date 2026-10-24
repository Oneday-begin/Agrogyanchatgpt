from __future__ import annotations

import asyncio
import httpx
import secrets
import hashlib
import io
import json
import logging
import os
import random
import re
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
import requests
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from backend.data_loader import load_corpus
from backend.database import Base, SessionLocal, check_database, engine, get_session
from backend.intelligence import (
    analyze_document_text,
    analyze_leaf_image,
    build_dashboard_payload,
    community_insights,
    daily_briefing,
    generate_farm_plan,
    loan_insurance_assistant,
    map_context,
    market_prediction,
    merge_profile,
    pest_outbreak_risk,
    scheme_eligibility,
    simplify_text,
    weather_alerts,
)
from backend.models import (
    Comment,
    AlertRecord,
    DemandSignal,
    FarmerProduceListing,
    FarmProfile,
    InventoryItem,
    MandiPrice,
    MarketAlertSubscription,
    OrderRecord,
    OrderStatusEvent,
    OtpSession,
    Post,
    QueryMemory,
    SchemeSnapshot,
    User,
    WeatherSnapshot,
)
from backend.rag import RAGRetriever
from backend.document_processing import DocumentError, MAX_UPLOAD_BYTES, image_text, document_text
from backend.translation import translate_cached, translation_status, detect_language
from backend import passwords
from backend.security import authorize, issue_session, revoke

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("agrogyan.api")

app = FastAPI(title="AgroGyan API", version="2.0", dependencies=[Depends(authorize)])
Base.metadata.create_all(bind=engine)
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# Browsers reject `Access-Control-Allow-Origin: *` together with credentials,
# so origins are listed explicitly. Any localhost/127.0.0.1 port is allowed for
# development (VS Code Live Server, python -m http.server, etc.).
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    if not request.url.path.endswith((".js", ".css", ".png", ".jpg", ".svg", ".ico", ".html")):
        logger.info("%s %s -> %s (%.0f ms)", request.method, request.url.path,
                    response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    return JSONResponse(status_code=422, content={"detail": f"Invalid {field}: {first.get('msg', 'bad value')}"})


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("Database error on %s", request.url.path)
    return JSONResponse(status_code=503, content={"detail": "The database is temporarily unavailable. Please try again."})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


documents, ingestion_report = load_corpus()
repository_source_ids = {d["source_id"] for d in documents if d.get("doc_type") == "repository_gr"}
retriever = RAGRetriever(documents)
OTP_EXPIRY_MINUTES = 10
OTP_RESEND_SECONDS = 45
OTP_BRAND_NAME = "AgroGyanGPT"
ALLOW_MANUAL_OTP_FALLBACK = (os.getenv("ALLOW_MANUAL_OTP_FALLBACK") or "true").lower() == "true"
PHASE_TWO_MODULES = [
    {"id": "pest-outbreak", "label": "District pest outbreak engine", "status": "foundation-ready"},
    {"id": "scheme-ai", "label": "State and central scheme matching AI", "status": "foundation-ready"},
    {"id": "doc-ai", "label": "Document insights for soil, subsidy, and insurance files", "status": "live"},
    {"id": "voice-ai", "label": "Voice-first assistant in regional languages", "status": "live"},
]
PHASE_THREE_MODULES = [
    {"id": "subscriptions", "label": "Premium advisory subscriptions", "status": "scaffolded"},
    {"id": "offline-lite", "label": "Low-network sync and offline-lite experience", "status": "scaffolded"},
    {"id": "call-assistant", "label": "Voice call assistant for low-literacy users", "status": "scaffolded"},
    {"id": "commerce", "label": "Inputs marketplace and partner ecosystem", "status": "scaffolded"},
]
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrator")
TRACKED_CROPS = [
    "tomato",
    "capsicum",
    "paddy",
    "wheat",
    "cotton",
    "soybean",
    "sugarcane",
    "mustard",
    "onion",
    "maize",
    "potato",
    "chilli",
]
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))
LIVE_CACHE_MINUTES = int(os.getenv("LIVE_CACHE_MINUTES", "45"))
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AGMARKNET_RESOURCE_ID = os.getenv("AGMARKNET_RESOURCE_ID", "")
DATA_GOV_API_KEY = os.getenv("DATA_GOV_API_KEY", "")
MARKET_FEED_URL = (os.getenv("MARKET_FEED_URL") or "").strip()
SCHEME_FEED_URL = (os.getenv("SCHEME_FEED_URL") or "").strip()

WEATHER_CODE_MAP = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Dense fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Light snowfall",
    80: "Rain showers",
    95: "Thunderstorm",
}

DEFAULT_INVENTORY = [
    {"product_id": "seed-tomato-hybrid-seeds-0", "product_name": "Tomato Hybrid Seeds", "category": "seed", "seller": "Syngenta", "stock_count": 64, "unit": "3500 seeds", "price": "999"},
    {"product_id": "seed-brinjal-premium-seeds-1", "product_name": "Brinjal Premium Seeds", "category": "seed", "seller": "VNR", "stock_count": 48, "unit": "10 gms", "price": "179"},
    {"product_id": "fertilizer-urea-max-0", "product_name": "Urea Max", "category": "fertilizer", "seller": "IFFCO", "stock_count": 122, "unit": "45 kg bag", "price": "299"},
    {"product_id": "nutrition-humic-acid-pro-0", "product_name": "Humic Acid Pro", "category": "nutrition", "seller": "Multiplex", "stock_count": 52, "unit": "1 ltr", "price": "560"},
    {"product_id": "protection-fungicide-safeguard-0", "product_name": "Fungicide SafeGuard", "category": "protection", "seller": "Bayer", "stock_count": 37, "unit": "1 ltr", "price": "720"},
    {"product_id": "irrigation-drip-line-starter-kit-0", "product_name": "Drip Line Starter Kit", "category": "irrigation", "seller": "Jain", "stock_count": 18, "unit": "starter set", "price": "3200"},
    {"product_id": "machinery-battery-sprayer-0", "product_name": "Battery Sprayer", "category": "machinery", "seller": "Falcon", "stock_count": 16, "unit": "16 ltr", "price": "2850"},
]

DEFAULT_SCHEMES = [
    {
        "scheme_name": "PM-KISAN",
        "summary": "Income support for eligible farmer families with periodic direct benefit transfer.",
        "eligibility": "Active farmer with valid identity, land-linked records, and bank details.",
        "source": "rules",
    },
    {
        "scheme_name": "PM Fasal Bima Yojana",
        "summary": "Crop insurance support for notified crops and seasons.",
        "eligibility": "Eligible crop, season enrollment, and district notification rules apply.",
        "source": "rules",
    },
    {
        "scheme_name": "Kisan Credit Card",
        "summary": "Working-capital credit line for seasonal farm expenses.",
        "eligibility": "Farmer with basic identity, land or cultivation proof, and bank assessment.",
        "source": "rules",
    },
]
DEFAULT_PRODUCE_LISTINGS = [
    {
        "listing_code": "FARM-1001",
        "seller_name": "Pune Tomato Growers",
        "seller_phone": "+919999999901",
        "seller_location": "Pune, Maharashtra",
        "crop_name": "Tomato",
        "category": "vegetable",
        "quantity": 180,
        "available_quantity": 180,
        "unit": "kg",
        "price_per_unit": "24",
        "harvest_date": "Fresh harvest this week",
        "description": "Round tomato lots suitable for retail and mandi buyers.",
        "image_url": "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg?auto=compress&cs=tinysrgb&w=900",
    },
    {
        "listing_code": "FARM-1002",
        "seller_name": "Satara Onion Group",
        "seller_phone": "+919999999902",
        "seller_location": "Satara, Maharashtra",
        "crop_name": "Onion",
        "category": "vegetable",
        "quantity": 260,
        "available_quantity": 260,
        "unit": "kg",
        "price_per_unit": "31",
        "harvest_date": "Stored lot",
        "description": "Sorted onion stock with medium bulb size and ready loading.",
        "image_url": "https://images.pexels.com/photos/533342/pexels-photo-533342.jpeg?auto=compress&cs=tinysrgb&w=900",
    },
]


def hash_password(password: str) -> str:
    return passwords.hash_password(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return passwords.verify_password(plain_password, hashed_password)


def is_admin_credentials(email: str, password: str) -> bool:
    return (email or "").strip().lower() == ADMIN_EMAIL and bool(ADMIN_PASSWORD_HASH) and verify_password(password, ADMIN_PASSWORD_HASH)


def is_admin_email(email: str) -> bool:
    return normalize_email(email) == ADMIN_EMAIL


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_recent(timestamp: Optional[datetime], minutes: int = LIVE_CACHE_MINUTES) -> bool:
    if not timestamp:
        return False
    return (now_utc() - timestamp.replace(tzinfo=None)).total_seconds() <= minutes * 60


def safe_float(value: Any) -> Optional[float]:
    try:
        return float(str(value).strip())
    except Exception:
        return None


def coerce_price_number(value: Any) -> Optional[int]:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return int(digits) if digits else None


async def fetch_json(url: str, *, params=None):
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def fetch_json_sync(url: str, *, params=None):
    # Existing database handlers run in FastAPI's worker pool, not its event loop.
    return asyncio.run(fetch_json(url, params=params))


def generate_otp() -> str:
    return f"{100000 + secrets.randbelow(900000)}"


def normalize_indian_phone_number(phone_number: str) -> str:
    digits_only = "".join(ch for ch in (phone_number or "") if ch.isdigit())
    if len(digits_only) == 10:
        return f"+91{digits_only}"
    if len(digits_only) == 12 and digits_only.startswith("91"):
        return f"+{digits_only}"
    if phone_number.startswith("+"):
        return phone_number
    return f"+{digits_only}" if digits_only else phone_number


def phone_lookup_values(phone_number: str) -> list[str]:
    raw_value = (phone_number or "").strip()
    digits_only = "".join(ch for ch in raw_value if ch.isdigit())
    values: list[str] = []
    for candidate in [
        raw_value,
        digits_only,
        normalize_indian_phone_number(raw_value),
    ]:
        if candidate and candidate not in values:
            values.append(candidate)
    return values


def build_otp_message(otp_code: str) -> str:
    return (
        f"{OTP_BRAND_NAME}: Your registration OTP is {otp_code}. "
        f"It is valid for {OTP_EXPIRY_MINUTES} minutes. Regards, {OTP_BRAND_NAME}."
    )


LANGUAGE_CODES = {"English":"en", "Hindi":"hi", "Marathi":"mr", "Gujarati":"gu"}


def translate_text(text: str, language: str, *, source: str = "auto") -> str:
    """Translate text, returning the original if translation is unavailable.

    Translation uses the configured local/API service; a timeout must never
    turn a good answer into a server error.
    """
    target = LANGUAGE_CODES.get(language or "English", "en")
    if not text or (target == "en" and source in {"auto", "en"} and not re.search(r'[\u0900-\u0aff]', text)):
        return text
    try:
        chunks = [text[i:i + 4500] for i in range(0, len(text), 4500)]
        return "".join(translate_cached(chunk, target, source) for chunk in chunks)
    except Exception:
        logger.warning("Translation to %s failed; returning untranslated text", language)
        return text




def get_user_by_id(db: Session, user_id: Optional[int]) -> Optional[User]:
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def save_memory(db: Session, user_id: Optional[int], question: str, answer: str, language: str, context_tag: str = "assistant") -> None:
    if not user_id:
        return
    try:
        db.add(QueryMemory(
            user_id=user_id,
            question=question[:2000],
            answer=answer,
            language=language,
            context_tag=context_tag,
        ))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not save chat memory for user %s", user_id)


def extract_crop_mentions(text: str) -> list[str]:
    normalized = (text or "").lower()
    return [crop.title() for crop in TRACKED_CROPS if crop in normalized]


def get_timeframe_start(timeframe: str) -> Optional[datetime]:
    normalized = (timeframe or "all").strip().lower()
    if normalized == "today":
        now = now_utc()
        return datetime(now.year, now.month, now.day)
    if normalized == "week":
        return now_utc() - timedelta(days=7)
    return None


def build_admin_analytics(db: Session, timeframe: str = "all") -> dict:
    start_time = get_timeframe_start(timeframe)

    user_query = db.query(User)
    memory_query = db.query(QueryMemory)
    post_query = db.query(Post)

    if start_time:
        user_query = user_query.filter(User.created_at >= start_time)
        memory_query = memory_query.filter(QueryMemory.timestamp >= start_time)
        post_query = post_query.filter(Post.timestamp >= start_time)

    total_users = user_query.count()
    total_questions = memory_query.count()
    total_posts = post_query.count()
    verified_users = user_query.filter(User.phone_verified.is_(True)).count()

    top_regions_query = (
        db.query(
            User.state,
            User.district,
            func.count(User.id).label("user_count"),
        )
        .filter(User.state.isnot(None), User.state != "", User.district.isnot(None), User.district != "")
    )
    if start_time:
        top_regions_query = top_regions_query.filter(User.created_at >= start_time)
    top_regions = (
        top_regions_query
        .group_by(User.state, User.district)
        .order_by(func.count(User.id).desc(), User.state.asc(), User.district.asc())
        .limit(6)
        .all()
    )

    question_regions_query = (
        db.query(
            User.state,
            User.district,
            func.count(QueryMemory.id).label("question_count"),
        )
        .join(QueryMemory, QueryMemory.user_id == User.id)
        .filter(User.state.isnot(None), User.state != "", User.district.isnot(None), User.district != "")
    )
    if start_time:
        question_regions_query = question_regions_query.filter(QueryMemory.timestamp >= start_time)
    question_regions = (
        question_regions_query
        .group_by(User.state, User.district)
        .order_by(func.count(QueryMemory.id).desc(), User.state.asc(), User.district.asc())
        .limit(6)
        .all()
    )

    crop_counter: Counter[str] = Counter()
    for row in memory_query.with_entities(QueryMemory.question).all():
        crop_counter.update(extract_crop_mentions(row.question))
    for row in user_query.with_entities(User.crop_name).filter(User.crop_name.isnot(None), User.crop_name != "").all():
        crop_counter.update([row.crop_name.strip().title()])

    recent_users = (
        user_query
        .order_by(User.created_at.desc(), User.id.desc())
        .limit(5)
        .all()
    )

    top_crop_rows = [
        {"crop": crop, "count": count}
        for crop, count in crop_counter.most_common(6)
    ] or [{"crop": "Tomato", "count": 0}]

    active_region_rows = [
        {
            "region": f"{row.district}, {row.state}",
            "users": row.user_count,
        }
        for row in top_regions
    ] or [{"region": "Pune, Maharashtra", "users": 0}]

    region_activity_rows = [
        {
            "region": f"{row.district}, {row.state}",
            "questions": row.question_count,
        }
        for row in question_regions
    ] or [{"region": "Pune, Maharashtra", "questions": 0}]

    recent_user_rows = [
        {
            "name": user.name,
            "email": user.email,
            "region": ", ".join(part for part in [user.district, user.state] if part) or "Unknown region",
            "role": user.role or "farmer",
        }
        for user in recent_users
    ]

    return {
        "metrics": {
            "users": total_users,
            "questions": total_questions,
            "posts": total_posts,
            "verified_users": verified_users,
        },
        "timeframe": timeframe,
        "generated_at": now_utc().isoformat(),
        "top_crops": top_crop_rows,
        "active_regions": active_region_rows,
        "region_activity": region_activity_rows,
        "recent_users": recent_user_rows,
        "platform_health": [
            {"label": "Phone verified users", "value": verified_users},
            {"label": "Community posts", "value": total_posts},
            {"label": "AI questions asked", "value": total_questions},
        ],
    }


def get_or_create_farm_profile(db: Session, user_id: int) -> FarmProfile:
    profile = db.query(FarmProfile).filter(FarmProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = FarmProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def serialize_farm_profile(profile: FarmProfile | None) -> dict:
    if not profile:
        return {}
    return {
        "farm_name": profile.farm_name or "",
        "primary_crop": profile.primary_crop or "",
        "irrigation_type": profile.irrigation_type or "",
        "livestock": profile.livestock or "",
        "taluka": profile.taluka or "",
        "pin_code": profile.pin_code or "",
        "lat": profile.lat or "",
        "lng": profile.lng or "",
    }


def merge_farm_profile_context(profile: dict, farm_profile: FarmProfile | None) -> dict:
    if not farm_profile:
        return profile

    if farm_profile.primary_crop:
        profile["crop_name"] = farm_profile.primary_crop
    if farm_profile.taluka and not profile.get("district"):
        profile["district"] = farm_profile.taluka
    if farm_profile.pin_code:
        profile["pin_code"] = farm_profile.pin_code
    profile["farm_name"] = farm_profile.farm_name or ""
    profile["irrigation_type"] = farm_profile.irrigation_type or ""
    profile["livestock"] = farm_profile.livestock or ""
    profile["taluka"] = farm_profile.taluka or ""
    profile["lat"] = farm_profile.lat or ""
    profile["lng"] = farm_profile.lng or ""
    return profile


def ensure_inventory_seed(db: Session) -> None:
    return


def ensure_scheme_snapshots(db: Session, user: User | None = None) -> None:
    target_state = getattr(user, "state", None)
    target_crop = getattr(user, "crop_name", None)

    if SCHEME_FEED_URL:
        try:
            payload = fetch_json_sync(SCHEME_FEED_URL, params={"state": target_state or "", "crop": target_crop or ""})
            rows = payload.get("schemes") if isinstance(payload, dict) else payload
            if isinstance(rows, list) and rows:
                if target_state:
                    db.query(SchemeSnapshot).filter(SchemeSnapshot.state == target_state).delete()
                for row in rows:
                    db.add(
                        SchemeSnapshot(
                            scheme_name=row.get("scheme_name") or row.get("name") or "Scheme",
                            state=row.get("state") or target_state,
                            crop=row.get("crop") or target_crop,
                            summary=row.get("summary") or row.get("description") or "Live scheme feed connected.",
                            eligibility=row.get("eligibility") or row.get("rules") or "",
                            source=row.get("source") or "live-feed",
                        )
                    )
                db.commit()
                return
        except Exception:
            db.rollback()

    if db.query(SchemeSnapshot).first():
        return
    for item in DEFAULT_SCHEMES:
        db.add(SchemeSnapshot(state=target_state, crop=target_crop, **item))
    db.commit()


def ensure_produce_listing_seed(db: Session) -> None:
    return


def resolve_profile_coordinates(
    state: str,
    district: str,
    profile: FarmProfile | None,
) -> tuple[Optional[float], Optional[float], str]:
    lat = safe_float(getattr(profile, "lat", None))
    lng = safe_float(getattr(profile, "lng", None))
    if lat is not None and lng is not None:
        return lat, lng, "farm-profile"

    query = ", ".join(part for part in [district, state, "India"] if part)
    try:
        payload = fetch_json_sync(OPEN_METEO_GEOCODE_URL, params={"name": district, "count": 10, "countryCode": "IN", "language": "en", "format": "json"})
        result = next((r for r in payload.get("results", []) if r.get("country_code") == "IN" and (not state or r.get("admin1", "").casefold() == state.casefold())), None)
        if result:
            return safe_float(result.get("latitude")), safe_float(result.get("longitude")), "open-meteo-geocoding"
    except Exception:
        return None, None, "geocoding-unavailable"
    return None, None, "geocoding-unavailable"


def fetch_live_weather_snapshot(state: str, district: str, crop: str, profile: FarmProfile | None) -> Optional[dict[str, str]]:
    lat, lng, location_source = resolve_profile_coordinates(state, district, profile)
    if lat is None or lng is None:
        return None

    payload = fetch_json_sync(
        OPEN_METEO_FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lng,
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
            "daily": "precipitation_probability_max",
            "forecast_days": 1,
            "timezone": "auto",
        },
    )
    current = payload.get("current") or {}
    daily = payload.get("daily") or {}
    weather_code = int(current.get("weather_code", 2))
    condition = WEATHER_CODE_MAP.get(weather_code, "Field weather update available")
    temp_value = current.get("temperature_2m")
    humidity_value = current.get("relative_humidity_2m")
    wind_value = current.get("wind_speed_10m")
    rain_probability = (daily.get("precipitation_probability_max") or [None])[0]
    advisory = (
        f"{condition} in {district or 'your district'}. "
        f"Use this weather window to plan work for {crop.lower() if crop else 'the crop'} and check wind before spraying."
    )
    return {
        "state": state,
        "district": district,
        "condition": condition,
        "temperature": f"{round(float(temp_value))}C" if temp_value is not None else "NA",
        "humidity": f"{round(float(humidity_value))}%" if humidity_value is not None else "NA",
        "wind": f"{round(float(wind_value))} km/h" if wind_value is not None else "NA",
        "rain_probability": f"{round(float(rain_probability))}%" if rain_probability is not None else "NA",
        "advisory": advisory,
        "source": f"open-meteo ({location_source})",
    }


def normalize_market_rows(
    rows: list[dict[str, Any]],
    *,
    state: str,
    district: str,
    crop: str,
    source: str,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for row in rows:
        commodity = row.get("crop") or row.get("commodity") or row.get("Commodity") or crop or "Crop"
        mandi_name = row.get("mandi_name") or row.get("market") or row.get("Market") or row.get("market_name") or f"{district} Mandi"
        variety = row.get("variety") or row.get("Variety") or "Local"
        price = row.get("price") or row.get("modal_price") or row.get("Modal_Price") or row.get("modalPrice")
        if price is None:
            continue
        trend = row.get("trend") or row.get("price_trend") or row.get("Trend") or f"Fresh market feed for {commodity.lower()}."
        normalized.append(
            {
                "state": row.get("state") or row.get("State") or state,
                "district": row.get("district") or row.get("District") or district,
                "mandi_name": str(mandi_name),
                "crop": str(commodity),
                "variety": str(variety),
                "price": str(price),
                "trend": str(trend),
                "source": source,
            }
        )
    return normalized


def fetch_live_market_prices(state: str, district: str, crop: str) -> Optional[list[dict[str, str]]]:
    if MARKET_FEED_URL:
        payload = fetch_json_sync(MARKET_FEED_URL, params={"state": state, "district": district, "crop": crop})
        rows = payload.get("records") if isinstance(payload, dict) else payload
        if isinstance(rows, list):
            return normalize_market_rows(rows, state=state, district=district, crop=crop, source="custom-market-feed")

    if DATA_GOV_API_KEY and AGMARKNET_RESOURCE_ID:
        payload = fetch_json_sync(
            f"https://api.data.gov.in/resource/{AGMARKNET_RESOURCE_ID}",
            params={
                "api-key": DATA_GOV_API_KEY,
                "format": "json",
                "limit": 12,
                "filters[state]": state,
                "filters[district]": district,
                "filters[commodity]": crop,
            },
        )
        rows = payload.get("records") or []
        if rows:
            return normalize_market_rows(rows, state=state, district=district, crop=crop, source="agmarknet")
    return None


def replace_market_rows(db: Session, state: str, district: str, rows: list[dict[str, str]]) -> None:
    db.query(MandiPrice).filter(MandiPrice.state == state, MandiPrice.district == district).delete()
    for row in rows:
        db.add(MandiPrice(**row))


def sync_order_timeline(db: Session, order: OrderRecord) -> None:
    existing = {
        row.status
        for row in db.query(OrderStatusEvent).filter(OrderStatusEvent.order_code == order.order_code).all()
    }
    timeline = [("Order placed", "Order received; awaiting verified fulfillment updates.")]

    for status, note in timeline:
        if status in existing:
            continue
        db.add(OrderStatusEvent(order_code=order.order_code, status=status, note=note, source="system"))
        if not order.status:
            order.status = status


def serialize_order(db: Session, order: OrderRecord) -> dict[str, Any]:
    sync_order_timeline(db, order)
    events = (
        db.query(OrderStatusEvent)
        .filter(OrderStatusEvent.order_code == order.order_code)
        .order_by(OrderStatusEvent.created_at.asc(), OrderStatusEvent.id.asc())
        .all()
    )
    return {
        "order_code": order.order_code,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "delivery_address": order.delivery_address,
        "payment_method": order.payment_method,
        "items": order.item_summary,
        "item_count": order.item_count,
        "total": order.total,
        "status": order.status,
        "created_at": str(order.created_at),
        "timeline": [
            {"status": event.status, "note": event.note or "", "created_at": str(event.created_at)}
            for event in events
        ],
    }


def refresh_live_operating_data(db: Session, user: User | None, force: bool = False) -> dict[str, dict[str, str]]:
    ensure_inventory_seed(db)
    ensure_scheme_snapshots(db, user)
    if not user:
        return {
            "weather": {"state": "unavailable", "source": "no-user"},
            "market": {"state": "unavailable", "source": "no-user"},
            "schemes": {"state": "ready", "source": "rules"},
        }

    state = user.state or ""
    district = user.district or ""
    crop = user.crop_name or "Wheat"
    profile = get_or_create_farm_profile(db, user.id)

    weather_row = (
        db.query(WeatherSnapshot)
        .filter(WeatherSnapshot.state == state, WeatherSnapshot.district == district)
        .order_by(WeatherSnapshot.captured_at.desc())
        .first()
    )
    market_row = (
        db.query(MandiPrice)
        .filter(MandiPrice.state == state, MandiPrice.district == district)
        .order_by(MandiPrice.captured_at.desc())
        .first()
    )

    weather_status = {"state": "cached" if weather_row else "missing", "source": weather_row.source if weather_row else "none"}
    market_status = {"state": "cached" if market_row else "missing", "source": market_row.source if market_row else "none"}

    if force or not is_recent(getattr(weather_row, "captured_at", None)):
        try:
            live_weather = fetch_live_weather_snapshot(state, district, crop, profile)
            if live_weather:
                db.query(WeatherSnapshot).filter(WeatherSnapshot.state == state, WeatherSnapshot.district == district).delete()
                db.add(WeatherSnapshot(**live_weather))
                weather_status = {"state": "live", "source": live_weather["source"]}
        except Exception:
            weather_status["state"] = "cached" if weather_row else "unavailable"

    if force or not is_recent(getattr(market_row, "captured_at", None)):
        try:
            live_market_rows = fetch_live_market_prices(state, district, crop)
            if live_market_rows:
                replace_market_rows(db, state, district, live_market_rows)
                market_status = {"state": "live", "source": live_market_rows[0]["source"]}
        except Exception:
            market_status["state"] = "cached" if market_row else "unavailable"

    weather_exists = db.query(WeatherSnapshot).filter(WeatherSnapshot.state == state, WeatherSnapshot.district == district).first()
    mandi_exists = db.query(MandiPrice).filter(MandiPrice.state == state, MandiPrice.district == district).first()
    if not weather_exists or not mandi_exists:
        ensure_seed_operating_data(db, user)
        if not weather_exists:
            weather_status = {"state": "unavailable", "source": "none"}
        if not mandi_exists:
            market_status = {"state": "unavailable", "source": "none"}
    else:
        db.commit()

    return {
        "weather": weather_status,
        "market": market_status,
        "schemes": {"state": "ready", "source": "live-feed" if SCHEME_FEED_URL else "rules"},
    }


def create_market_alert_notifications(db: Session, state: str, district: str) -> None:
    subscriptions = (
        db.query(MarketAlertSubscription)
        .filter(
            MarketAlertSubscription.is_active.is_(True),
            ((MarketAlertSubscription.state.is_(None)) | (MarketAlertSubscription.state == state)),
            ((MarketAlertSubscription.district.is_(None)) | (MarketAlertSubscription.district == district)),
        )
        .all()
    )
    if not subscriptions:
        return

    latest_prices = (
        db.query(MandiPrice)
        .filter(MandiPrice.state == state, MandiPrice.district == district)
        .order_by(MandiPrice.captured_at.desc())
        .all()
    )
    latest_by_crop = {row.crop.strip().lower(): row for row in latest_prices if row.crop}
    for subscription in subscriptions:
        row = latest_by_crop.get(subscription.crop.strip().lower())
        current_price = coerce_price_number(getattr(row, "price", None))
        target_price = coerce_price_number(subscription.target_price)
        if not row or current_price is None or target_price is None or current_price < target_price:
            continue

        duplicate = (
            db.query(AlertRecord)
            .filter(
                AlertRecord.user_id == subscription.user_id,
                AlertRecord.category == "market-alert",
                AlertRecord.crop == subscription.crop,
                AlertRecord.district == district,
                AlertRecord.created_at >= (now_utc() - timedelta(hours=18)),
            )
            .first()
        )
        if duplicate:
            continue
        db.add(
            AlertRecord(
                user_id=subscription.user_id,
                state=state,
                district=district,
                crop=subscription.crop,
                severity="medium",
                title=f"{subscription.crop.title()} target reached",
                body=f"{row.mandi_name} is showing around Rs {current_price}/qtl, above your target of Rs {target_price}/qtl.",
                category="market-alert",
                source=row.source or "market-feed",
            )
        )


def decrement_inventory_for_order(db: Session, items: list[OrderItemRequest]) -> None:
    for item in items:
        inventory = db.query(InventoryItem).filter(InventoryItem.product_id == item.product_id).first()
        if not inventory:
            continue
        inventory.stock_count = max(0, int(inventory.stock_count or 0) - max(0, int(item.qty or 0)))


def build_seed_weather(state: str, district: str, crop: str) -> dict[str, str]:
    crop_name = crop or "Wheat"
    return {
        "state": state or "Maharashtra",
        "district": district or "Pune",
        "condition": "Partly cloudy with good field windows",
        "temperature": "29C",
        "humidity": "66%",
        "wind": "12 km/h",
        "rain_probability": "24%",
        "advisory": f"Good spray window for {crop_name.lower()} before late afternoon humidity increases.",
    }


def build_seed_markets(state: str, district: str, crop: str) -> list[dict[str, str]]:
    primary_crop = crop or "Wheat"
    crops = [primary_crop, "Paddy", "Cotton", "Soybean"]
    base_prices = {
        "Wheat": "2425",
        "Paddy": "2180",
        "Cotton": "6940",
        "Soybean": "4860",
        "Sugarcane": "340",
    }
    return [
        {
            "state": state or "Maharashtra",
            "district": district or "Pune",
            "mandi_name": f"{district or 'Pune'} Agri Market",
            "crop": item,
            "variety": "Local",
            "price": base_prices.get(item, "2500"),
            "trend": f"Healthy arrivals and buyer interest for {item.lower()} in nearby mandis.",
        }
        for item in crops
    ]


def build_seed_alerts(user: User | None) -> list[dict[str, str]]:
    district = getattr(user, "district", None) or ""
    crop = getattr(user, "crop_name", None) or "Wheat"
    return [
        {
            "severity": "medium",
            "title": "Spray window watch",
            "body": f"{district} is showing a cleaner spray window in the next 4 to 6 hours for {crop.lower()}.",
            "category": "weather",
        },
        {
            "severity": "low",
            "title": "Market movement",
            "body": f"Nearby mandi prices for {crop.lower()} are stable with slight upside support.",
            "category": "market",
        },
    ]


def ensure_seed_operating_data(db: Session, user: User | None) -> None:
    if user:
        get_or_create_farm_profile(db, user.id)
        db.commit()


def send_otp_via_provider(phone_number: str, otp_code: str, channel: str) -> dict[str, str]:
    provider = (os.getenv("OTP_PROVIDER") or "mock").lower()
    if provider == "mock":
        raise HTTPException(
            status_code=503,
            detail=(
                "OTP provider is not configured. Set OTP_PROVIDER and the provider credentials "
                "to send real OTPs over SMS or WhatsApp."
            ),
        )

    if provider != "twilio":
        raise HTTPException(status_code=500, detail=f"Unsupported OTP provider: {provider}")

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    sms_from = os.getenv("TWILIO_SMS_FROM")
    whatsapp_from = os.getenv("TWILIO_WHATSAPP_FROM")

    if not account_sid or not auth_token:
        raise HTTPException(status_code=503, detail="Twilio credentials are missing on the server.")

    normalized_channel = (channel or "sms").strip().lower()
    normalized_phone = normalize_indian_phone_number(phone_number)
    message_body = build_otp_message(otp_code)

    if normalized_channel == "whatsapp":
        if not whatsapp_from:
            raise HTTPException(status_code=503, detail="WhatsApp OTP is not configured on the server.")
        to_value = f"whatsapp:{normalized_phone}"
        from_value = whatsapp_from if whatsapp_from.startswith("whatsapp:") else f"whatsapp:{whatsapp_from}"
    else:
        if not sms_from:
            raise HTTPException(status_code=503, detail="SMS OTP is not configured on the server.")
        normalized_channel = "sms"
        to_value = normalized_phone
        from_value = sms_from

    try:
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
            data={
                "To": to_value,
                "From": from_value,
                "Body": message_body,
            },
            auth=(account_sid, auth_token),
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Could not reach the OTP delivery provider.") from exc

    try:
        response_data = response.json()
    except ValueError:
        response_data = {}

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=response_data.get("message") or "The OTP delivery provider rejected the request.",
        )

    return {
        "status": response_data.get("status") or "queued",
        "provider_reference": response_data.get("sid") or f"twilio-{phone_number[-4:]}",
        "provider_message": f"OTP queued through Twilio over {normalized_channel}.",
    }


def register_verified_user(db: Session, payload: dict, channel: str, phone_verified: bool = True) -> User:
    new_user = User(
        name=payload["name"],
        email=normalize_email(payload["email"]),
        password=payload["password_hash"] if payload.get("password_hash") else hash_password(payload["password"]),
        mobile_number=normalize_indian_phone_number(payload["mobile_number"]),
        date_of_birth=payload["date_of_birth"],
        state=payload["state"],
        district=payload["district"],
        preferred_language=payload.get("preferred_language") or "English",
        simple_mode="off",
        role=payload.get("role") if payload.get("role") in {"farmer", "advisor", "buyer"} else "farmer",
        phone_verified=phone_verified,
        otp_channel=channel,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    ensure_seed_operating_data(db, new_user)
    return new_user


def update_user_profile(user: User, payload: "ProfileUpdateRequest") -> None:
    for field in [
        "crop_name",
        "land_size",
        "soil_type",
        "season",
        "state",
        "district",
        "village",
        "preferred_language",
        "simple_mode",
    ]:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(user, field, value)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    language: str = "English"
    user_id: Optional[int] = Field(default=None, gt=0)
    explain_simply: bool = False

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Please enter a question")
        return value

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        if value not in LANGUAGE_CODES and value != "Auto":
            raise ValueError("Unsupported language")
        return value


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6, max_length=72)
    mobile_number: str
    date_of_birth: str
    state: str
    district: str
    preferred_language: str = "English"
    otp_channel: str = "sms"
    role: str = "farmer"


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=72)


class PostCreate(BaseModel):
    content: str
    user_id: int


class ReactionRequest(BaseModel):
    post_id: int
    emoji: str


class PostUpdate(BaseModel):
    post_id: int
    user_id: int
    content: str


class PostDelete(BaseModel):
    post_id: int
    user_id: int


class CommentCreate(BaseModel):
    post_id: int
    user_id: int
    text: str = Field(min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def readable_comment(cls, value):
        if not value.strip():
            raise ValueError("Comment cannot be blank")
        return value.strip()


class ProfileUpdateRequest(BaseModel):
    user_id: int
    crop_name: Optional[str] = None
    land_size: Optional[str] = None
    soil_type: Optional[str] = None
    season: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    village: Optional[str] = None
    preferred_language: Optional[str] = None
    simple_mode: Optional[str] = None


class OtpSendRequest(RegisterRequest):
    pass


class OtpVerifyRequest(BaseModel):
    phone_number: str
    email: str
    otp: str
    otp_channel: str = "sms"


class FarmProfileRequest(BaseModel):
    user_id: int
    farm_name: Optional[str] = None
    primary_crop: Optional[str] = None
    irrigation_type: Optional[str] = None
    livestock: Optional[str] = None
    taluka: Optional[str] = None
    pin_code: Optional[str] = None
    lat: Optional[str] = None
    lng: Optional[str] = None


class ExplainRequest(BaseModel):
    text: str
    language: str = "English"


class IntelligenceRequest(BaseModel):
    user_id: Optional[int] = None
    crop_name: Optional[str] = None
    land_size: Optional[str] = None
    soil_type: Optional[str] = None
    season: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    village: Optional[str] = None
    preferred_language: Optional[str] = None
    horizon: Optional[str] = "weekly"


class InventoryUpdateRequest(BaseModel):
    product_id: str
    product_name: str
    category: Optional[str] = None
    seller: Optional[str] = None
    stock_count: int
    unit: Optional[str] = None
    price: Optional[str] = None
    price_source: Optional[str] = "admin"


class OrderItemRequest(BaseModel):
    product_id: str
    name: str
    qty: int
    price: Optional[float] = 0


class OrderCreateRequest(BaseModel):
    user_id: Optional[int] = None
    customer_name: str
    customer_phone: Optional[str] = None
    delivery_address: str
    payment_method: Optional[str] = "COD"
    items: list[OrderItemRequest]
    total: float


class OrderStatusUpdateRequest(BaseModel):
    order_code: str
    status: str
    note: Optional[str] = None


class DemandSignalRequest(BaseModel):
    user_id: Optional[int] = None
    product_id: str
    product_name: Optional[str] = None
    signal_type: str


class MarketAlertRequest(BaseModel):
    user_id: Optional[int] = None
    crop: str
    target_price: str
    district: Optional[str] = None
    state: Optional[str] = None
    channel: Optional[str] = "in_app"


class ProduceListingRequest(BaseModel):
    user_id: Optional[int] = None
    seller_name: str
    seller_phone: Optional[str] = None
    seller_location: Optional[str] = None
    crop_name: str
    category: Optional[str] = "vegetable"
    quantity: int
    unit: str = "kg"
    price_per_unit: str
    harvest_date: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None


class ProduceOrderRequest(BaseModel):
    user_id: Optional[int] = None
    buyer_name: str
    buyer_phone: Optional[str] = None
    delivery_address: str
    payment_method: Optional[str] = "COD"
    listing_code: str
    quantity: int


def merge_request_profile(db: Session, request: IntelligenceRequest) -> dict:
    user = get_user_by_id(db, request.user_id)
    profile = merge_profile(user)
    farm_profile = db.query(FarmProfile).filter(FarmProfile.user_id == request.user_id).first() if request.user_id else None
    profile = merge_farm_profile_context(profile, farm_profile)
    for field in ["crop_name", "land_size", "soil_type", "season", "state", "district", "village", "preferred_language"]:
        value = getattr(request, field, None)
        if value:
            profile[field] = value
    return profile


class BasicRegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name", "email")
    @classmethod
    def clean_identity(cls, value, info):
        value = value.strip()
        if not value or (info.field_name == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value)):
            raise ValueError("Enter a valid name and email address")
        return value


@app.get("/auth/config")
def auth_config():
    return {"basic_registration": os.getenv("BASIC_REGISTRATION", "false").lower() == "true"}


@app.post("/auth/register-basic", status_code=201)
def register_basic(req: BasicRegisterRequest, db: Session = Depends(get_session)):
    if not auth_config()["basic_registration"]:
        raise HTTPException(404, "Basic registration is disabled")
    email = normalize_email(req.email)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account already exists with this email")
    user = User(name=req.name, email=email, password=hash_password(req.password),
                role="farmer", phone_verified=False, preferred_language="English", simple_mode="off")
    db.add(user)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(409, "An account already exists with this email")
        raise
    return {"message": "Account created. You can now log in.", "phone_verified": False}


@app.post("/register")
def register_user(req: RegisterRequest, db: Session = Depends(get_session)):
    normalized_email = normalize_email(req.email)
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(409, "User already registered with this email.")
    return {"message": "Use OTP verification flow.", "requires_otp": True}


@app.post("/auth/send-registration-otp")
def send_registration_otp(req: OtpSendRequest, db: Session = Depends(get_session)):
    normalized_email = normalize_email(req.email)
    normalized_mobile = normalize_indian_phone_number(req.mobile_number)
    mobile_candidates = phone_lookup_values(req.mobile_number)
    existing_user = (
        db.query(User)
        .filter((User.email == normalized_email) | (User.mobile_number.in_(mobile_candidates)))
        .first()
    )
    if existing_user:
        raise HTTPException(409, "User already registered with this email or phone number.")

    latest_session = (
        db.query(OtpSession)
        .filter(
            OtpSession.phone_number.in_(mobile_candidates),
            OtpSession.email == normalized_email,
            OtpSession.purpose == "register",
        )
        .order_by(OtpSession.created_at.desc())
        .first()
    )
    if latest_session and latest_session.created_at:
        retry_after = latest_session.created_at + timedelta(seconds=OTP_RESEND_SECONDS)
        if latest_session.status == "sent" and retry_after > now_utc():
            wait_seconds = int((retry_after - now_utc()).total_seconds())
            raise HTTPException(429, "Please wait before requesting another OTP.", headers={"Retry-After": str(max(wait_seconds, 1))})

    otp_code = generate_otp()
    payload = req.model_dump()
    payload["password_hash"] = hash_password(payload.pop("password"))
    payload["email"] = normalized_email
    payload["mobile_number"] = normalized_mobile
    if req.otp_channel == "manual":
        raise HTTPException(503, "Phone verification requires a configured SMS or WhatsApp provider.")
    provider_status = send_otp_via_provider(req.mobile_number, otp_code, req.otp_channel)
    resolved_channel = req.otp_channel
    manual_fallback = False
    otp_session = OtpSession(
        phone_number=normalized_mobile,
        email=normalized_email,
        purpose="register",
        channel=resolved_channel,
        otp_hash=hash_otp(otp_code),
        pending_payload=json.dumps(payload),
        status="sent",
        provider_reference=provider_status.get("provider_reference"),
        provider_message=provider_status.get("provider_message"),
        expires_at=now_utc() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.add(otp_session)
    db.commit()
    db.refresh(otp_session)

    response = {
        "message": manual_fallback
        and "Temporary verification code is ready. Phone verification will stay pending until SMS is connected."
        or f"OTP sent to {normalized_mobile} via {req.otp_channel}.",
        "otp_session_id": otp_session.id,
        "channel": resolved_channel,
        "expires_in_seconds": OTP_EXPIRY_MINUTES * 60,
        "provider_status": provider_status.get("status"),
        "provider_message": provider_status.get("provider_message"),
    }
    return response


@app.post("/auth/verify-registration-otp")
def verify_registration_otp(req: OtpVerifyRequest, response: Response, db: Session = Depends(get_session)):
    normalized_email = normalize_email(req.email)
    normalized_mobile = normalize_indian_phone_number(req.phone_number)
    mobile_candidates = phone_lookup_values(req.phone_number)
    entered_otp = (req.otp or "").strip()
    otp_session = (
        db.query(OtpSession)
        .filter(
            OtpSession.phone_number.in_(mobile_candidates),
            OtpSession.email == normalized_email,
            OtpSession.purpose == "register",
            OtpSession.channel == req.otp_channel,
        )
        .order_by(OtpSession.created_at.desc())
        .first()
    )
    if not otp_session:
        otp_session = (
            db.query(OtpSession)
            .filter(
                OtpSession.phone_number.in_(mobile_candidates),
                OtpSession.email == normalized_email,
                OtpSession.purpose == "register",
            )
            .order_by(OtpSession.created_at.desc())
            .first()
        )
    if not otp_session:
        raise HTTPException(404, "OTP session not found.")
    if otp_session.channel == "manual":
        raise HTTPException(400, "Request a new code through a phone provider.")
    if otp_session.status == "verified":
        raise HTTPException(409, "This OTP has already been used.")
    if otp_session.expires_at < now_utc():
        otp_session.status = "expired"
        db.commit()
        raise HTTPException(400, "OTP expired. Please request a new OTP.")

    if (otp_session.attempt_count or 0) >= 5:
        raise HTTPException(429, "Too many incorrect codes. Request a new OTP.")
    otp_session.attempt_count = (otp_session.attempt_count or 0) + 1
    if otp_session.otp_hash != hash_otp(entered_otp):
        db.commit()
        raise HTTPException(400, "Invalid OTP. Please try again.")

    pending_payload = json.loads(otp_session.pending_payload or "{}")
    existing_user = (
        db.query(User)
        .filter((User.email == normalized_email) | (User.mobile_number.in_(mobile_candidates)))
        .first()
    )
    if existing_user:
        raise HTTPException(409, "User already registered with this email or phone number.")

    phone_verified = otp_session.channel != "manual"
    new_user = register_verified_user(db, pending_payload, otp_session.channel, phone_verified=phone_verified)
    otp_session.status = "verified"
    otp_session.pending_payload = None
    otp_session.verified_at = now_utc()
    db.commit()

    issue_session(response, new_user.id, new_user.role)
    return {
        "message": "Registration successful!",
        "user_id": new_user.id,
        "user": new_user.name,
        "email": new_user.email,
        "mobile_number": new_user.mobile_number,
        "state": new_user.state,
        "district": new_user.district,
        "phone_verified": new_user.phone_verified,
        "role": new_user.role,
    }


@app.post("/login")
def login_user(req: LoginRequest, response: Response, db: Session = Depends(get_session)):
    normalized_email = normalize_email(req.email)

    if is_admin_credentials(normalized_email, req.password):
        issue_session(response, 0, "admin")
        return {
            "message": "Login successful!",
            "user": ADMIN_NAME,
            "user_id": 0,
            "email": ADMIN_EMAIL,
            "mobile_number": "",
            "date_of_birth": "",
            "state": "Maharashtra",
            "district": "Pune",
            "crop_name": "Tomato",
            "land_size": "",
            "soil_type": "",
            "season": "",
            "village": "",
            "preferred_language": "English",
            "simple_mode": "off",
            "phone_verified": True,
            "role": "admin",
        }

    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(401, "Invalid email or password.")
    if not user.password.startswith("bcrypt_sha256$"):
        user.password = hash_password(req.password)
        db.commit()

    issue_session(response, user.id, user.role)
    return {
        "message": "Login successful!",
        "user": user.name,
        "user_id": user.id,
        "email": user.email,
        "mobile_number": user.mobile_number,
        "date_of_birth": user.date_of_birth,
        "state": user.state,
        "district": user.district,
        "crop_name": user.crop_name,
        "land_size": user.land_size,
        "soil_type": user.soil_type,
        "season": user.season,
        "village": user.village,
        "preferred_language": user.preferred_language,
        "simple_mode": user.simple_mode,
        "phone_verified": user.phone_verified,
        "role": user.role,
    }



@app.get("/admin/analytics")
def get_admin_analytics(user_email: str = Query(""), timeframe: str = Query("all"), db: Session = Depends(get_session)):

    return build_admin_analytics(db, timeframe)



@app.get("/profile/{user_id}")
def get_profile(user_id: int, db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    memory_rows = (
        db.query(QueryMemory)
        .filter(QueryMemory.user_id == user_id)
        .order_by(QueryMemory.timestamp.desc())
        .limit(10)
        .all()
    )

    farm_profile = db.query(FarmProfile).filter(FarmProfile.user_id == user_id).first()
    return {
        "profile": merge_farm_profile_context(merge_profile(user), farm_profile),
        "farm_profile": serialize_farm_profile(farm_profile),
        "memory": [
            {
                "question": row.question,
                "answer": row.answer,
                "language": row.language,
                "context_tag": row.context_tag,
                "timestamp": str(row.timestamp),
            }
            for row in memory_rows
        ],
    }


@app.post("/profile/preferences")
def update_profile_preferences(req: ProfileUpdateRequest, db: Session = Depends(get_session)):
    user = get_user_by_id(db, req.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    update_user_profile(user, req)
    ensure_seed_operating_data(db, user)
    db.commit()
    return {"message": "Profile preferences updated", "profile": merge_profile(user)}


@app.get("/farm-profile/{user_id}")
def get_farm_profile(user_id: int, db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    profile = get_or_create_farm_profile(db, user_id)
    return {"farm_profile": serialize_farm_profile(profile)}


@app.post("/farm-profile")
def save_farm_profile(req: FarmProfileRequest, db: Session = Depends(get_session)):
    user = get_user_by_id(db, req.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    profile = get_or_create_farm_profile(db, req.user_id)
    for field in ["farm_name", "primary_crop", "irrigation_type", "livestock", "taluka", "pin_code", "lat", "lng"]:
        value = getattr(req, field, None)
        if value is not None:
            setattr(profile, field, value)
    if req.primary_crop:
        user.crop_name = req.primary_crop
    db.commit()
    ensure_seed_operating_data(db, user)
    return {"message": "Farm profile saved", "farm_profile": serialize_farm_profile(profile)}


@app.post("/ops/live-sync")
def sync_live_feeds(user_id: Optional[int] = Query(default=None), force: bool = Query(default=False), db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    status = refresh_live_operating_data(db, user, force=force)
    if user:
        create_market_alert_notifications(db, user.state or "Maharashtra", user.district or "Pune")
        db.commit()
    return {"message": "Live feed sync complete", "data_status": status}


@app.get("/ops/feed-status")
def get_feed_status(user_id: Optional[int] = Query(default=None), db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    state = getattr(user, "state", None) or ""
    district = getattr(user, "district", None) or ""
    weather_row = (
        db.query(WeatherSnapshot)
        .filter(WeatherSnapshot.state == state, WeatherSnapshot.district == district)
        .order_by(WeatherSnapshot.captured_at.desc())
        .first()
    )
    market_row = (
        db.query(MandiPrice)
        .filter(MandiPrice.state == state, MandiPrice.district == district)
        .order_by(MandiPrice.captured_at.desc())
        .first()
    )
    latest_scheme = db.query(SchemeSnapshot).order_by(SchemeSnapshot.captured_at.desc()).first()
    return {
        "weather": {
            "source": getattr(weather_row, "source", "none"),
            "captured_at": str(getattr(weather_row, "captured_at", "")),
            "status": "demo" if getattr(weather_row, "source", "") == "seed" else ("fresh" if is_recent(getattr(weather_row, "captured_at", None)) else "stale"),
        },
        "market": {
            "source": getattr(market_row, "source", "none"),
            "captured_at": str(getattr(market_row, "captured_at", "")),
            "status": "demo" if getattr(market_row, "source", "") == "seed" else ("fresh" if is_recent(getattr(market_row, "captured_at", None)) else "stale"),
        },
        "schemes": {
            "source": getattr(latest_scheme, "source", "none"),
            "captured_at": str(getattr(latest_scheme, "captured_at", "")),
            "status": ("unverified" if latest_scheme.source == "rules" else ("fresh" if is_recent(latest_scheme.captured_at) else "stale")) if latest_scheme else "missing",
        },
    }


@app.get("/shop/inventory")
def get_shop_inventory(db: Session = Depends(get_session)):
    ensure_inventory_seed(db)
    items = db.query(InventoryItem).order_by(InventoryItem.updated_at.desc(), InventoryItem.product_name.asc()).all()
    return {
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "category": item.category,
                "seller": item.seller,
                "stock_count": item.stock_count,
                "unit": item.unit,
                "price": item.price,
                "price_source": item.price_source,
                "source": item.source,
                "updated_at": str(item.updated_at),
            }
            for item in items
        ]
    }


@app.post("/admin/inventory/upsert")
def upsert_inventory_item(req: InventoryUpdateRequest, user_email: str = Query(""), db: Session = Depends(get_session)):

    item = db.query(InventoryItem).filter(InventoryItem.product_id == req.product_id).first()
    if not item:
        item = InventoryItem(product_id=req.product_id, product_name=req.product_name)
        db.add(item)
    item.product_name = req.product_name
    item.category = req.category
    item.seller = req.seller
    item.stock_count = max(0, req.stock_count)
    item.unit = req.unit
    item.price = req.price
    item.price_source = req.price_source or "admin"
    item.source = "admin"
    db.commit()
    return {"message": "Inventory updated"}



@app.post("/shop/demand-signal")
def create_demand_signal(req: DemandSignalRequest, db: Session = Depends(get_session)):
    db.add(
        DemandSignal(
            user_id=req.user_id,
            product_id=req.product_id,
            product_name=req.product_name,
            signal_type=req.signal_type,
            source="frontend",
        )
    )
    db.commit()
    return {"message": "Demand signal captured"}


@app.get("/admin/commerce-overview")
def get_commerce_overview(user_email: str = Query(""), db: Session = Depends(get_session)):

    ensure_inventory_seed(db)
    inventory_rows = db.query(InventoryItem).order_by(InventoryItem.stock_count.asc(), InventoryItem.product_name.asc()).all()
    demand_rows = (
        db.query(
            DemandSignal.product_id,
            DemandSignal.product_name,
            func.count(DemandSignal.id).label("count"),
        )
        .group_by(DemandSignal.product_id, DemandSignal.product_name)
        .order_by(func.count(DemandSignal.id).desc(), DemandSignal.product_name.asc())
        .limit(8)
        .all()
    )
    order_rows = db.query(OrderRecord).order_by(OrderRecord.created_at.desc()).limit(10).all()
    return {
        "inventory": [
            {
                "product_id": row.product_id,
                "product_name": row.product_name,
                "stock_count": row.stock_count,
                "seller": row.seller,
                "price": row.price,
                "updated_at": str(row.updated_at),
            }
            for row in inventory_rows
        ],
        "demand": [
            {
                "product_id": row.product_id,
                "product_name": row.product_name or row.product_id,
                "count": row.count,
            }
            for row in demand_rows
        ],
        "orders": [serialize_order(db, row) for row in order_rows],
    }



@app.post("/shop/orders")
def create_shop_order(req: OrderCreateRequest, db: Session = Depends(get_session)):
    ensure_inventory_seed(db)
    order_code = f"AG-{int(datetime.now(timezone.utc).timestamp())}-{random.randint(100, 999)}"
    order = OrderRecord(
        order_code=order_code,
        user_id=req.user_id,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        delivery_address=req.delivery_address,
        payment_method=req.payment_method,
        item_summary=", ".join(f"{item.name} x{item.qty}" for item in req.items),
        item_count=sum(max(0, item.qty) for item in req.items),
        total=str(round(req.total, 2)),
        status="Order placed",
        source="shop",
    )
    db.add(order)
    decrement_inventory_for_order(db, req.items)
    for item in req.items:
        db.add(DemandSignal(user_id=req.user_id, product_id=item.product_id, product_name=item.name, signal_type="ordered", source="order"))
    db.flush()
    sync_order_timeline(db, order)
    db.commit()
    return {"message": "Order created", "order": serialize_order(db, order)}


@app.get("/shop/orders")
def list_shop_orders(user_id: Optional[int] = Query(default=None), db: Session = Depends(get_session)):
    query = db.query(OrderRecord)
    if user_id:
        query = query.filter(OrderRecord.user_id == user_id)
    rows = query.order_by(OrderRecord.created_at.desc()).limit(12).all()
    payload = [serialize_order(db, row) for row in rows]
    db.commit()
    return {"orders": payload}


@app.post("/shop/orders/status")
def update_shop_order_status(req: OrderStatusUpdateRequest, user_email: str = Query(""), db: Session = Depends(get_session)):

    order = db.query(OrderRecord).filter(OrderRecord.order_code == req.order_code).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = req.status
    db.add(OrderStatusEvent(order_code=req.order_code, status=req.status, note=req.note or "", source="admin"))
    db.commit()
    return {"message": "Order status updated", "order": serialize_order(db, order)}



@app.post("/market-alerts")
def create_market_alert(req: MarketAlertRequest, db: Session = Depends(get_session)):
    db.add(
        MarketAlertSubscription(
            user_id=req.user_id,
            crop=req.crop,
            target_price=req.target_price,
            district=req.district,
            state=req.state,
            channel=req.channel or "in_app",
            is_active=True,
        )
    )
    if req.state and req.district:
        create_market_alert_notifications(db, req.state, req.district)
    db.commit()
    return {"message": "Market alert saved"}


@app.get("/market-alerts")
def list_market_alerts(user_id: Optional[int] = Query(default=None), db: Session = Depends(get_session)):
    subscriptions = db.query(MarketAlertSubscription)
    notifications = db.query(AlertRecord).filter(AlertRecord.category == "market-alert")
    if user_id:
        subscriptions = subscriptions.filter(MarketAlertSubscription.user_id == user_id)
        notifications = notifications.filter(AlertRecord.user_id == user_id)
    return {
        "subscriptions": [
            {
                "crop": row.crop,
                "target_price": row.target_price,
                "district": row.district,
                "state": row.state,
                "channel": row.channel,
                "created_at": str(row.created_at),
            }
            for row in subscriptions.order_by(MarketAlertSubscription.created_at.desc()).all()
        ],
        "notifications": [
            {
                "title": row.title,
                "body": row.body,
                "severity": row.severity,
                "created_at": str(row.created_at),
            }
            for row in notifications.order_by(AlertRecord.created_at.desc()).limit(10).all()
        ],
    }


@app.get("/produce/listings")
def list_farmer_produce_listings(category: Optional[str] = Query(default=None), crop: Optional[str] = Query(default=None), db: Session = Depends(get_session)):
    ensure_produce_listing_seed(db)
    query = db.query(FarmerProduceListing).filter(FarmerProduceListing.is_active.is_(True), FarmerProduceListing.available_quantity > 0)
    if category:
        query = query.filter(FarmerProduceListing.category == category)
    if crop:
        query = query.filter(FarmerProduceListing.crop_name.ilike(f"%{crop}%"))
    rows = query.order_by(FarmerProduceListing.created_at.desc(), FarmerProduceListing.id.desc()).all()
    return {
        "listings": [
            {
                "listing_code": row.listing_code,
                "seller_name": row.seller_name,
                "seller_phone": row.seller_phone,
                "seller_location": row.seller_location,
                "crop_name": row.crop_name,
                "category": row.category,
                "quantity": row.quantity,
                "available_quantity": row.available_quantity,
                "unit": row.unit,
                "price_per_unit": row.price_per_unit,
                "harvest_date": row.harvest_date,
                "description": row.description,
                "image_url": row.image_url,
                "created_at": str(row.created_at),
            }
            for row in rows
        ]
    }


@app.post("/produce/listings")
def create_farmer_produce_listing(req: ProduceListingRequest, db: Session = Depends(get_session)):
    listing_code = f"FARM-{int(datetime.now(timezone.utc).timestamp())}-{random.randint(100, 999)}"
    listing = FarmerProduceListing(
        listing_code=listing_code,
        user_id=req.user_id,
        seller_name=req.seller_name,
        seller_phone=req.seller_phone,
        seller_location=req.seller_location,
        crop_name=req.crop_name,
        category=req.category or "vegetable",
        quantity=max(1, req.quantity),
        available_quantity=max(1, req.quantity),
        unit=req.unit or "kg",
        price_per_unit=req.price_per_unit,
        harvest_date=req.harvest_date,
        description=req.description,
        image_url=req.image_url,
        is_active=True,
    )
    db.add(listing)
    db.commit()
    return {"message": "Produce listing created", "listing_code": listing_code}


@app.post("/produce/orders")
def create_produce_order(req: ProduceOrderRequest, db: Session = Depends(get_session)):
    listing = db.query(FarmerProduceListing).filter(FarmerProduceListing.listing_code == req.listing_code, FarmerProduceListing.is_active.is_(True)).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if req.quantity <= 0 or req.quantity > (listing.available_quantity or 0):
        raise HTTPException(status_code=400, detail="Requested quantity is not available")

    unit_price = safe_float(listing.price_per_unit) or 0
    total = round(unit_price * req.quantity, 2)
    order_code = f"PM-{int(datetime.now(timezone.utc).timestamp())}-{random.randint(100, 999)}"
    order = OrderRecord(
        order_code=order_code,
        user_id=req.user_id,
        customer_name=req.buyer_name,
        customer_phone=req.buyer_phone,
        delivery_address=req.delivery_address,
        payment_method=req.payment_method,
        item_summary=f"{listing.crop_name} x{req.quantity} {listing.unit} from {listing.seller_name}",
        item_count=req.quantity,
        total=str(total),
        status="Order placed",
        source="produce-market",
    )
    listing.available_quantity = max(0, int(listing.available_quantity or 0) - req.quantity)
    if listing.available_quantity == 0:
        listing.is_active = False
    db.add(order)
    db.flush()
    sync_order_timeline(db, order)
    db.commit()
    return {
        "message": "Produce order placed",
        "order": serialize_order(db, order),
        "seller_name": listing.seller_name,
        "listing_code": listing.listing_code,
    }


@app.get("/dashboard-overview")
def dashboard_overview(user_id: Optional[int] = Query(default=None), db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    data_status = refresh_live_operating_data(db, user, force=False)
    memory_rows = []
    if user_id:
        memory_rows = (
            db.query(QueryMemory)
            .filter(QueryMemory.user_id == user_id)
            .order_by(QueryMemory.timestamp.desc())
            .limit(10)
            .all()
        )
    farm_profile = db.query(FarmProfile).filter(FarmProfile.user_id == user_id).first() if user_id else None
    merged_profile = merge_farm_profile_context(merge_profile(user), farm_profile)
    payload = build_dashboard_payload(merged_profile, memory_rows)
    payload["weather"] = {"temp":"Unavailable", "condition":"Weather not available", "advice":"Refresh live weather for your location.", "humidity":"Unavailable", "wind":"Unavailable", "rain_probability":"Unavailable", "status":"unavailable"}
    payload["markets"] = []

    state = getattr(user, "state", None) or ""
    district = getattr(user, "district", None) or ""
    weather_row = (
        db.query(WeatherSnapshot)
        .filter(WeatherSnapshot.state == state, WeatherSnapshot.district == district)
        .order_by(WeatherSnapshot.captured_at.desc())
        .first()
    )
    mandi_rows = (
        db.query(MandiPrice)
        .filter(MandiPrice.state == state, MandiPrice.district == district)
        .order_by(MandiPrice.captured_at.desc())
        .limit(6)
        .all()
    )
    alert_rows = (
        db.query(AlertRecord)
        .filter((AlertRecord.user_id == user_id) | ((AlertRecord.user_id.is_(None)) & (AlertRecord.district == district)))
        .order_by(AlertRecord.created_at.desc())
        .limit(6)
        .all()
    )
    scheme_rows = (
        db.query(SchemeSnapshot)
        .filter((SchemeSnapshot.state == state) | (SchemeSnapshot.state.is_(None)))
        .order_by(SchemeSnapshot.captured_at.desc(), SchemeSnapshot.id.desc())
        .limit(6)
        .all()
    )

    if weather_row and weather_row.source != "seed":
        payload["weather"] = {
            "source": weather_row.source,
            "observed_at": str(weather_row.captured_at),
            "status": "cached" if not is_recent(weather_row.captured_at) else "live",
            "temp": weather_row.temperature,
            "condition": weather_row.condition,
            "advice": weather_row.advisory or payload["weather"]["advice"],
            "humidity": f"Humidity {weather_row.humidity or 'unavailable'}",
            "wind": f"Wind {weather_row.wind or 'unavailable'}",
            "rain_probability": weather_row.rain_probability or "Unavailable",
        }

    if mandi_rows:
        payload["markets"] = [
            {
                "crop": row.crop,
                "price": f"Rs {row.price}",
                "trend": row.trend or "Stable market movement",
                "source": row.source,
                "observed_at": str(row.captured_at),
                "status": "reference" if row.source == "seed" else "cached",
                "mandi_name": row.mandi_name,
            }
            for row in mandi_rows
        ]

    payload["live_alerts"] = [
        {
            "severity": row.severity,
            "title": row.title,
            "body": row.body,
            "category": row.category,
        }
        for row in alert_rows if row.source != "seed"
    ]
    payload["farm_profile"] = serialize_farm_profile(farm_profile)
    payload["loan_insurance"] = loan_insurance_assistant(merged_profile)
    payload["data_status"] = data_status
    if scheme_rows:
        payload["scheme_matches"] = [
            {
                "name": row.scheme_name,
                "reason": row.summary,
                "eligibility": row.eligibility or "",
                "source": row.source or "rules",
            }
            for row in scheme_rows
        ]
    payload["platform_modules"] = {
        "phase1": [
            {"id": "otp-auth", "label": "OTP onboarding", "status": "live"},
            {"id": "farm-profile", "label": "Farm profile", "status": "live"},
            {"id": "live-weather", "label": "District weather board", "status": "live"},
            {"id": "mandi-feed", "label": "Mandi price board", "status": "live"},
        ],
        "phase2": PHASE_TWO_MODULES,
        "phase3": PHASE_THREE_MODULES,
    }
    return payload


@app.post("/ai/loan-insurance-assistant")
def ai_loan_insurance_assistant(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return loan_insurance_assistant(profile)


@app.get("/platform/modules")
def get_platform_modules():
    return {
        "phase1": [
            {"id": "otp-auth", "label": "OTP onboarding", "status": "live"},
            {"id": "farm-profile", "label": "Farm profile", "status": "live"},
            {"id": "live-weather", "label": "District weather board", "status": "live"},
            {"id": "mandi-feed", "label": "Mandi price board", "status": "live"},
        ],
        "phase2": PHASE_TWO_MODULES,
        "phase3": PHASE_THREE_MODULES,
    }


@app.get("/health", tags=["ops"])
def health_check(deep: bool = False):
    """Report database, vector index and checked model readiness honestly."""
    db_ok = check_database()
    knowledge_ok = bool(documents and retriever._idf)
    vector_status = retriever.status()
    llm_available = (retriever.llm.is_available() if deep else retriever.llm._available) if not retriever._cloud_configured() else None
    ready = db_ok and knowledge_ok
    body = {
        "status": "ok" if ready else "degraded",
        "database": "connected" if db_ok else "unavailable",
        "chatbot_ready": ready,
        "answer_capability": "model_assisted" if retriever._cloud_configured() or llm_available else "extractive",
        "answer_mode": "rag" if retriever.enabled else "extractive",
        "vector_index": vector_status,
        "ingestion": ingestion_report if deep else {k: v for k, v in ingestion_report.items() if k != "files"},
        "knowledge_status": "indexed" if knowledge_ok else "empty",
        "knowledge_freshness": "unverified",
        "knowledge_docs": len(documents),
        "retriever_terms": len(retriever._idf),
        "llm_available": llm_available,
        "generation_status": ("available" if llm_available else ("unavailable" if llm_available is False else "unchecked")) if retriever.enabled else "not_required",
        "llm_model": os.getenv("LLM_MODEL") if retriever._cloud_configured() else retriever.llm.model,
        "llm_required": False,
        "translation": "cloud API; checked on use" if os.getenv("GOOGLE_TRANSLATE_API_KEY") or os.getenv("TRANSLATION_PROVIDER") == "groq" else "local Ollama; checked on use",
        "translation_status": translation_status(),
    }
    return JSONResponse(status_code=200 if ready else 503, content=body)


@app.post("/ask")
def ask_question(req: QuestionRequest, db: Session = Depends(get_session)):
    started = time.perf_counter()
    user = get_user_by_id(db, req.user_id)
    if req.user_id and user is None:
        raise HTTPException(status_code=404, detail="Farmer profile not found")
    profile = {key: getattr(user, key, None) for key in ("state", "crop_name", "district")} if user else None
    if req.language == "Auto":
        req.language = detect_language(req.question)
    retrieval_question = req.question
    warnings = []
    # RAG searches native aliases plus audited offline farming vocabulary.
    # Preserve the actual question; external translation must not be a search
    # dependency or silently drop its restrictions, names or negation.

    result = retriever.answer(retrieval_question, profile)
    warnings.extend(result.get("warnings", []))
    answer = result["answer"]
    # Keep source wording intact: replacing terms or truncating doses can change
    # the meaning of an agricultural instruction.

    same_source_language = req.language == "Gujarati" and bool(re.search(r'[\u0a80-\u0aff]', answer))
    localized = result.get('localized_answers', {}).get(LANGUAGE_CODES.get(req.language))
    translated_answer = localized or (answer if same_source_language else translate_text(answer, req.language))
    if req.language != "English" and translated_answer == answer and not same_source_language:
        warnings.append("Answer translation is unavailable; showing the original source text.")
    if translated_answer != answer:
        warnings.append("Translated wording may differ; original source excerpts are included for verification.")
    translation_ok = same_source_language or translated_answer != answer or (req.language == "English" and not re.search(r'[\u0900-\u0aff]', answer))
    if req.language == "English" and not translation_ok:
        warnings.append("English translation is unavailable; original source wording is retained.")
    display_question = req.question
    question_translation_status = "not_required"
    if req.language == "Gujarati" and detect_language(req.question) != "Gujarati":
        try:
            display_question = translate_cached(req.question, "gu")
            question_translation_status = "translated"
        except RuntimeError:
            question_translation_status = "unavailable"
    if req.language == "Gujarati" and not translation_ok:
        translated_answer = "માફ કરશો, આ જવાબનું ગુજરાતી અનુવાદ હમણાં તૈયાર થઈ શક્યું નથી. કૃપા કરીને ફરી પ્રયાસ કરો. મૂળ સ્રોત નીચે જોઈ શકો છો."
    save_memory(db, req.user_id, req.question, translated_answer, req.language, "assistant")

    if req.language == "Gujarati":
        warnings = (["અનુવાદ અને મૂળ સ્રોતની વિગતો સરખાવો; તારીખો, રકમ અને પાત્રતા મૂળ દસ્તાવેજમાં ચકાસો."] if warnings else [])
        if not translation_ok: warnings.append("ગુજરાતી અનુવાદ ઉપલબ્ધ નથી. કૃપા કરીને ફરી પ્રયાસ કરો.")
        if question_translation_status == "unavailable": warnings.append("પ્રશ્નનો ગુજરાતી અનુવાદ થઈ શક્યો નથી; તમારો મૂળ પ્રશ્ન જાળવ્યો છે.")
    source_type = result.get("source_type", "documents")
    confidence = result["confidence"]

    return {
        "answer": translated_answer,
        "original_answer": answer,
        "display_question": display_question,
        "original_question": req.question,
        "question_translation_status": question_translation_status,
        "answer_language": req.language,
        "confidence": confidence,
        "source_type": source_type,
        "model": result.get("model"),
        "references": result.get("references", []),
        "follow_up_questions": (["માટી શું છે?", "સેન્દ્રિય ખેતી શું છે?"] if req.language == "Gujarati" and result.get("source_type") == "conversation" else result.get("follow_up_questions", [])),
        "matched_documents": result.get("matched_documents", []),
        "evidence": result.get("evidence", []),
        "answer_mode": result.get("answer_mode", "extractive"),
        "confidence_kind": "retrieval_relevance",
        "freshness": "unverified",
        "cache_hit": result.get("cache_hit", False),
        "retrieval_ms": result.get("retrieval_ms", 0),
        "generation_ms": result.get("generation_ms", 0),
        "retrieval_method": result.get("retrieval_method"),
        "context_chunks": result.get("context_chunks", 0),
        "embedding_model": result.get("embedding_model"),
        "response_ms": round((time.perf_counter() - started) * 1000, 2),
        "warnings": warnings,
        "translation_status": ("unavailable" if not translation_ok else "translated" if translated_answer != answer else
                               "not_required" if same_source_language or (req.language == "English" and not re.search(r'[\u0900-\u0dff]', answer)) else
                               "unavailable"),
    }


@app.get("/knowledge/gr/{source_id}")
def repository_gr_source(source_id: str, page: int = Query(default=1, ge=1)):
    from backend.import_maharashtra_grs import DEFAULT_CATALOG
    import sqlite3
    catalog = Path(os.getenv("GR_CATALOG_PATH", str(DEFAULT_CATALOG))).resolve()
    if source_id not in repository_source_ids or not catalog.exists():
        raise HTTPException(status_code=404, detail="GR source not found")
    from contextlib import closing
    with closing(sqlite3.connect(catalog.as_uri() + "?mode=ro", uri=True)) as connection:
        row = connection.execute("SELECT pages FROM gr_documents WHERE json_extract(metadata, '$.source_id')=?", (source_id,)).fetchone()
        if row:
            for number, text in json.loads(row[0]):
                if number == page:
                    return PlainTextResponse(text)
    raise HTTPException(status_code=404, detail="GR page not found")


@app.get("/knowledge/pdf/{source_id}")
def knowledge_pdf(source_id: str):
    paths = {d["source_path"] for d in documents if d.get("source_id") == source_id and d.get("doc_type") == "pdf"}
    if len(paths) != 1:
        raise HTTPException(status_code=404, detail="PDF source not found")
    path = Path(paths.pop()).resolve()
    try:
        path.relative_to((BASE_DIR / "backend" / "knowledge_imports").resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="PDF source not found")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF source not found")
    return FileResponse(path, media_type="application/pdf")


@app.get("/knowledge/sources/{source_name}")
def knowledge_source(source_name: str):
    # Only indexed files can be read; never accept an arbitrary filesystem path.
    paths = {str(d.get("source_path")) for d in documents if d.get("source_name") == source_name}
    if len(paths) != 1:
        raise HTTPException(status_code=404, detail="Knowledge source not found")
    path = Path(paths.pop()).resolve()
    if not path.is_file() or path.suffix.lower() not in {".html", ".csv"}:
        raise HTTPException(status_code=404, detail="Knowledge source not found")
    # Render imported markup as text so a source cannot execute scripts.
    return FileResponse(path, media_type="text/plain; charset=utf-8")


@app.post("/ai/explain-simply")
def explain_simply(req: ExplainRequest):
    # Automated word substitution can strengthen advice or remove a qualifier.
    return {"answer": translate_text(req.text, req.language),
            "warnings": ["Source wording is preserved to avoid changing agricultural instructions."]}


@app.post("/ai/daily-briefing")
def ai_daily_briefing(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return daily_briefing(profile)


@app.post("/ai/farm-planner")
def ai_farm_planner(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return generate_farm_plan(profile, req.horizon or "weekly")


@app.post("/ai/scheme-eligibility")
def ai_scheme_eligibility(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return {"matches": scheme_eligibility(profile)}


@app.post("/ai/weather-alerts")
def ai_weather_alerts(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return {"alerts": weather_alerts(profile)}


@app.post("/ai/market-prediction")
def ai_market_prediction(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return market_prediction(profile)


@app.post("/ai/pest-risk")
def ai_pest_risk(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return pest_outbreak_risk(profile)


@app.post("/ai/map-context")
def ai_map_context(req: IntelligenceRequest, db: Session = Depends(get_session)):
    profile = merge_request_profile(db, req)
    return map_context(profile)


@app.get("/ai/chat-memory/{user_id}")
def ai_chat_memory(user_id: int, db: Session = Depends(get_session)):
    rows = (
        db.query(QueryMemory)
        .filter(QueryMemory.user_id == user_id)
        .order_by(QueryMemory.timestamp.desc())
        .limit(20)
        .all()
    )
    return {
        "items": [
            {
                "question": row.question,
                "answer": row.answer,
                "language": row.language,
                "context_tag": row.context_tag,
                "timestamp": str(row.timestamp),
            }
            for row in rows
        ]
    }


@app.get("/questions/feed")
def get_question_feed(request: Request, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_session)):
    rows = (
        db.query(QueryMemory, User.name)
        .outerjoin(User, User.id == QueryMemory.user_id)
        .filter(QueryMemory.user_id == request.state.identity[0])
        .order_by(QueryMemory.timestamp.desc())
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "question": row.QueryMemory.question,
                "answer": row.QueryMemory.answer,
                "language": row.QueryMemory.language,
                "timestamp": str(row.QueryMemory.timestamp),
                "user_id": row.QueryMemory.user_id,
                "user_name": row.name or "Farmer",
            }
            for row in rows
        ]
    }


@app.post("/community/create-post")
def create_post(post: PostCreate, db: Session = Depends(get_session)):
    new_post = Post(content=post.content, user_id=post.user_id)
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    return {
        "message": "Post created successfully",
        "post": {
            "id": new_post.id,
            "content": new_post.content,
            "timestamp": new_post.timestamp,
            "user_id": new_post.user_id,
            "likes": new_post.likes,
            "dislikes": new_post.dislikes,
            "reactions": json.loads(new_post.reactions or "{}"),
        },
    }


@app.get("/community/posts")
def get_posts(limit: int = 6, offset: int = 0, search: str = "", db: Session = Depends(get_session)):
    query = db.query(Post)
    if search:
        query = query.filter(Post.content.contains(search))
    posts = query.order_by(Post.timestamp.desc()).offset(offset).limit(limit).all()

    result = []
    for post in posts:
        user = db.query(User).filter(User.id == post.user_id).first()
        try:
            reactions = json.loads(post.reactions or "{}")
        except Exception:
            reactions = {}
        result.append(
            {
                "id": post.id,
                "content": post.content,
                "user_id": post.user_id,
                "user_name": user.name if user else "Farmer",
                "timestamp": post.timestamp,
                "likes": post.likes or 0,
                "dislikes": post.dislikes or 0,
                "reactions": reactions,
            }
        )
    return result


@app.get("/community/insights")
def get_community_insights(db: Session = Depends(get_session)):
    posts = db.query(Post).order_by(Post.timestamp.desc()).limit(25).all()
    return community_insights(posts)


@app.post("/community/like/{post_id}")
def like_post(post_id: int, db: Session = Depends(get_session)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if post:
        post.likes = (post.likes or 0) + 1
        db.commit()
        return {"message": "liked", "likes": post.likes}
    raise HTTPException(404, "Post not found")


@app.post("/community/dislike/{post_id}")
def dislike_post(post_id: int, db: Session = Depends(get_session)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if post:
        post.dislikes = (post.dislikes or 0) + 1
        db.commit()
        return {"message": "disliked", "dislikes": post.dislikes}
    raise HTTPException(404, "Post not found")


@app.post("/community/react")
def react_to_post(req: ReactionRequest, db: Session = Depends(get_session)):
    post = db.query(Post).filter(Post.id == req.post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")

    try:
        reactions = json.loads(post.reactions or "{}")
    except Exception:
        reactions = {}

    reactions[req.emoji] = reactions.get(req.emoji, 0) + 1
    post.reactions = json.dumps(reactions)
    db.commit()
    return {"message": "reaction added", "reactions": reactions}


@app.put("/community/post")
def edit_post(req: PostUpdate, db: Session = Depends(get_session)):
    post = db.query(Post).filter(Post.id == req.post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.user_id != req.user_id:
        raise HTTPException(403, "Not authorized to edit this post")

    post.content = req.content
    db.commit()
    return {"message": "Post updated"}


@app.delete("/community/post")
def delete_post(req: PostDelete, db: Session = Depends(get_session)):
    post = db.query(Post).filter(Post.id == req.post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.user_id != req.user_id:
        raise HTTPException(403, "Not authorized to delete")

    db.delete(post)
    db.commit()
    return {"message": "Post deleted"}


@app.post("/community/comment")
def add_comment(comment: CommentCreate, db: Session = Depends(get_session)):
    user = db.query(User).filter(User.id == comment.user_id).first()
    if user is None or db.get(Post, comment.post_id) is None:
        raise HTTPException(status_code=404, detail="Farmer or post not found")
    db.add(Comment(post_id=comment.post_id, user_id=user.id, text=comment.text))
    db.commit()
    return {"message": "comment added"}


@app.get("/community/comments/{post_id}")
def get_comments(post_id: int, db: Session = Depends(get_session)):
    rows = db.query(Comment, User.name).join(User, Comment.user_id == User.id).filter(Comment.post_id == post_id).order_by(Comment.id).all()
    return [{"id": row.id, "text": row.text, "user_id": row.user_id, "user_name": name} for row, name in rows]


@app.post("/upload-image/")
async def upload_image(file: UploadFile = File(...), language: str = Form("English"),
                       question: str = Form(""), user_id: Optional[int] = Form(None),
                       db: Session = Depends(get_session)):
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Maximum size is 10 MB.")
    try:
        extracted_text = await run_in_threadpool(image_text, contents, language)
        lookup_text = (question.strip() + "\n" + extracted_text).strip()
        if len(lookup_text) > 2000:
            raise DocumentError("The image contains too much text for a question. Crop it to the relevant passage.")
        request = QuestionRequest(question=lookup_text, language=language, user_id=user_id)
    except (DocumentError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result = await run_in_threadpool(ask_question, request, db)
    return {**result, "extracted_text": extracted_text, "llm_response": result["answer"]}


@app.post("/ai/crop-doctor")
async def ai_crop_doctor(file: UploadFile = File(...)):
    contents = await file.read()
    diagnosis = analyze_leaf_image(contents)
    return diagnosis


@app.post("/ai/document-insights")
async def ai_document_insights(file: UploadFile = File(...), language: str = Form("English")):
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Document too large. Maximum size is 10 MB.")
    try:
        extracted_text = await run_in_threadpool(document_text, contents, file.filename, language)
    except DocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    analysis = analyze_document_text(extracted_text)
    analysis["extracted_text"] = extracted_text[:1200]
    analysis["knowledge_base_updated"] = False
    return analysis


@app.get("/", include_in_schema=False)
def serve_landing_page():
    return FileResponse(FRONTEND_DIR / "landing.html")




@app.get("/auth/me")
def current_session(request: Request):
    return {"user_id": request.state.identity[0], "role": request.state.identity[1]}

@app.post("/auth/logout")
def logout_session(request: Request, response: Response):
    revoke(request, response)
    return {"message": "Logged out"}

@app.get("/crop-decision")
def crop_decision(user_id: int, crop: str, db: Session = Depends(get_session)):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(404, "Farmer profile not found")
    rows = db.query(MandiPrice).filter(MandiPrice.state == user.state, MandiPrice.district == user.district, func.lower(MandiPrice.crop) == crop.lower(), MandiPrice.source != "seed").order_by(MandiPrice.captured_at.desc()).limit(3).all()
    observations = [{"market": r.mandi_name, "price": r.price, "source": r.source, "observed_at": str(r.captured_at)} for r in rows]
    summary = f"District: {user.district or 'not set'}. Season: {user.season or 'not set'}. "
    summary += ("Recorded market prices: " + "; ".join(f"{r.mandi_name}: Rs {r.price}/quintal ({r.captured_at})" for r in rows) + ". ") if rows else "No verified local market observations are stored for this crop. "
    summary += "Profit and grow/do-not-grow advice need local yield, soil suitability and cultivation costs; these are not inferred from price alone."
    return {"district":user.district, "season":user.season, "observations":observations, "roi":None, "summary":summary}

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
