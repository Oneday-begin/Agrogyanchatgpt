const INDIA_LOCATIONS = {
    "Andhra Pradesh": ["Anantapur", "Chittoor", "Guntur", "Kadapa", "Kakinada", "Kurnool", "Nellore", "Rajahmundry", "Tirupati", "Visakhapatnam", "Vijayawada"],
    "Arunachal Pradesh": ["Bomdila", "Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro"],
    "Assam": ["Dibrugarh", "Guwahati", "Jorhat", "Nagaon", "Silchar", "Tezpur"],
    "Bihar": ["Bhagalpur", "Darbhanga", "Gaya", "Muzaffarpur", "Patna", "Purnia"],
    "Chhattisgarh": ["Bilaspur", "Durg", "Jagdalpur", "Korba", "Raigarh", "Raipur"],
    "Goa": ["Bicholim", "Madgaon", "Mapusa", "Panaji", "Ponda", "Vasco da Gama"],
    "Gujarat": ["Ahmedabad", "Bhavnagar", "Gandhinagar", "Jamnagar", "Rajkot", "Surat", "Vadodara"],
    "Haryana": ["Ambala", "Faridabad", "Gurugram", "Hisar", "Karnal", "Panipat", "Rohtak"],
    "Himachal Pradesh": ["Dharamshala", "Hamirpur", "Kullu", "Mandi", "Shimla", "Solan"],
    "Jharkhand": ["Bokaro", "Deoghar", "Dhanbad", "Hazaribagh", "Jamshedpur", "Ranchi"],
    "Karnataka": ["Belagavi", "Bengaluru", "Davanagere", "Hubballi", "Kalaburagi", "Mangaluru", "Mysuru", "Shivamogga"],
    "Kerala": ["Alappuzha", "Ernakulam", "Kannur", "Kochi", "Kollam", "Kozhikode", "Palakkad", "Thiruvananthapuram", "Thrissur"],
    "Madhya Pradesh": ["Bhopal", "Gwalior", "Indore", "Jabalpur", "Ratlam", "Rewa", "Sagar", "Ujjain"],
    "Maharashtra": ["Ahmednagar", "Amravati", "Aurangabad", "Kolhapur", "Nagpur", "Nashik", "Pune", "Sangli", "Satara", "Solapur", "Thane"],
    "Manipur": ["Bishnupur", "Churachandpur", "Imphal", "Kakching", "Senapati", "Thoubal"],
    "Meghalaya": ["Jowai", "Nongpoh", "Shillong", "Tura", "Williamnagar"],
    "Mizoram": ["Aizawl", "Champhai", "Kolasib", "Lunglei", "Saiha"],
    "Nagaland": ["Dimapur", "Kohima", "Mokokchung", "Tuensang", "Wokha"],
    "Odisha": ["Balasore", "Berhampur", "Bhubaneswar", "Cuttack", "Puri", "Rourkela", "Sambalpur"],
    "Punjab": ["Amritsar", "Bathinda", "Jalandhar", "Ludhiana", "Mohali", "Patiala"],
    "Rajasthan": ["Ajmer", "Alwar", "Bikaner", "Jaipur", "Jodhpur", "Kota", "Sikar", "Udaipur"],
    "Sikkim": ["Gangtok", "Geyzing", "Mangan", "Namchi", "Pakyong"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Erode", "Madurai", "Salem", "Thanjavur", "Tiruchirappalli", "Tirunelveli", "Vellore"],
    "Telangana": ["Hyderabad", "Karimnagar", "Khammam", "Nalgonda", "Nizamabad", "Warangal"],
    "Tripura": ["Agartala", "Belonia", "Dharmanagar", "Kailashahar", "Udaipur"],
    "Uttar Pradesh": ["Agra", "Aligarh", "Bareilly", "Ghaziabad", "Gorakhpur", "Jhansi", "Kanpur", "Lucknow", "Meerut", "Noida", "Prayagraj", "Varanasi"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Haldwani", "Kashipur", "Nainital", "Roorkee"],
    "West Bengal": ["Asansol", "Durgapur", "Howrah", "Kharagpur", "Kolkata", "Malda", "Siliguri"],
    "Andaman and Nicobar Islands": ["Car Nicobar", "Diglipur", "Mayabunder", "Port Blair"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
    "Delhi": ["Central Delhi", "Dwarka", "New Delhi", "North Delhi", "Rohini", "South Delhi"],
    "Jammu and Kashmir": ["Anantnag", "Baramulla", "Jammu", "Pulwama", "Srinagar", "Udhampur"],
    "Ladakh": ["Kargil", "Leh", "Nubra", "Zanskar"],
    "Lakshadweep": ["Agatti", "Amini", "Kavaratti", "Minicoy"],
    "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam"]
};
const ADMIN_EMAIL = "harsh@07gmail.com";
const AGRO_FARM_STORAGE_KEYS = {
    crop: "crop_name",
    land: "land_size",
    soil: "soil_type",
    season: "season",
    village: "village",
    language: "preferred_language",
    farmName: "farm_name",
    irrigation: "farm_irrigation",
    budget: "farm_budget",
    taluka: "farm_taluka",
    streetAddress: "farm_street_address",
    city: "farm_city",
    state: "farm_state",
    pincode: "farm_pincode",
    livestock: "farm_livestock",
    lat: "farm_lat",
    lng: "farm_lng"
};

function getAgroFarmSnapshot() {
    const read = (key, fallback = "") => localStorage.getItem(key) || fallback;
    const state = read("farm_state") || read("userState");
    const city = read("farm_city") || read("userDistrict");
    const crop = read("crop_name", "Wheat");
    const language = read("preferred_language", read("uiLanguage", "English"));

    return {
        crop,
        land: read("land_size"),
        soil: read("soil_type", "Loamy"),
        season: read("season", "Rabi"),
        village: read("village"),
        language,
        farmName: read("farm_name"),
        irrigation: read("farm_irrigation"),
        budget: read("farm_budget"),
        taluka: read("farm_taluka"),
        streetAddress: read("farm_street_address"),
        city,
        state,
        pincode: read("farm_pincode"),
        livestock: read("farm_livestock"),
        lat: read("farm_lat"),
        lng: read("farm_lng")
    };
}

function readAgroJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`Invalid cached JSON for ${key}`, error);
        localStorage.removeItem(key);
        return fallback;
    }
}

function saveAgroFarmSnapshot(values = {}) {
    const normalized = {
        crop: values.crop ?? values.crop_name ?? values.primary_crop,
        land: values.land ?? values.land_size,
        soil: values.soil ?? values.soil_type,
        season: values.season,
        village: values.village,
        language: values.language ?? values.preferred_language,
        farmName: values.farmName ?? values.farm_name,
        irrigation: values.irrigation ?? values.irrigation_type,
        budget: values.budget ?? values.season_budget,
        taluka: values.taluka,
        streetAddress: values.streetAddress ?? values.street_address,
        city: values.city ?? values.district,
        state: values.state,
        pincode: values.pincode ?? values.pin_code,
        livestock: values.livestock,
        lat: values.lat,
        lng: values.lng
    };

    Object.entries(AGRO_FARM_STORAGE_KEYS).forEach(([field, storageKey]) => {
        if (normalized[field] !== undefined && normalized[field] !== null) {
            localStorage.setItem(storageKey, String(normalized[field]));
        }
    });

    if (normalized.state) localStorage.setItem("userState", String(normalized.state));
    if (normalized.city) localStorage.setItem("userDistrict", String(normalized.city));
    if (normalized.language) localStorage.setItem("uiLanguage", String(normalized.language));

    window.dispatchEvent(new CustomEvent("agro-farm-profile-updated", { detail: getAgroFarmSnapshot() }));
    return getAgroFarmSnapshot();
}

function mergeRemoteAgroProfile(payload = {}) {
    const profile = payload.profile || {};
    const farmProfile = payload.farm_profile || {};
    return saveAgroFarmSnapshot({
        crop: farmProfile.primary_crop || profile.crop_name,
        land: profile.land_size,
        soil: profile.soil_type,
        season: profile.season,
        village: profile.village,
        language: profile.preferred_language,
        state: profile.state,
        city: profile.district,
        farmName: farmProfile.farm_name,
        irrigation: farmProfile.irrigation_type,
        livestock: farmProfile.livestock,
        taluka: farmProfile.taluka,
        pincode: farmProfile.pin_code,
        lat: farmProfile.lat,
        lng: farmProfile.lng
    });
}

async function refreshAgroProfileFromServer() {
    const userId = parseInt(localStorage.getItem("userId") || "0", 10);
    if (!userId) return getAgroFarmSnapshot();

    const apiBase = window.AGRO_API_URL || "http://127.0.0.1:8000";
    try {
        const response = await fetch(`${apiBase}/profile/${userId}`);
        if (!response.ok) throw new Error(`profile refresh failed: ${response.status}`);
        return mergeRemoteAgroProfile(await response.json());
    } catch (error) {
        console.error("profile refresh error", error);
        return getAgroFarmSnapshot();
    }
}

function isAdminUser() {
    const currentUser = localStorage.getItem("user");
    const role = (localStorage.getItem("userRole") || "").toLowerCase();
    const email = (localStorage.getItem("userEmail") || "").toLowerCase();
    return Boolean(currentUser) && (role === "admin" || email === ADMIN_EMAIL);
}

function goToAdminPanel() {
    if (!isAdminUser()) {
        window.location.replace("login.html");
        return;
    }
    window.location.href = "admin.html";
}

function logout() {
    [
        "user",
        "userId",
        "userEmail",
        "userMobile",
        "userDob",
        "userState",
        "userDistrict",
        "userRole",
        "isAdmin",
        "phoneVerified"
    ].forEach((key) => localStorage.removeItem(key));
    window.location.href = "login.html";
}

function getPageKey() {
    const bodyPage = document.body?.dataset?.page;
    if (bodyPage) return bodyPage.toLowerCase();
    const fileName = window.location.pathname.split("/").pop()?.toLowerCase() || "";
    return fileName.replace(".html", "") || "index";
}

function escapeAgroText(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderUserWelcome(element, user) {
    if (!element) return;
    const firstName = String(user || "Farmer").trim().split(/\s+/)[0] || "Farmer";
    element.innerHTML = `<span class="welcome-live-dot" aria-hidden="true"></span>${escapeAgroText(firstName)}'s live farm desk`;
}

function getHeaderSubtitle(pageKey) {
    const subtitles = {
        home: "Your daily farming control room",
        index: "Your daily farming control room",
        "my-farm": "Farm setup and planning",
        "crop-care": "Crop protection and crop health",
        market: "Market intelligence and selling tools",
        "sell-produce": "Farmer produce selling and buying",
        shop: "Smart buying for your farm inputs",
        cart: "Review your farm cart",
        checkout: "Structured payment and checkout",
        schemes: "Government schemes and support",
        community: "Farmer community and discussions",
        profile: "Your farming profile and history",
        dashboard: "Your daily farming control room"
    };
    return subtitles[pageKey] || "Your daily farming control room";
}

function renderUnifiedHeader() {
    const body = document.body;
    const topBar = document.querySelector(".top-bar");
    if (!body || !topBar) return;
    if (body.classList.contains("login-page")) return;
    if (window.location.pathname.toLowerCase().endsWith("admin.html")) return;

    const pageKey = getPageKey();
    const activeHome = pageKey === "home" || pageKey === "index" || pageKey === "dashboard";
    const subtitle = getHeaderSubtitle(pageKey);
    const adminButtonMarkup = isAdminUser()
        ? `<a id="adminNavButton" class="nav-btn clean-secondary-btn" href="admin.html">Admin Panel</a>`
        : "";

    topBar.classList.add("clean-top-bar");
    topBar.innerHTML = `
        <div class="brand-left">
            <a class="brand-mark clean-brand-mark brand-home-link" href="index.html" aria-label="Go to home">AgroGyanGPT</a>
            <div id="welcomeUser" class="welcome-text">${subtitle}</div>
        </div>
        <div class="top-actions clean-top-actions">
            <nav class="clean-nav" aria-label="Primary">
                <a class="clean-nav-link ${activeHome ? "active" : ""}" href="index.html">Home</a>
                <details class="nav-dropdown">
                    <summary class="clean-nav-link">Farmer Setup</summary>
                    <div class="dropdown-panel">
                        <a href="my-farm.html">My Farm</a>
                        <a href="crop-care.html">Crop Care</a>
                        <a href="market.html">Market</a>
                        <a href="sell-crops.html">Sell Produce</a>
                        <a href="shop.html">Smart Shop</a>
                    </div>
                </details>
                <details class="nav-dropdown">
                    <summary class="clean-nav-link">More</summary>
                    <div class="dropdown-panel">
                        <a href="schemes.html">Schemes</a>
                        <a href="community.html">Community</a>
                        <a href="profile.html">Profile</a>
                    </div>
                </details>
            </nav>
            <div class="header-utility">
                <select id="uiLanguage" class="lang-select clean-select" aria-label="UI Language">
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Marathi">Marathi</option>
                </select>
                <button id="authButton" class="nav-btn clean-primary-btn" type="button" onclick="logout()">Logout</button>
                ${adminButtonMarkup}
            </div>
        </div>
    `;
}

function injectAdminNavButton() {
    if (document.getElementById("adminNavButton")) return;
    if (!isAdminUser()) return;
    if (window.location.pathname.toLowerCase().endsWith("admin.html")) return;

    const topActions = document.querySelector(".top-actions");
    const topBar = document.querySelector(".top-bar");
    if (!topActions || document.getElementById("adminNavButton")) return;

    const button = document.createElement("button");
    button.id = "adminNavButton";
    button.className = "nav-btn";
    button.type = "button";
    button.innerText = "Admin Panel";
    button.addEventListener("click", goToAdminPanel);

    const authButton = document.getElementById("authButton");
    if (authButton) {
        topActions.insertBefore(button, authButton);
    } else {
        topActions.appendChild(button);
    }

    topActions.classList.add("admin-actions-row");
    if (topBar) {
        topBar.classList.add("with-admin-nav");
    }
}

function prefetchCorePages() {
    const prefetchedPages = new Set();

    const prefetchPage = (href) => {
        if (!href || href.startsWith("#")) return;

        let target;
        try {
            target = new URL(href, window.location.href);
        } catch (error) {
            return;
        }

        if (target.origin !== window.location.origin) return;
        if (!target.pathname.endsWith(".html") && !target.pathname.endsWith("/")) return;

        target.hash = "";
        const key = target.href;
        if (prefetchedPages.has(key)) return;
        prefetchedPages.add(key);

        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = key;
        document.head.appendChild(link);
    };

    const prefetchFromEvent = (event) => {
        const link = event.target?.closest?.("a[href]");
        if (link) prefetchPage(link.getAttribute("href"));
    };

    document.addEventListener("pointerover", prefetchFromEvent, { passive: true });
    document.addEventListener("focusin", prefetchFromEvent);
    document.addEventListener("touchstart", prefetchFromEvent, { passive: true });
    document.addEventListener("mousedown", prefetchFromEvent);
}

function populateIndiaLocationSelectors(stateId = "regState", districtId = "regDistrict") {
    const stateSelect = document.getElementById(stateId);
    const districtSelect = document.getElementById(districtId);

    if (!stateSelect || !districtSelect) return;

    const stateNames = Object.keys(INDIA_LOCATIONS);

    if (!stateSelect.dataset.loaded) {
        const selectStateText = typeof t === "function" ? t("selectState") : "Select state";
        stateSelect.innerHTML = `<option value="">${selectStateText}</option>` + stateNames.map(state => `<option value="${state}">${state}</option>`).join("");
        stateSelect.dataset.loaded = "1";
    }

    const fillDistricts = (selectedState) => {
        const districts = INDIA_LOCATIONS[selectedState] || [];
        const selectDistrictText = typeof t === "function" ? t("selectDistrictCity") : "Select district / city";
        districtSelect.innerHTML = `<option value="">${selectDistrictText}</option>` + districts.map(place => `<option value="${place}">${place}</option>`).join("");
        districtSelect.disabled = !selectedState;
    };

    stateSelect.addEventListener("change", () => fillDistricts(stateSelect.value));
    fillDistricts(stateSelect.value);
}

function injectFarmBot() {
    if (document.getElementById("farmBot")) return;

    const bot = document.createElement("div");
    bot.id = "farmBot";
    bot.className = "farm-bot";
    bot.setAttribute("aria-hidden", "true");
    bot.innerHTML = `
        <div class="farm-bot-shadow"></div>
        <div class="farm-bot-frame"></div>
        <div class="farm-bot-backdrop"></div>
        <div class="farm-bot-leaf leaf-a"></div>
        <div class="farm-bot-leaf leaf-b"></div>
        <div class="farm-bot-hat">
            <span class="hat-band"></span>
        </div>
        <div class="farm-bot-head">
            <div class="farm-bot-face">
                <span class="farm-bot-eye left"></span>
                <span class="farm-bot-eye right"></span>
                <span class="farm-bot-heart"></span>
                <span class="farm-bot-mouth"></span>
            </div>
        </div>
        <div class="farm-bot-neck"></div>
        <div class="farm-bot-body">
            <span class="farm-bot-shirt"></span>
            <span class="farm-bot-strap left"></span>
            <span class="farm-bot-strap right"></span>
            <span class="farm-bot-pocket"></span>
        </div>
        <div class="farm-bot-arm left"></div>
        <div class="farm-bot-arm right"></div>
        <div class="farm-bot-bag">
            <span class="bag-seed seed-a"></span>
            <span class="bag-seed seed-b"></span>
            <span class="bag-seed seed-c"></span>
        </div>
        <div class="farm-bot-leg left"></div>
        <div class="farm-bot-leg right"></div>
        <div class="farm-bot-foot left"></div>
        <div class="farm-bot-foot right"></div>
    `;

    document.body.appendChild(bot);
}

function getSeasonTheme() {
    const storedSeason = (localStorage.getItem("season") || "").toLowerCase();
    if (storedSeason === "kharif") return "monsoon";
    if (storedSeason === "harvest") return "harvest";
    if (storedSeason === "summer") return "summer";
    if (storedSeason === "rabi") return "winter";

    const month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 9) return "monsoon";
    if (month >= 10 && month <= 11) return "harvest";
    if (month >= 3 && month <= 5) return "summer";
    return "winter";
}

function getDayPhase() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return "phase-dawn";
    if (hour >= 8 && hour < 17) return "phase-day";
    if (hour >= 17 && hour < 20) return "phase-dusk";
    return "phase-night";
}

function applyAmbientTheme() {
    const body = document.body;
    if (!body) return;

    body.classList.remove("phase-dawn", "phase-day", "phase-dusk", "phase-night");
    body.classList.remove("season-monsoon", "season-harvest", "season-summer", "season-winter");
    body.classList.add(getDayPhase());
    body.classList.add(`season-${getSeasonTheme()}`);
}

function injectAssistantOrb() {
    if (document.body.classList.contains("login-page")) return;
    if (document.getElementById("assistantOrb")) return;

    const orb = document.createElement("button");
    orb.id = "assistantOrb";
    orb.className = "assistant-orb";
    orb.type = "button";
    orb.innerHTML = `
        <span class="assistant-orb-core"></span>
        <span class="assistant-orb-ring ring-a"></span>
        <span class="assistant-orb-ring ring-b"></span>
        <span class="assistant-orb-label">AI</span>
    `;

    orb.addEventListener("click", () => {
        const hub = document.getElementById("assistantHub");
        if (hub) {
            hub.scrollIntoView({ behavior: "auto", block: "start" });
            const question = document.getElementById("question");
            if (question) question.focus();
        } else {
            window.location.href = "index.html#assistantHub";
        }
    });

    document.body.appendChild(orb);
}

function initLoginIntro() {
    const body = document.body;
    const intro = document.getElementById("loginIntro");
    if (!body || !body.classList.contains("login-page") || !intro) return;

    intro.classList.add("is-hidden");
    intro.setAttribute("aria-hidden", "true");
    intro.style.display = "none";
    body.classList.remove("intro-active");
    body.classList.add("intro-complete");
    intro.querySelectorAll("video").forEach((video) => {
        try {
            video.pause();
            video.removeAttribute("src");
            video.load();
        } catch (error) {
            console.error("intro video cleanup error", error);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    renderUnifiedHeader();
    populateIndiaLocationSelectors();
    initLoginIntro();
    injectAssistantOrb();
    applyAmbientTheme();
    injectAdminNavButton();
    prefetchCorePages();
});

window.INDIA_LOCATIONS = INDIA_LOCATIONS;
window.populateIndiaLocationSelectors = populateIndiaLocationSelectors;
window.applyAmbientTheme = applyAmbientTheme;
window.initLoginIntro = initLoginIntro;
window.isAdminUser = isAdminUser;
window.goToAdminPanel = goToAdminPanel;
window.logout = logout;
window.readAgroJson = readAgroJson;
window.getAgroFarmSnapshot = getAgroFarmSnapshot;
window.saveAgroFarmSnapshot = saveAgroFarmSnapshot;
window.mergeRemoteAgroProfile = mergeRemoteAgroProfile;
window.refreshAgroProfileFromServer = refreshAgroProfileFromServer;
window.renderUserWelcome = renderUserWelcome;
