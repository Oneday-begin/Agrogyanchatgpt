# Remediation verification — 17 October 2026

Local Ollama remains the active provider. The app is running on http://127.0.0.1:8000.

Completed changes: revocable HttpOnly sessions; server-side identity and admin checks; private history; rate limits; bcrypt-SHA256 password migration; environment-only admin configuration; removal of raw OTP responses and manual verification bypass; proper failure status codes; async HTTP transport for live feeds; official translation adapter and persistent caching; optional OpenAI/Gemini evidence selection; ranked local fallback when model services fail; core search aliases for nine languages; removal of automatic delivery progression and misleading weather, market, profit, diagnosis and expert availability claims; guest navbar correction; optional assistant orb; scoped dashboard cache; requested obsolete-file cleanup and consolidated README.

Verification:
- 68 automated tests passed, including registration with mocked SMS delivery, login, identity spoofing rejection, private history, logout revocation, rate limits and produce listing.
- 11 real local chatbot cases passed on the final running revision; detailed timings and citations are in multilingual_api_verification.json.
- Nine basic soil queries passed with simulated offline model/embedding services. This is a narrow retrieval test, not proof of general multilingual translation.
- Actual Open-Meteo geocoding and weather calls succeeded for Pune; both browser weather displays showed the same retrieved weather.
- Browser guest navbar and private-history restriction verified; Marathi soil answer displayed a source citation.
- JavaScript syntax and git whitespace checks passed.
- agrogyan.db integrity_check returned ok; table counts match the pre-remediation backup. No existing user records were removed.

Remaining configuration and limits:
- Real phone OTP requires an SMS/WhatsApp provider. The test did not send a real SMS.
- Full nine-language sentence translation needs GOOGLE_TRANSLATE_API_KEY. Offline aliases are not a translation engine.
- Paid cloud model paths are implemented but not live-tested; no cloud keys were supplied, and the user chose local Ollama.
- Live mandi feeds require DATA_GOV_API_KEY plus AGMARKNET_RESOURCE_ID or a configured market feed. Historical seeded prices are labelled reference values, not live observations.
- Crop ROI/grow recommendations, diagnosis and paid expert matching are unavailable rather than fabricated. District observations alone do not justify these predictions.
- The pasted executive categories were used; bug-report.md was not present, so this is not a verified line-by-line closure of the claimed 70-item catalog.
- Single-process rate limiting is appropriate for this local instance; a multi-worker production deployment needs a shared limiter and HTTPS cookies.

Relevant evidence: remediation-tests.log, remediation-final-live-chat.log, remediation-offline-weather.json, remediation-database-check.json. Setup instructions are consolidated in agrogyan-gpt-main/README.md and .env.example.
