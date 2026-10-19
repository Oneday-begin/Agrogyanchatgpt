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
    ["profitResultValue", "profitRiskValue"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "Not estimated"; });
    const box = document.getElementById("profitInsight");
    if (box) box.textContent = "Profit requires expected sale quantity × price minus all costs. Investment alone cannot predict profit.";
}

function runCompareDecisions() {
    ["compareProfitOne", "compareProfitTwo", "compareRiskOne", "compareRiskTwo"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "Not estimated"; });
    const box = document.getElementById("compareInsight");
    if (box) box.textContent = "A reliable comparison needs your expected yield, local sale prices and all cultivation costs. District prices alone cannot predict profit.";
}

function handleExpertConnect() {
    const box = document.getElementById("expertInsight");
    if (box) box.innerHTML = '<p>Find your local Krishi Vigyan Kendra through the <a href="https://kvk.icar.gov.in/" target="_blank" rel="noopener">official ICAR KVK directory</a>. Contact the centre for availability and field advice.</p>';
    const mode = document.getElementById("expertModeValue");
    if (mode) mode.textContent = "Local KVK advisory";
    const eta = document.getElementById("expertEtaValue");
    if (eta) eta.textContent = "Contact centre for availability";
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

// ================================================================
// CHAT UI HELPERS
// ================================================================

let chatRequestPending = false;
let activeChatRequest = null;
let chatWaitTimer = null;
let chatScrollFrame = null;
let latestChatAnswer = null;

function chatUiText(key, language = document.getElementById("language")?.value) {
    const labels = {
        English: { waiting: "Checking your question against the stored sources…", slow: "Still waiting for the local answer. You can keep typing or stop waiting.", stop: "Stop waiting", stopped: "Stopped waiting for this answer.", retry: "Try again", timeout: "This answer took too long. Try again or ask a shorter question.", offline: "Could not reach AgroGyan. Check the connection and try again." },
        Gujarati: { waiting: "સંગ્રહિત સ્રોતોમાં તમારા પ્રશ્નનો જવાબ શોધી રહ્યા છીએ…", slow: "સ્થાનિક જવાબની રાહ જોઈ રહ્યા છીએ. તમે લખવાનું ચાલુ રાખી શકો છો અથવા રાહ જોવાનું બંધ કરી શકો છો.", stop: "રાહ જોવાનું બંધ કરો", stopped: "આ જવાબની રાહ જોવાનું બંધ કર્યું.", retry: "ફરી પ્રયાસ કરો", timeout: "જવાબમાં વધુ સમય લાગ્યો. ફરી પ્રયાસ કરો અથવા ટૂંકો પ્રશ્ન પૂછો.", offline: "એગ્રોજ્ઞાન સાથે જોડાઈ શકાયું નથી. કનેક્શન તપાસીને ફરી પ્રયાસ કરો." },
        Hindi: { waiting: "संग्रहीत स्रोतों में आपके प्रश्न का उत्तर खोज रहे हैं…", slow: "स्थानीय उत्तर की प्रतीक्षा है। आप लिखना जारी रख सकते हैं या प्रतीक्षा रोक सकते हैं।", stop: "प्रतीक्षा रोकें", stopped: "इस उत्तर की प्रतीक्षा रोक दी गई।", retry: "फिर कोशिश करें", timeout: "उत्तर में अधिक समय लगा। फिर कोशिश करें या छोटा प्रश्न पूछें।", offline: "एग्रोज्ञान से संपर्क नहीं हो सका। कनेक्शन जाँचकर फिर कोशिश करें।" },
        Marathi: { waiting: "संग्रहित स्रोतांमध्ये तुमच्या प्रश्नाचे उत्तर शोधत आहोत…", slow: "स्थानिक उत्तराची वाट पाहत आहोत. तुम्ही लिहित राहू शकता किंवा प्रतीक्षा थांबवू शकता.", stop: "प्रतीक्षा थांबवा", stopped: "या उत्तराची प्रतीक्षा थांबवली.", retry: "पुन्हा प्रयत्न करा", timeout: "उत्तराला जास्त वेळ लागला. पुन्हा प्रयत्न करा किंवा छोटा प्रश्न विचारा.", offline: "एग्रोज्ञानशी संपर्क झाला नाही. जोडणी तपासून पुन्हा प्रयत्न करा." }
    };
    return (labels[language] || labels.English)[key];
}

function _requestLanguage(question, selected) {
    if (selected !== "Auto") return selected;
    if (/[\u0A80-\u0AFF]/.test(question)) return "Gujarati";
    if (/[\u0900-\u097F]/.test(question)) return /काय|आहे|म्हणजे|शेती|माती|शेत/.test(question) ? "Marathi" : "Hindi";
    return "English";
}

function cancelChatRequest() {
    if (!activeChatRequest) return;
    activeChatRequest.cancelled = true;
    activeChatRequest.controller.abort();
}

function readLatestAnswer() {
    if (latestChatAnswer) speakText(getMainAnswerForSpeech(latestChatAnswer.answer), latestChatAnswer.answer_language);
}

document.addEventListener("DOMContentLoaded", async () => {
    const status = document.getElementById("backendStatus");
    if (!status) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
        const health = await response.json();
        status.textContent = response.ok && health.chatbot_ready ? "Backend connected" : "Backend needs attention";
    } catch {
        status.textContent = "Backend unreachable";
    } finally {
        clearTimeout(timeout);
    }
});
function _chatMessages() { return document.getElementById("agroChatMessages"); }
function _chatTyping()   { return document.getElementById("agroTyping"); }
function _sendBtn()      { return document.getElementById("agroSendBtn"); }
function _explainBtn()   { return document.getElementById("explainBtn"); }
function _confLabel()    { return document.getElementById("confidence"); }

function _scrollToBottom() {
    if (chatScrollFrame !== null) return;
    chatScrollFrame = requestAnimationFrame(() => {
        chatScrollFrame = null;
        const el = _chatMessages();
        if (el) el.scrollTop = el.scrollHeight;
    });
}

function _setTyping(on, language) {
    clearTimeout(chatWaitTimer);
    const t = _chatTyping();
    if (!t) return;
    if (on) { t.removeAttribute("hidden"); t.removeAttribute("aria-hidden"); }
    else    { t.setAttribute("hidden", ""); t.setAttribute("aria-hidden", "true"); }
    const status = document.getElementById("agroRequestStatus");
    const stop = document.getElementById("agroStopBtn");
    if (stop) { stop.textContent = chatUiText("stop", language); stop.hidden = !activeChatRequest; }
    if (status && on) {
        status.textContent = chatUiText("waiting", language);
        chatWaitTimer = setTimeout(() => { status.textContent = chatUiText("slow", language); }, 8000);
    }
    _scrollToBottom();
}

function _setBusy(on) {
    chatRequestPending = on;
    const s = _sendBtn(), e = _explainBtn();
    if (s) s.disabled = on;
    if (e && on) e.disabled = true;
    const upload = document.getElementById("imageInput");
    if (upload) upload.disabled = on;
    document.getElementById("agroChat")?.setAttribute("aria-busy", String(on));
    window.chatWorkspace?.setBusy(on);
    // keep explainBtn disabled until at least one bot answer has been rendered
}

function _appendMsg(role, html) {
    const msgs = _chatMessages();
    if (!msgs) return;
    const isUser = role === "user";
    const avatarContent = isUser ? "👤" : "🌾";
    const div = document.createElement("div");
    div.className = `agro-msg agro-msg--${isUser ? "user" : "bot"}`;
    div.innerHTML = `
        <div class="agro-msg-avatar" aria-hidden="true">${avatarContent}</div>
        <div class="agro-msg-bubble">${html}</div>`;
    document.getElementById("chatEmptyState")?.remove();
    msgs.appendChild(div);
    window.chatWorkspace?.capture();
    _scrollToBottom();
    return div;
}

function _buildBotHtml(data) {
    const answer = (data.answer || "No answer found.").trim();
    // Convert markdown-like bullets and newlines
    const formatted = escapeHtml(answer)
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/^[-•]\s+/gm, "• ")
        .split("\n").map(l => `<p>${l}</p>`).join("");

    // Source badge
    const sourceType = data.source_type || "documents";
    const sourceLabelMap = {
        documents: "📂 From knowledge base",
        general:   "💡 General agronomy guidance",
        none:      "❓ Not found in knowledge base",
        conversation: "🌾 AgroGyan assistant",
        clarification: "💬 More details needed",
    };
    const sourceLabel = data.answer_language === "Gujarati" ? (data.answer_mode === "source_excerpt" ? "📄 સંબંધિત સ્રોત · સંપૂર્ણ જવાબ ચકાસાયેલો નથી" : data.answer_mode === "reviewed_reference" ? "📖 સ્રોત આધારિત માર્ગદર્શન" : sourceType === "conversation" ? "🌾 એગ્રોજ્ઞાન સહાયક" : sourceType === "none" ? "સ્રોતમાં જવાબ મળ્યો નથી" : "📂 જ્ઞાન આધારિત જવાબ") : data.answer_mode === "source_excerpt"
        ? "📄 Related source · answer unverified"
        : data.answer_mode === "reviewed_reference" ? "📖 Sourced farming reference"
        : (sourceLabelMap[sourceType] || sourceLabelMap.documents);
    const badgeHtml = `<span class="agro-msg-source agro-source--${escapeHtml(sourceType)}">${sourceLabel}</span>`;

    // Follow-up chips
    let chipsHtml = "";
    if (Array.isArray(data.follow_up_questions) && data.follow_up_questions.length) {
        const chips = data.follow_up_questions.map(q =>
            `<button class="agro-followup-chip" type="button" data-question="${escapeHtml(String(q))}">${escapeHtml(String(q))}</button>`
        ).join("");
        chipsHtml = `<div class="agro-followup-row">${chips}</div>`;
    }

    // References
    let refsHtml = "";
    if (Array.isArray(data.references) && data.references.length) {
        const refLines = data.references.map(r => {
            const parts = [r.title, r.state, r.section].filter(Boolean);
            const sourceHref = r.source_name === "farming_reference.json" && /^https:\/\//i.test(r.source_url || "")
                ? r.source_url
                : r.source_excerpt_url?.startsWith("/knowledge/gr/")
                ? `${API_URL}${r.source_excerpt_url}`
                : r.source_id
                ? `${API_URL}/knowledge/pdf/${encodeURIComponent(r.source_id)}#page=${Number(r.page) || 1}`
                : `${API_URL}/knowledge/sources/${encodeURIComponent(r.source_name || "")}`;
            const link = r.source_name ? ` <a href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener noreferrer">${r.page ? `${r.source_excerpt_url ? "View excerpt" : "View PDF"} · page ${Number(r.page)}` : "View source"}</a>` : "";
            const official = r.source_url !== sourceHref && /^https?:\/\//i.test(r.source_url || "") ? ` <a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener noreferrer">Original source</a>` : "";
            return `[${r.index}] ${escapeHtml(parts.join(" › "))}${link}${official}`;
        }).join("<br>");
        refsHtml = `<div class="agro-references"><strong>Sources:</strong><br>${refLines}</div>`;
    }

    // Confidence label update
    if (data.confidence !== undefined) {
        const conf = Math.round(data.confidence * 100);
        const lbl = _confLabel();
        if (lbl) lbl.textContent = conf > 0 ? `Source match: ${conf}% · ${(data.response_ms / 1000 || 0).toFixed(2)}s` : (["conversation", "clarification"].includes(sourceType) ? "" : "No supporting source found");
    }

    const warningsHtml = (data.warnings || []).map(w => `<p class="agro-answer-warning">${escapeHtml(w)}</p>`).join("");
    const evidenceHtml = data.warnings?.length && data.evidence?.length
        ? `<details class="agro-references"><summary>Original source excerpts</summary>${data.evidence.map(e => `<p>${escapeHtml(e.text)} [${e.index}]</p>`).join("")}</details>`
        : "";
    const originalHtml = data.original_answer && data.original_answer !== data.answer
        ? `<details class="agro-references"><summary>${data.answer_language === 'Gujarati' ? 'મૂળ સ્રોતનો જવાબ' : 'Original answer'}</summary><p>${escapeHtml(data.original_answer)}</p></details>` : '';
    return formatted + badgeHtml + warningsHtml + evidenceHtml + originalHtml + chipsHtml + refsHtml;
}

document.addEventListener("click", event => {
    const chip = event.target.closest?.(".agro-followup-chip[data-question]");
    if (chip) askFollowUp(chip.dataset.question);
});

function askFollowUp(question) {
    if (chatRequestPending) return;
    const qEl = document.getElementById("question");
    if (qEl) qEl.value = question;
    askQuestion();
}


// Auto-grow textarea
(function wireTextareaAutoGrow() {
    document.addEventListener("DOMContentLoaded", () => {
        const ta = document.getElementById("question");
        if (!ta) return;
        // Native content sizing avoids a synchronous layout read on every keystroke.
        if (window.CSS?.supports("field-sizing", "content")) return;
        let resizeFrame = null;
        ta.addEventListener("input", () => {
            if (resizeFrame !== null) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;
                ta.style.height = "auto";
                ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
            });
        });
    });
})();

// ================================================================
// ASK QUESTION (MAIN FUNCTION)
// ================================================================
async function askQuestion() {
    if (chatRequestPending) return;
    const questionEl = document.getElementById("question");
    const language   = document.getElementById("language")?.value || "English";
    const question   = (questionEl?.value || "").trim();
    const userId     = getCurrentUserId();

    if (!question) {
        alert(typeof t === "function" ? t("pleaseEnterQuestion") : "Please enter a question.");
        return;
    }

    // Append user bubble
    const userMessage = _appendMsg("user", `<p>${escapeHtml(question)}</p>`);
    if (questionEl) { questionEl.value = ""; questionEl.style.height = "auto"; }

    const controller = new AbortController();
    const requestLanguage = _requestLanguage(question, language);
    activeChatRequest = { controller, cancelled: false };
    const currentRequest = activeChatRequest;
    _setTyping(true, requestLanguage);
    _setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
        const response = await fetch(`${API_URL}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, language, user_id: userId }),
            signal: controller.signal,
        });

        _setTyping(false);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const msg = errData.detail || `Server error ${response.status}. Please try again.`;
            _appendMsg("bot", `<p>${escapeHtml(msg)}</p>`);
            return;
        }

        const data = await response.json();
        if (userMessage && data.display_question && data.display_question !== question) {
            userMessage.querySelector('.agro-msg-bubble').innerHTML = `<p lang="${data.answer_language === 'Gujarati' ? 'gu' : ''}">${escapeHtml(data.display_question)}</p><details><summary>મૂળ પ્રશ્ન</summary><p>${escapeHtml(question)}</p></details>`;
        }
        _appendMsg("bot", _buildBotHtml(data));
        latestChatAnswer = { answer: data.answer || "", answer_language: data.answer_language || requestLanguage };
        const readButton = document.getElementById("readAnswerBtn");
        if (readButton) readButton.disabled = !latestChatAnswer.answer;

        // Enable "Explain simply" now that there's an answer
        const eb = _explainBtn();
        if (eb) eb.disabled = false;

        // Save to local history
        saveHistoryEntry({ question, answer: data.answer || "", language, ts: Date.now() });
        renderHistory({ force: true });

    } catch (err) {
        _setTyping(false);
        const messageKey = currentRequest.cancelled ? "stopped" : err.name === "AbortError" ? "timeout" : "offline";
        _appendMsg("bot", `<p>${escapeHtml(chatUiText(messageKey, requestLanguage))}</p><button class="agro-followup-chip" type="button" data-question="${escapeHtml(question)}">${escapeHtml(chatUiText("retry", requestLanguage))}</button>`);
        if (err.name !== "AbortError") console.error("askQuestion error:", err);
    } finally {
        clearTimeout(timeout);
        activeChatRequest = null;
        _setTyping(false);
        _setBusy(false);
    }
}

// ================================================================
// EXPLAIN SIMPLY (re-summarise last bot answer)
// ================================================================
async function explainLatestAnswer() {
    if (chatRequestPending) return;
    const lastBotBubble = [...document.querySelectorAll(".agro-msg--bot .agro-msg-bubble")].pop();
    const text = lastBotBubble?.innerText?.trim() || document.getElementById("answer")?.innerText || "";
    if (!text) return;

    const language = document.getElementById("language")?.value || "English";
    _setTyping(true);
    _setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(`${API_URL}/ai/explain-simply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language }),
            signal: controller.signal,
        });
        const data = await response.json();
        _setTyping(false);
        if (data.answer) {
            _appendMsg("bot", `<p><strong>Source wording preserved:</strong> ${escapeHtml(data.answer)}</p>`);
        }
    } catch (err) {
        _setTyping(false);
        console.error("explain simply error:", err);
    } finally {
        clearTimeout(timeout);
        _setBusy(false);
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

let historyRequest = null;
let historyFetchedAt = 0;
let historyObserver = null;
async function renderHistory({ force = false } = {}) {
    const list = document.getElementById("historyList");
    if (!list) return;
    if (force) historyFetchedAt = 0;
    if (!getCurrentUserId()) {
        list.textContent = "Log in to view your private chat history.";
        return;
    }
    const bounds = list.getBoundingClientRect();
    if ("IntersectionObserver" in window && (bounds.top > window.innerHeight + 200 || bounds.bottom < -200)) {
        if (!historyObserver) {
            historyObserver = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                historyObserver.disconnect();
                historyObserver = null;
                renderHistory();
            }, { rootMargin: "200px" });
            historyObserver.observe(list);
        }
        return;
    }
    if (historyRequest) return historyRequest;
    if (Date.now() - historyFetchedAt < 15000) return;
    historyFetchedAt = Date.now();
    historyRequest = _renderHistory();
    try { await historyRequest; } finally { historyRequest = null; }
}

async function _renderHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    list.innerHTML = `<p class="small-note">Loading your private questions...</p>`;

    try {
        const response = await fetch(`${API_URL}/questions/feed?limit=20`);
        if (response.status === 401) { list.textContent = "Log in to view your private chat history."; return; }
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
        () => window.runDecisionEngine?.(),
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
        window.runDecisionEngine?.();
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
    } else if (language === "Gujarati") {
        langCode = "gu-IN";
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
    } else if (language === "Gujarati") {
        recognition.lang = "gu-IN";
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

// ================================================================
// IMAGE OCR UPLOAD
// ================================================================
async function uploadImage() {
    if (chatRequestPending) return;
    const fileInput = document.getElementById("imageInput");
    const file = fileInput?.files?.[0];

    if (!file) {
        alert(typeof t === "function" ? t("pleaseSelectImage") : "Please select an image first.");
        return;
    }

    // Show uploading state
    _appendMsg("user", `<p>📷 <em>Uploading image: ${escapeHtml(file.name)}</em></p>`);
    _setTyping(true);
    _setBusy(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", document.getElementById("language")?.value || "English");
    const uploadUserId = getCurrentUserId();
    if (uploadUserId) formData.append("user_id", String(uploadUserId));
    const imageQuestion = document.getElementById("question")?.value?.trim();
    if (imageQuestion) formData.append("question", imageQuestion);

    try {
        const response = await fetch(`${API_URL}/upload-image/`, {
            method: "POST",
            body: formData,
        });

        _setTyping(false);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            _appendMsg("bot", `<p>${escapeHtml(errData.detail || "Image upload failed. Please try again.")}</p>`);
            return;
        }

        const data = await response.json();

        // Show extracted text in textarea so user can edit before asking
        const qEl = document.getElementById("question");
        if (qEl && data.extracted_text) qEl.value = data.extracted_text;

        if (data.extracted_text) {
            _appendMsg("user", `<p><strong>Extracted text:</strong><br>${escapeHtml(data.extracted_text)}</p>`);
        }
        const answerData = {
            ...data,
            answer: data.answer || data.llm_response || "No information found for this image.",
            confidence: data.confidence || 0,
            source_type: data.source_type || "documents",
            references: data.references || [],
            follow_up_questions: data.follow_up_questions || [],
        };
        _appendMsg("bot", _buildBotHtml(answerData));

        // Reset file input
        if (fileInput) fileInput.value = "";
    } catch (err) {
        _setTyping(false);
        _appendMsg("bot", `<p>Image upload failed. Please check your connection and try again.</p>`);
        console.error("uploadImage error:", err);
    } finally {
        _setBusy(false);
    }
}


window.runProfitCalculator = runProfitCalculator;
// The crop decision page provides its own engine.
window.runCompareDecisions = runCompareDecisions;
window.handleExpertConnect = handleExpertConnect;
window.saveGoogleMapsApiKey = saveGoogleMapsApiKey;
window.setEcosystemType = setEcosystemType;
window.loadNearbyEcosystemMap = loadNearbyEcosystemMap;
window.askFollowUp = askFollowUp;
window.uploadImage = uploadImage;
window.explainLatestAnswer = explainLatestAnswer;
window.askQuestion = askQuestion;
window.startListening = startListening;

// Mic button active-state visual feedback
const _origStartListening = window.startListening;
window.startListening = async function () {
    const micBtn = document.getElementById("micBtn");
    if (micBtn) micBtn.classList.add("mic-active");
    try {
        await _origStartListening();
    } finally {
        if (micBtn) micBtn.classList.remove("mic-active");
    }
};

// A deliberate answer-language selection overrides automatic script detection.
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('language');
    const input = document.getElementById('question');
    if (!select) return;
    const saved = localStorage.getItem('chatAnswerLanguage');
    select.value = ['Auto','English','Hindi','Marathi','Gujarati'].includes(saved) ? saved : 'Auto';
    const update = () => {
        localStorage.setItem('chatAnswerLanguage', select.value);
        if (input) input.placeholder = select.value === 'Gujarati' ? 'તમારો ખેતી સંબંધિત પ્રશ્ન લખો અથવા બોલો...' : 'Type or speak your agriculture question...';
    };
    select.addEventListener('change', update);
    update();
});
