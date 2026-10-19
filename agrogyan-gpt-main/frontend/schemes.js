const schemes = [
    { name: "PM-KISAN", category: "income", benefit: "Rs 6000 yearly support to farmers", link: "https://pmkisan.gov.in" },
    { name: "PM Kisan Maandhan", category: "income", benefit: "Pension support for small and marginal farmers", link: "https://maandhan.in" },
    { name: "PM Fasal Bima Yojana", category: "insurance", benefit: "Crop insurance protection against major losses", link: "https://pmfby.gov.in" },
    { name: "Weather Based Crop Insurance", category: "insurance", benefit: "Insurance support linked to weather conditions", link: "https://pmfby.gov.in" },
    { name: "Kisan Credit Card", category: "loan", benefit: "Low-interest working capital for farm needs", link: "https://www.myscheme.gov.in/schemes/kcc" },
    { name: "Agriculture Infrastructure Fund", category: "loan", benefit: "Funding support for agri infrastructure projects", link: "https://agriinfra.dac.gov.in" },
    { name: "PM Krishi Sinchai Yojana", category: "irrigation", benefit: "Improves irrigation access and water use efficiency", link: "https://pmksy.gov.in" },
    { name: "PM-KUSUM", category: "irrigation", benefit: "Solar pump support for agriculture", link: "https://pmkusum.mnre.gov.in" },
    { name: "Soil Health Card", category: "tech", benefit: "Helps understand soil nutrients and improve yield planning", link: "https://soilhealth.dac.gov.in" },
    { name: "e-NAM", category: "tech", benefit: "Digital agricultural market access across mandis", link: "https://enam.gov.in" }
];

function pageText(key) {
    const lang = typeof getUILanguage === "function" ? getUILanguage() : "English";
    const copy = {
        English: {
            eligible: "Likely eligible",
            checkDocs: "Check documents",
            completeProfile: "Complete your farm profile for stronger scheme matching.",
            aadhaar: "Aadhaar card",
            bank: "Bank passbook",
            land: "Land record / 7-12 extract",
            mobile: "Registered mobile number",
            crop: "Crop details and sowing proof",
            noSchemesFound: "No schemes found for this category.",
            starred: "Starred",
            star: "Star"
        },
        Hindi: {
            eligible: "संभावित रूप से पात्र",
            checkDocs: "दस्तावेज़ जाँचें",
            completeProfile: "बेहतर योजना मिलान के लिए खेत प्रोफ़ाइल पूरी करें।",
            aadhaar: "आधार कार्ड",
            bank: "बैंक पासबुक",
            land: "भूमि रिकॉर्ड / 7-12",
            mobile: "पंजीकृत मोबाइल नंबर",
            crop: "फसल विवरण और बुवाई प्रमाण",
            noSchemesFound: "इस श्रेणी के लिए कोई योजना नहीं मिली।",
            starred: "सहेजी गई",
            star: "सहेजें"
        },
        Marathi: {
            eligible: "बहुधा पात्र",
            checkDocs: "कागदपत्रे तपासा",
            completeProfile: "चांगल्या योजना जुळणीसाठी शेत प्रोफाइल पूर्ण करा.",
            aadhaar: "आधार कार्ड",
            bank: "बँक पासबुक",
            land: "जमिनीचा उतारा / 7-12",
            mobile: "नोंदणीकृत मोबाईल नंबर",
            crop: "पीक तपशील आणि पेरणी पुरावा",
            noSchemesFound: "या वर्गासाठी कोणतीही योजना सापडली नाही.",
            starred: "सेव्ह",
            star: "सेव्ह करा"
        }
    };
    return copy[lang]?.[key] || copy.English[key] || key;
}

function getFavoriteSchemes() {
    return typeof window.readAgroJson === "function" ? window.readAgroJson("favoriteSchemes", []) : [];
}

function toggleFavorite(schemeName) {
    const current = getFavoriteSchemes();
    const index = current.indexOf(schemeName);
    if (index >= 0) {
        current.splice(index, 1);
    } else {
        current.push(schemeName);
    }
    localStorage.setItem("favoriteSchemes", JSON.stringify(current));
    renderSchemes(currentTab);
}

function isFavorite(schemeName) {
    return getFavoriteSchemes().includes(schemeName);
}

let currentTab = "all";

function setSchemeTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-category") === tab);
    });
    renderSchemes(tab);
}

function createCard(scheme) {
    const favorited = isFavorite(scheme.name);

    return `
    <div class="scheme-card">
        <div class="scheme-card-header">
            <h3>${scheme.name}</h3>
            <button class="favorite-btn" aria-label="Toggle favorite" onclick="toggleFavorite('${scheme.name}')" type="button">
                ${favorited ? pageText("starred") : pageText("star")}
            </button>
        </div>
        <p>${scheme.benefit}</p>
        <div class="scheme-actions">
            <a href="${scheme.link}" target="_blank" rel="noreferrer">
                <button class="primary-btn" type="button">${t("applyLearnMore") || "Apply / Learn more"}</button>
            </a>
        </div>
    </div>
    `;
}

function renderSchemes(tab) {
    const container = document.getElementById("schemeList");

    let filtered = schemes;
    if (tab && tab !== "all") {
        if (tab === "favorites") {
            const favorites = getFavoriteSchemes();
            filtered = schemes.filter(s => favorites.includes(s.name));
        } else {
            filtered = schemes.filter(s => s.category === tab);
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="post-box">${pageText("noSchemesFound")}</div>`;
        return;
    }

    container.innerHTML = filtered.map(createCard).join("");
}

function setTheme(theme) {
    document.body.classList.toggle("dark-mode", theme === "dark");
    localStorage.setItem("theme", theme);
    const themeButton = document.getElementById("themeButton");
    if (themeButton) {
        themeButton.innerText = theme === "dark" ? t("light") : t("dark");
    }
}

function toggleTheme() {
    const active = document.body.classList.contains("dark-mode") ? "dark" : "light";
    setTheme(active === "dark" ? "light" : "dark");
}

if (typeof initI18n === "function") {
    initI18n();
}
setTheme(localStorage.getItem("theme") || "light");
renderSchemes(currentTab);
renderEligibilityDesk();

const currentUser = localStorage.getItem("user");
if (!currentUser) {
    window.location.href = "login.html";
}

const welcomeUser = document.getElementById("welcomeUser");
if (welcomeUser) {
    if (currentUser && typeof window.renderUserWelcome === "function") {
        window.renderUserWelcome(welcomeUser, currentUser);
    } else {
        welcomeUser.innerText = currentUser ? `${String(currentUser).trim().split(/\s+/)[0] || "Farmer"}'s live farm desk` : "";
    }
}

function goHome() {
    window.location.href = "index.html";
}

function goToCommunity() {
    window.location.href = "community.html";
}

function goToMyFarm() {
    window.location.href = "my-farm.html";
}

function goToCropCare() {
    window.location.href = "crop-care.html";
}

function goToMarket() {
    window.location.href = "market.html";
}

function goToProfile() {
    window.location.href = "profile.html";
}

function logout() {
    if (confirm(t("confirmLogout"))) {
        localStorage.removeItem("user");
        localStorage.removeItem("userId");
        window.location.href = "login.html";
    }
}

function renderEligibilityDesk() {
    const eligibilitySummary = document.getElementById("eligibilitySummary");
    const documentChecklist = document.getElementById("documentChecklist");
    const farm = typeof window.getAgroFarmSnapshot === "function" ? window.getAgroFarmSnapshot() : {};
    const crop = farm.crop || localStorage.getItem("crop_name");
    const land = farm.land || localStorage.getItem("land_size");
    const season = farm.season || localStorage.getItem("season");
    const irrigation = (farm.irrigation || localStorage.getItem("farm_irrigation") || "").toLowerCase();
    const items = [];
    if (crop) items.push(`PM-KISAN: ${pageText("eligible")}`);
    if (land) items.push(`Kisan Credit Card: ${pageText("eligible")}`);
    if (crop && season) items.push(`PM Fasal Bima Yojana: ${pageText("eligible")}`);
    if (irrigation && !irrigation.includes("drip")) items.push(`PM Krishi Sinchai Yojana: ${pageText("checkDocs")}`);
    if (!items.length) items.push(pageText("completeProfile"));
    if (eligibilitySummary) {
        eligibilitySummary.innerHTML = items.map(item => `<div class="timeline-item"><p>${item}</p></div>`).join("");
    }
    if (documentChecklist) {
        documentChecklist.innerHTML = "";
        [pageText("aadhaar"), pageText("bank"), pageText("land"), pageText("mobile"), pageText("crop")]
            .forEach((item) => {
                documentChecklist.insertAdjacentHTML("beforeend", `<div class="timeline-item"><p>${item}</p></div>`);
            });
    }
}

window.addEventListener("ui-language-changed", () => {
    renderSchemes(currentTab);
    renderEligibilityDesk();
});

window.addEventListener("agro-farm-profile-updated", renderEligibilityDesk);
if (typeof window.refreshAgroProfileFromServer === "function") {
    window.refreshAgroProfileFromServer().then(renderEligibilityDesk);
}
