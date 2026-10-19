// ===============================
// FORCE VOICE LOADING
// ===============================
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

const API_URL = window.AGRO_API_URL || "http://127.0.0.1:8000";

function getCurrentUserId() {
    return parseInt(localStorage.getItem("userId") || "0", 10) || null;
}

function getHistoryStorageKey() {
    const userId = getCurrentUserId();
    return userId ? `agroHistory_${userId}` : "agroHistory_guest";
}

function readCachedJson(key, fallback) {
    return typeof window.readAgroJson === "function" ? window.readAgroJson(key, fallback) : fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const CROP_DECISION_DATA = {
    tomato: {
        profitMultiplier: 0.32,
        risk: "Medium",
        roi: 16,
        alternative: "Capsicum",
        alternativeRoiBoost: 4,
        strongLocations: ["maharashtra", "karnataka", "andhra pradesh", "telangana"],
        weakLocations: ["rajasthan", "ladakh"],
        budgetFloor: 35000
    },
    capsicum: {
        profitMultiplier: 0.36,
        risk: "Medium",
        roi: 20,
        alternative: "Tomato",
        alternativeRoiBoost: 1,
        strongLocations: ["maharashtra", "karnataka", "himachal pradesh"],
        weakLocations: ["bihar"],
        budgetFloor: 40000
    },
    paddy: {
        profitMultiplier: 0.18,
        risk: "Low",
        roi: 12,
        alternative: "Soybean",
        alternativeRoiBoost: 2,
        strongLocations: ["west bengal", "odisha", "chhattisgarh", "telangana"],
        weakLocations: ["rajasthan"],
        budgetFloor: 25000
    },
    wheat: {
        profitMultiplier: 0.16,
        risk: "Low",
        roi: 11,
        alternative: "Mustard",
        alternativeRoiBoost: 3,
        strongLocations: ["punjab", "haryana", "uttar pradesh", "madhya pradesh"],
        weakLocations: ["kerala"],
        budgetFloor: 22000
    },
    cotton: {
        profitMultiplier: 0.24,
        risk: "High",
        roi: 15,
        alternative: "Soybean",
        alternativeRoiBoost: 2,
        strongLocations: ["maharashtra", "gujarat", "telangana"],
        weakLocations: ["kerala", "sikkim"],
        budgetFloor: 45000
    },
    soybean: {
        profitMultiplier: 0.2,
        risk: "Medium",
        roi: 13,
        alternative: "Paddy",
        alternativeRoiBoost: 1,
        strongLocations: ["madhya pradesh", "maharashtra", "rajasthan"],
        weakLocations: ["kerala"],
        budgetFloor: 24000
    },
    sugarcane: {
        profitMultiplier: 0.27,
        risk: "Medium",
        roi: 17,
        alternative: "Paddy",
        alternativeRoiBoost: 2,
        strongLocations: ["maharashtra", "uttar pradesh", "karnataka"],
        weakLocations: ["himachal pradesh"],
        budgetFloor: 50000
    },
    mustard: {
        profitMultiplier: 0.19,
        risk: "Low",
        roi: 14,
        alternative: "Wheat",
        alternativeRoiBoost: 1,
        strongLocations: ["rajasthan", "haryana", "uttar pradesh"],
        weakLocations: ["kerala"],
        budgetFloor: 18000
    },
    onion: {
        profitMultiplier: 0.3,
        risk: "Low",
        roi: 15,
        alternative: "Tomato",
        alternativeRoiBoost: 2,
        strongLocations: ["maharashtra", "madhya pradesh", "karnataka"],
        weakLocations: ["kerala"],
        budgetFloor: 28000
    }
};
let selectedEcosystemType = "mandi";
let googleMapsLoaderPromise = null;
let googleMapInstance = null;
let googleMapMarkerObjects = [];

function parseCurrencyInput(value) {
    const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
    return Number.parseFloat(cleaned || "0");
}

function formatInr(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(Number.isFinite(value) ? value : 0);
}

function getCropDecisionProfile(cropName) {
    const key = String(cropName || "").trim().toLowerCase();
    return CROP_DECISION_DATA[key] || CROP_DECISION_DATA.tomato;
}

function normalizeRecommendationText(answer) {
    const text = String(answer || "").trim();
    if (!text) {
        return "No answer found.";
    }
    return text.replace(/^result\s*:\s*/i, "").trim();
}

function getMainAnswerForSpeech(answer) {
    const normalized = normalizeRecommendationText(answer);
    const [mainAnswer] = normalized.split(/\n\s*\n\s*(?:How to use this answer:|References:|Related questions:)/i);
    return (mainAnswer || normalized).trim();
}

function updateAnswerPresentation(answer) {
    const answerBox = document.getElementById("answer");
    const answerIntro = document.getElementById("answerIntro");
    if (!answerBox) return "No answer found.";

    const normalized = normalizeRecommendationText(answer);
    answerBox.innerText = normalized;

    if (answerIntro) {
        if (normalized && !/waiting for your question/i.test(normalized)) {
            answerIntro.classList.remove("hidden");
        } else {
            answerIntro.classList.add("hidden");
        }
    }

    return normalized;
}

function hideAnswerIntro() {
    const answerIntro = document.getElementById("answerIntro");
    if (answerIntro) {
        answerIntro.classList.add("hidden");
    }
}

function getLocationScore(profile, location) {
    const normalizedLocation = String(location || "").trim().toLowerCase();
    if (!normalizedLocation) return 0;
    if (profile.strongLocations.some(item => normalizedLocation.includes(item))) return 2;
    if (profile.weakLocations.some(item => normalizedLocation.includes(item))) return -3;
    return 0;
}

function deriveRiskLevel(baseRisk, locationScore, budgetGap) {
    const levels = ["Low", "Medium", "High"];
    let index = levels.indexOf(baseRisk);
    if (index < 0) index = 1;
    if (locationScore <= -2 || budgetGap > 15000) index += 1;
    if (locationScore >= 2 && budgetGap <= 0) index -= 1;
    return levels[Math.max(0, Math.min(levels.length - 1, index))];
}

function calculateDecisionMetrics(crop, location, budget) {
    const profile = getCropDecisionProfile(crop);
    const locationScore = getLocationScore(profile, location);
    const budgetGap = Math.max(0, profile.budgetFloor - budget);
    const budgetScore = budget >= profile.budgetFloor ? 0 : budgetGap >= 15000 ? -3 : -1;
    const roi = Math.max(5, profile.roi + locationScore + budgetScore);
    const risk = deriveRiskLevel(profile.risk, locationScore, budgetGap);
    const profit = Math.round((budget || 0) * profile.profitMultiplier);
    const shouldGrow = roi >= 12 && risk !== "High";

    return {
        profile,
        roi,
        risk,
        profit,
        shouldGrow,
        budgetGap
    };
}

function populateDecisionDefaults() {
    const farm = typeof window.getAgroFarmSnapshot === "function" ? window.getAgroFarmSnapshot() : {};
    const storedCrop = farm.crop || localStorage.getItem("crop_name") || "Tomato";
    const storedLocation = [farm.city || localStorage.getItem("userDistrict"), farm.state || localStorage.getItem("userState")].filter(Boolean).join(", ") || "Maharashtra";
    const storedBudget = farm.budget || localStorage.getItem("farm_budget") || "50000";
    const profitCrop = document.getElementById("profitCrop");
    const decisionCrop = document.getElementById("decisionCrop");
    const decisionLocation = document.getElementById("decisionLocation");
    const profitInvestment = document.getElementById("profitInvestment");
    const decisionBudget = document.getElementById("decisionBudget");
    const compareOne = document.getElementById("compareCropOne");
    const compareTwo = document.getElementById("compareCropTwo");
    const compareBudget = document.getElementById("compareBudget");
    const apiKeyInput = document.getElementById("googleMapsApiKey");

    if (profitCrop) profitCrop.value = storedCrop;
    if (decisionCrop) decisionCrop.value = storedCrop;
    if (decisionLocation && !decisionLocation.value) decisionLocation.value = storedLocation;
    if (profitInvestment && !profitInvestment.value) profitInvestment.value = storedBudget;
    if (decisionBudget && !decisionBudget.value) decisionBudget.value = storedBudget;
    if (compareOne) compareOne.value = storedCrop;
    if (compareTwo && !compareTwo.value) compareTwo.value = "Onion";
    if (compareBudget && !compareBudget.value) compareBudget.value = storedBudget;
    if (apiKeyInput) apiKeyInput.value = localStorage.getItem("googleMapsApiKey") || "";
}

function runProfitCalculator() {
    const crop = document.getElementById("profitCrop")?.value || "Tomato";
    const investment = parseCurrencyInput(document.getElementById("profitInvestment")?.value);
    const profile = getCropDecisionProfile(crop);
    const profitValue = document.getElementById("profitResultValue");
    const riskValue = document.getElementById("profitRiskValue");
    const insightBox = document.getElementById("profitInsight");

    if (!investment) {
        if (profitValue) profitValue.innerText = formatInr(0);
        if (riskValue) riskValue.innerText = "Add investment";
        if (insightBox) insightBox.innerHTML = `<div class="timeline-item"><p>Enter your expected investment to estimate profit.</p></div>`;
        return;
    }

    const expectedProfit = Math.round(investment * profile.profitMultiplier);
    const breakEven = Math.round(investment / (1 + profile.profitMultiplier));

    if (profitValue) profitValue.innerText = formatInr(expectedProfit);
    if (riskValue) riskValue.innerText = profile.risk;
    if (insightBox) {
        insightBox.innerHTML = `
            <div class="timeline-item"><p>Projected profit for <strong>${crop}</strong> is about <strong>${formatInr(expectedProfit)}</strong> on an investment of <strong>${formatInr(investment)}</strong>.</p></div>
            <div class="timeline-item"><p>Estimated break-even point starts near <strong>${formatInr(breakEven)}</strong>. Risk is <strong>${profile.risk}</strong> based on the crop's price volatility and input sensitivity.</p></div>
        `;
    }
}

function runDecisionEngine() {
    const crop = document.getElementById("decisionCrop")?.value || "Tomato";
    const location = document.getElementById("decisionLocation")?.value || "";
    const budget = parseCurrencyInput(document.getElementById("decisionBudget")?.value);
    const { profile, roi, risk, shouldGrow } = calculateDecisionMetrics(crop, location, budget);

    const growBadge = document.getElementById("decisionGrowBadge");
    const roiValue = document.getElementById("decisionRoiValue");
    const riskValue = document.getElementById("decisionRiskValue");
    const altValue = document.getElementById("decisionAltValue");
    const altReason = document.getElementById("decisionAltReason");

    if (growBadge) {
        growBadge.classList.remove("grow", "no-grow");
        growBadge.classList.add(shouldGrow ? "grow" : "no-grow");
        growBadge.innerText = shouldGrow ? `Grow ${crop} ${String.fromCharCode(9989)}` : `Don't grow ${crop} ${String.fromCharCode(10060)}`;
    }
    if (roiValue) roiValue.innerText = `${roi}%`;
    if (riskValue) riskValue.innerText = risk;
    if (altValue) altValue.innerText = `${profile.alternative} (${roi + profile.alternativeRoiBoost}% ROI)`;
    if (altReason) {
        altReason.innerText = shouldGrow
            ? `${profile.alternative} still looks slightly stronger if you want higher upside than ${crop}.`
            : `${profile.alternative} looks safer for ${location || "this location"} with your current budget.`;
    }
}

function runCompareDecisions() {
    const cropOne = document.getElementById("compareCropOne")?.value || "Tomato";
    const cropTwo = document.getElementById("compareCropTwo")?.value || "Onion";
    const location = document.getElementById("decisionLocation")?.value || localStorage.getItem("userState") || "Maharashtra";
    const budget = parseCurrencyInput(document.getElementById("compareBudget")?.value || document.getElementById("decisionBudget")?.value);
    const optionOne = calculateDecisionMetrics(cropOne, location, budget);
    const optionTwo = calculateDecisionMetrics(cropTwo, location, budget);
    const compareInsight = document.getElementById("compareInsight");

    const nameOne = document.getElementById("compareNameOne");
    const nameTwo = document.getElementById("compareNameTwo");
    const profitOne = document.getElementById("compareProfitOne");
    const profitTwo = document.getElementById("compareProfitTwo");
    const riskOne = document.getElementById("compareRiskOne");
    const riskTwo = document.getElementById("compareRiskTwo");

    if (nameOne) nameOne.innerText = cropOne;
    if (nameTwo) nameTwo.innerText = cropTwo;
    if (profitOne) profitOne.innerText = formatInr(optionOne.profit);
    if (profitTwo) profitTwo.innerText = formatInr(optionTwo.profit);
    if (riskOne) riskOne.innerText = optionOne.risk;
    if (riskTwo) riskTwo.innerText = optionTwo.risk;

    const winner = optionOne.profit >= optionTwo.profit ? { crop: cropOne, data: optionOne } : { crop: cropTwo, data: optionTwo };
    if (compareInsight) {
        compareInsight.innerHTML = `
            <div class="timeline-item"><p><strong>${winner.crop}</strong> currently looks stronger for ${location} with an expected profit near <strong>${formatInr(winner.data.profit)}</strong>.</p></div>
            <div class="timeline-item"><p>${cropOne} shows <strong>${optionOne.risk}</strong> risk while ${cropTwo} shows <strong>${optionTwo.risk}</strong> risk. Use this comparison to choose between upside and stability.</p></div>
        `;
    }
}

function handleExpertConnect(mode) {
    const expertModeValue = document.getElementById("expertModeValue");
    const expertEtaValue = document.getElementById("expertEtaValue");
    const expertInsight = document.getElementById("expertInsight");

    if (expertModeValue) expertModeValue.innerText = mode === "paid" ? "Paid consultation" : "Free (limited)";
    if (expertEtaValue) expertEtaValue.innerText = mode === "paid" ? "Within 30 mins" : "Within 24 hrs";
    if (expertInsight) {
        expertInsight.innerHTML = mode === "paid"
            ? `
                <div class="timeline-item"><p>Paid consultation unlocked. Offer video or call-based crop planning, disease review, and market timing help.</p></div>
                <div class="timeline-item"><p>This can become a direct revenue stream with premium agronomist support for urgent farmer decisions.</p></div>
            `
            : `
                <div class="timeline-item"><p>Free mode gives one limited expert follow-up with slower turnaround and basic guidance.</p></div>
                <div class="timeline-item"><p>Use this as the top of the funnel, then upsell paid consultation for faster and deeper advice.</p></div>
            `;
    }
}

function saveGoogleMapsApiKey() {
    const value = document.getElementById("googleMapsApiKey")?.value.trim() || "";
    localStorage.setItem("googleMapsApiKey", value);
    const ecosystemResults = document.getElementById("ecosystemResults");
    if (ecosystemResults) {
        ecosystemResults.innerHTML = `<div class="timeline-item"><p>${value ? "Google Maps API key saved. You can now load nearby ecosystem places." : "Google Maps API key cleared."}</p></div>`;
    }
}

function setEcosystemType(button) {
    selectedEcosystemType = button?.dataset?.ecosystemType || "mandi";
    document.querySelectorAll("[data-ecosystem-type]").forEach((item) => item.classList.remove("active"));
    if (button) button.classList.add("active");
}

function getSelectedMapQuery() {
    const farm = typeof window.getAgroFarmSnapshot === "function" ? window.getAgroFarmSnapshot() : {};
    const state = document.getElementById("mapState")?.value || farm.state || localStorage.getItem("userState") || "Maharashtra";
    const district = document.getElementById("mapDistrict")?.value || farm.city || farm.village || localStorage.getItem("userDistrict") || "Pune";
    const custom = document.getElementById("mapCustomSearch")?.value.trim();
    return custom || [district, state].filter(Boolean).join(", ");
}

function getEcosystemSearchKeyword(type) {
    const keywords = {
        mandi: "mandi market",
        fertilizer: "fertilizer shop",
        cold_storage: "cold storage"
    };
    return keywords[type] || "agri supply";
}

function renderEcosystemFallback(query) {
    const ecosystemMap = document.getElementById("ecosystemMap");
    const ecosystemResults = document.getElementById("ecosystemResults");
    const labels = {
        mandi: "Nearby mandis",
        fertilizer: "Fertilizer shops",
        cold_storage: "Cold storage"
    };

    if (ecosystemMap) {
        ecosystemMap.innerHTML = `Google Maps API key needed for live map results. Showing a demo-ready placeholder for ${labels[selectedEcosystemType]} around ${query}.`;
    }
    if (ecosystemResults) {
        ecosystemResults.innerHTML = `
            <div class="timeline-item"><h4>${labels[selectedEcosystemType]}</h4><p>Primary search zone: ${query}</p></div>
            <div class="timeline-item"><p>Use your Google Maps API key to fetch real nearby businesses and practical farmer infrastructure.</p></div>
        `;
    }
}

function ensureGoogleMapsLoaded() {
    if (window.google?.maps?.Map) {
        return Promise.resolve(window.google.maps);
    }

    if (googleMapsLoaderPromise) {
        return googleMapsLoaderPromise;
    }

    const apiKey = localStorage.getItem("googleMapsApiKey") || window.GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
        return Promise.reject(new Error("Missing Google Maps API key"));
    }

    googleMapsLoaderPromise = new Promise((resolve, reject) => {
        const callbackName = "__agroInitGoogleMaps";
        window[callbackName] = () => {
            delete window[callbackName];
            resolve(window.google.maps);
        };

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error("Unable to load Google Maps API"));
        document.head.appendChild(script);
    });

    return googleMapsLoaderPromise;
}

function clearGoogleMapMarkers() {
    googleMapMarkerObjects.forEach((marker) => marker.setMap(null));
    googleMapMarkerObjects = [];
}

async function loadNearbyEcosystemMap() {
    const query = getSelectedMapQuery();
    const ecosystemMap = document.getElementById("ecosystemMap");
    const ecosystemResults = document.getElementById("ecosystemResults");
    const mapTitle = document.getElementById("mapTitle");

    if (mapTitle) {
        mapTitle.innerText = `Nearby ecosystem for ${query}`;
    }
    if (ecosystemMap) {
        ecosystemMap.innerHTML = "Loading Google Maps ecosystem view...";
    }

    try {
        const maps = await ensureGoogleMapsLoaded();
        const geocoder = new maps.Geocoder();
        const geocodeResult = await geocoder.geocode({ address: query });
        const location = geocodeResult.results?.[0]?.geometry?.location;
        if (!location) {
            throw new Error("Location not found");
        }

        googleMapInstance = new maps.Map(document.getElementById("ecosystemMap"), {
            center: location,
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false
        });

        clearGoogleMapMarkers();
        new maps.Marker({
            position: location,
            map: googleMapInstance,
            title: query
        });

        const service = new maps.places.PlacesService(googleMapInstance);
        const request = {
            location,
            radius: 15000,
            keyword: getEcosystemSearchKeyword(selectedEcosystemType)
        };

        service.nearbySearch(request, (results, status) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !results?.length) {
                renderEcosystemFallback(query);
                return;
            }

            const topResults = results.slice(0, 5);
            googleMapMarkerObjects = topResults.map((place) => new maps.Marker({
                map: googleMapInstance,
                position: place.geometry.location,
                title: place.name
            }));

            if (ecosystemResults) {
                ecosystemResults.innerHTML = topResults.map((place) => `
                    <div class="timeline-item">
                        <h4>${place.name}</h4>
                        <p>${place.vicinity || "Nearby result"}</p>
                    </div>
                `).join("");
            }
        });
    } catch (error) {
        console.error("ecosystem map error", error);
        renderEcosystemFallback(query);
    }
}

function getPersonalHistory() {
    const scopedKey = getHistoryStorageKey();
    const scopedHistory = readCachedJson(scopedKey, []);
    if (scopedHistory.length) {
        return scopedHistory;
    }

    const legacyHistory = readCachedJson("agroHistory", []);
    if (legacyHistory.length) {
        localStorage.setItem(scopedKey, JSON.stringify(legacyHistory.slice(0, 30)));
        localStorage.removeItem("agroHistory");
        return legacyHistory.slice(0, 30);
    }

    return [];
}

// ===============================
// ASK QUESTION (MAIN FUNCTION)
// ===============================
async function askQuestion() {
    const question = document.getElementById("question").value;
    const language = document.getElementById("language").value;
    const answerBox = document.getElementById("answer");
    const confidenceBox = document.getElementById("confidence");
    const assistantShell = document.getElementById("assistantShell");
    const userId = getCurrentUserId();

    if (!question.trim()) {
        alert(t("pleaseEnterQuestion"));
        return;
    }

    answerBox.innerText = "Thinking...";
    if (confidenceBox) confidenceBox.innerText = "";
    if (assistantShell) assistantShell.classList.add("thinking");

    try {
        const response = await fetch(`${API_URL}/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: question,
                language: language,
                user_id: userId
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            answerBox.innerText = "Error: " + (errorText || response.statusText);
            return;
        }

        const data = await response.json();
        const extraSections = [];
        if (Array.isArray(data.references) && data.references.length) {
            extraSections.push(
                "References:\n" + data.references.map((item) => {
                    const statePart = item.state ? ` | ${item.state}` : "";
                    const sectionPart = item.section ? ` | ${item.section}` : "";
                    return `[${item.index}] ${item.title}${statePart}${sectionPart}`;
                }).join("\n")
            );
        }
        if (Array.isArray(data.follow_up_questions) && data.follow_up_questions.length) {
            extraSections.push(
                "Related questions:\n" + data.follow_up_questions.map((item, index) => `${index + 1}. ${item}`).join("\n")
            );
        }
        const answerWithContext = [data.answer || "No answer found.", ...extraSections].filter(Boolean).join("\n\n");
        const formattedAnswer = updateAnswerPresentation(answerWithContext);

        if (data.confidence !== undefined && confidenceBox) {
            confidenceBox.innerText = `${t("confidence")} ${(data.confidence * 100).toFixed(0)}%`;
        }

        saveHistoryEntry({
            question,
            answer: formattedAnswer,
            language,
            ts: Date.now(),
        });

        renderHistory();
        const spokenAnswer = getMainAnswerForSpeech(data.answer || formattedAnswer);
        speakText(`Based on your query and soil conditions, I recommend ${spokenAnswer}`, language);
    } catch (error) {
        hideAnswerIntro();
        answerBox.innerText = t("backendNotReachable");
        console.error(error);
    } finally {
        if (assistantShell) assistantShell.classList.remove("thinking");
    }
}

async function explainLatestAnswer() {
    const answerBox = document.getElementById("answer");
    const language = document.getElementById("language").value;
    const text = answerBox?.innerText || "";
    if (!text || text === t("answerWaiting")) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/ai/explain-simply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language })
        });
        const data = await response.json();
        updateAnswerPresentation(data.answer);
    } catch (error) {
        console.error("explain simply error", error);
    }
}

function getHistory() {
    return getPersonalHistory();
}

function saveHistoryEntry(entry) {
    const history = getPersonalHistory();
    history.unshift(entry);
    localStorage.setItem(getHistoryStorageKey(), JSON.stringify(history.slice(0, 30)));
    if (typeof window.renderGamification === "function") {
        window.renderGamification();
    }
}

function clearHistory() {
    localStorage.removeItem(getHistoryStorageKey());
    renderHistory();
    if (typeof window.renderGamification === "function") {
        window.renderGamification();
    }
}

async function renderHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    list.innerHTML = `<p class="small-note">Loading recent community questions...</p>`;

    try {
        const response = await fetch(`${API_URL}/questions/feed?limit=20`);
        if (!response.ok) {
            throw new Error(`feed request failed: ${response.status}`);
        }

        const data = await response.json();
        const history = data.items || [];
        if (history.length === 0) {
            list.innerHTML = `<p class="small-note">${t("noHistory")}</p>`;
            return;
        }

        list.innerHTML = history.map(item => {
            const time = new Date(item.timestamp || item.ts).toLocaleString();
            return `
            <div class="history-item">
                <h4>${escapeHtml(item.question)}</h4>
                <p><strong>Asked by:</strong> ${escapeHtml(item.user_name || "Farmer")}</p>
                <p><strong>${t("answerTitle")}:</strong> ${escapeHtml(item.answer)}</p>
                <small>${time}</small>
            </div>
            `;
        }).join("");
        return;
    } catch (error) {
        console.error("question feed error", error);
    }

    const history = getPersonalHistory();
    if (history.length === 0) {
        list.innerHTML = `<p class="small-note">${t("noHistory")}</p>`;
        return;
    }

    list.innerHTML = history.map(item => {
        const time = new Date(item.ts).toLocaleString();
        return `
        <div class="history-item">
            <h4>${escapeHtml(item.question)}</h4>
            <p><strong>${t("answerTitle")}:</strong> ${escapeHtml(item.answer)}</p>
            <small>${time}</small>
            <button class="nav-btn" type="button" onclick='replayHistory(${item.ts})'>Ask again</button>
        </div>
        `;
    }).join("");
}

function replayHistory(ts) {
    const history = getHistory();
    const item = history.find(h => h.ts === ts);
    if (!item) return;

    document.getElementById("question").value = item.question;
    document.getElementById("language").value = item.language || "English";
    askQuestion();
}

window.addEventListener("DOMContentLoaded", () => {
    try {
        if (typeof initI18n === "function") {
            initI18n();
        }
    } catch (error) {
        console.error("script i18n init error", error);
    }

    [
        () => populateDecisionDefaults(),
        () => runProfitCalculator(),
        () => runDecisionEngine(),
        () => runCompareDecisions(),
        () => handleExpertConnect("free"),
        () => renderHistory()
    ].forEach((task) => {
        try {
            task();
        } catch (error) {
            console.error("script startup error", error);
        }
    });
});

window.addEventListener("agro-farm-profile-updated", () => {
    try {
        populateDecisionDefaults();
        runProfitCalculator();
        runDecisionEngine();
        runCompareDecisions();
    } catch (error) {
        console.error("farm profile refresh error", error);
    }
});

// ===============================
// TEXT TO SPEECH (OUTPUT VOICE)
// ===============================
function speakText(text, language) {
    if (!window.speechSynthesis) {
        alert(t("speechNotSupported"));
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    let langCode = "en-US";
    if (language === "Hindi") {
        langCode = "hi-IN";
    } else if (language === "Marathi") {
        langCode = "mr-IN";
    }

    const voices = speechSynthesis.getVoices();
    let selectedVoice = voices.find(v =>
        v.lang === langCode && v.name.toLowerCase().includes("google")
    );

    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang === langCode);
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.lang = langCode;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
}

window.getPersonalHistory = getPersonalHistory;

// ===============================
// VOICE INPUT (MIC)
// ===============================
function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function voiceText(key, fallback) {
    return typeof window.fc === "function" ? window.fc(key) : fallback;
}

function resetVoiceUi(message = voiceText("voiceReady", "Voice farmer mode ready")) {
    const questionBox = document.getElementById("question");
    const voicePill = document.getElementById("voicePill");
    const voiceModeStatus = document.getElementById("voiceModeStatus");

    if (questionBox && !questionBox.value) {
        questionBox.placeholder = t("questionPlaceholder");
    }
    if (voicePill) voicePill.innerText = message;
    if (voiceModeStatus) voiceModeStatus.innerText = voiceText("voiceReady", "Ready");
}

async function ensureMicrophoneAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return true;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
    } catch (error) {
        return error;
    }
}

async function startListening() {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
        alert(t("speechRecognitionNotSupported"));
        return;
    }

    const language = document.getElementById("language").value;
    const questionBox = document.getElementById("question");
    const voicePill = document.getElementById("voicePill");
    const voiceModeStatus = document.getElementById("voiceModeStatus");
    const permissionResult = await ensureMicrophoneAccess();

    if (permissionResult !== true) {
        resetVoiceUi(voiceText("microphoneBlocked", "Microphone blocked"));
        alert(voiceText("microphoneBlockedHelp", "Microphone permission is blocked. Please click the lock or site icon near the address bar, allow microphone access for this site, and then try Mic again."));
        return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    if (language === "Hindi") {
        recognition.lang = "hi-IN";
    } else if (language === "Marathi") {
        recognition.lang = "mr-IN";
    } else {
        recognition.lang = "en-US";
    }

    if (questionBox) questionBox.placeholder = voiceText("listening", "Listening...");
    if (voicePill) voicePill.innerText = voiceText("listeningNow", "Listening now...");
    if (voiceModeStatus) voiceModeStatus.innerText = voiceText("liveNow", "Live");
    localStorage.setItem("voiceUsed", "yes");
    if (typeof window.renderGamification === "function") {
        window.renderGamification();
    }

    recognition.onstart = function () {
        if (voicePill) voicePill.innerText = voiceText("listeningNow", "Listening now...");
        if (voiceModeStatus) voiceModeStatus.innerText = voiceText("liveNow", "Live");
    };

    recognition.onresult = function (event) {
        const text = event.results?.[0]?.[0]?.transcript || "";
        if (questionBox && text) {
            questionBox.value = text;
            questionBox.placeholder = t("questionPlaceholder");
        }
        if (voicePill) voicePill.innerText = text ? voiceText("voiceCaptured", "Voice captured") : voiceText("noSpeechDetected", "No speech detected");
        if (voiceModeStatus) voiceModeStatus.innerText = voiceText("voiceReady", "Ready");
    };

    recognition.onerror = function (event) {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            resetVoiceUi(voiceText("microphoneBlocked", "Microphone blocked"));
            alert(voiceText("microphoneBrowserBlocked", "Microphone permission is blocked in the browser. Allow mic access for 127.0.0.1:5500 and reload the page."));
            return;
        }

        if (event.error === "no-speech") {
            resetVoiceUi(voiceText("noSpeechDetected", "No speech detected"));
            return;
        }

        resetVoiceUi(voiceText("voiceReady", "Voice farmer mode ready"));
        alert(`${voiceText("micError", "Mic error")}: ${event.error}`);
    };

    recognition.onend = function () {
        if (voiceModeStatus && voiceModeStatus.innerText === voiceText("liveNow", "Live")) {
            voiceModeStatus.innerText = voiceText("voiceReady", "Ready");
        }
        if (voicePill && voicePill.innerText === voiceText("listeningNow", "Listening now...")) {
            voicePill.innerText = voiceText("voiceReady", "Voice farmer mode ready");
        }
        if (questionBox && !questionBox.value) {
            questionBox.placeholder = t("questionPlaceholder");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        resetVoiceUi(voiceText("voiceReady", "Voice farmer mode ready"));
        console.error("speech start error", error);
        alert(voiceText("unableToStartVoice", "Unable to start voice input. Please allow microphone access and try again."));
    }
}

// ===============================
// IMAGE OCR UPLOAD
// ===============================
async function uploadImage() {
    const fileInput = document.getElementById("imageInput");
    const file = fileInput.files[0];

    if (!file) {
        alert(t("pleaseSelectImage"));
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const answerBox = document.getElementById("answer");
    answerBox.innerText = t("extractingImage") || "Extracting text from image...";

    try {
        const response = await fetch(`${API_URL}/upload-image/`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        document.getElementById("question").value = data.extracted_text;
        updateAnswerPresentation(data.llm_response);
    } catch (error) {
        hideAnswerIntro();
        answerBox.innerText = t("errorUploadingImage");
        console.error(error);
    }
}

window.runProfitCalculator = runProfitCalculator;
window.runDecisionEngine = runDecisionEngine;
window.runCompareDecisions = runCompareDecisions;
window.handleExpertConnect = handleExpertConnect;
window.saveGoogleMapsApiKey = saveGoogleMapsApiKey;
window.setEcosystemType = setEcosystemType;
window.loadNearbyEcosystemMap = loadNearbyEcosystemMap;
