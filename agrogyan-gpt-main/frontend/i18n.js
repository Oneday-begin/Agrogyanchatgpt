// UI translation support (English / Hindi / Marathi)
// Usage: Add data-i18n="key" attributes to text elements.
//        Add data-i18n-placeholder="key" for input placeholders.
//        Add data-i18n-title="key" for title/tooltips.

const UI_TRANSLATIONS = {
    English: {
        // Core labels
        appName: "AgroGyanGPT",
        welcomeTitle: "Welcome to AgroGyanGPT",
        welcomeTagline: "Where innovation meets agriculture",
        welcomeDescription: "Harvest answers from trusted agricultural knowledge.",
        getGrowing: "Get Growing",
        tapToContinue: "Tap anywhere to continue",

        // Navigation
        home: "Home",
        connectFarmers: "Connect Farmers",
        schemes: "Government Schemes",
        profile: "Profile",
        login: "Login",
        logout: "Logout",
        speak: "Speak",
        clearHistory: "Clear",
        schemesSubtitle: "Explore important agricultural schemes",

        // Chat
        ask: "Ask",
        questionPlaceholder: "Type or speak your agriculture question...",
        answerTitle: "Answer",
        answerWaiting: "Waiting for your question...",
        confidence: "Confidence:",
        noHistory: "No history yet. Ask a question to start.",
        yourHistory: "Your History",
        noSchemes: "No schemes found.",
        tabAll: "All",
        tabIncome: "Income",
        tabInsurance: "Insurance",
        tabLoans: "Loans",
        tabIrrigation: "Irrigation",
        tabTech: "Tech",
        tabFavorites: "Favorites",
        applyLearnMore: "Apply / Learn more",

        // Auth
        loginTitle: "Login",
        loginSubtitle: "Secure Access Portal",
        emailPlaceholder: "Email Address",
        passwordPlaceholder: "Password",
        register: "Register",
        registerTitle: "Create an account",
        fullNamePlaceholder: "Full name",
        hasAccountPrompt: "Already have an account?",
        notRegisteredPrompt: "Not registered?",
        registerHere: "Register here",
        backToLogin: "Back to login",

        // Profile
        yourProfile: "Your Profile",
        accountInfo: "Account Info",
        nameLabel: "Name:",
        emailLabel: "Email:",
        joinedLabel: "Joined:",
        savedSchemes: "Saved Schemes",
        savedPosts: "Saved Posts",
        questionHistory: "Question History",
        noFavorites: "No favorites yet.",
        noPostsSaved: "No posts saved yet.",
        noQuestions: "No questions asked yet.",

        // Misc
        welcomeUserPrefix: "Live desk: ",
        communityTitle: "Farmer Community",
        communityPostPlaceholder: "Ask something to the community...",
        communitySearchPlaceholder: "Search community posts...",
        communityPostButton: "Post",
        communitySearchButton: "Search",
        communityLoadMore: "Load more",
        communityNewPost: "+ New post",
        communityRefresh: "↻ Refresh",
        tourWelcome: "Welcome!",
        tourText: "Let's walk through the community features.",
        tourStep1Title: "Welcome to your community",
        tourStep1Text: "This is the place to share ideas, ask questions, and help other farmers. Let us show you around.",
        tourStep2Title: "Create a post",
        tourStep2Text: "Start a discussion by typing in the box at the top and tapping Post. Your fellow farmers will see it instantly.",
        tourStep3Title: "React & reply",
        tourStep3Text: "Use emoji reactions or reply to posts to keep the conversation going. You can even edit or delete your own posts.",
        tourStep4Title: "Search & explore",
        tourStep4Text: "Use the search box to quickly find posts, and tap Load more to see older discussions.",
        tourNext: "Next",
        tourSkip: "Skip",
        confirmLogout: "Are you sure you want to logout?",
        pleaseEnterQuestion: "Please enter a question.",
        enterEmailPassword: "Please enter email and password",
        invalidEmail: "Please enter a valid email address",
        passwordTooShort: "Password must be at least 6 characters",
        fillAllFields: "Please fill out all fields.",
        unableToLogin: "Unable to login. Please try again.",
        unableToRegister: "Unable to register. Please try again.",
        registrationSuccess: "Registration successful! Please log in.",
        registrationFailed: "Registration failed.",
        pleaseSelectImage: "Please select an image.",
        backendNotReachable: "Backend not reachable.",
        extractingImage: "Extracting text from image...",
        errorUploadingImage: "Error uploading image.",
        speechNotSupported: "Speech not supported in this browser.",
        speechRecognitionNotSupported: "Speech recognition not supported in this browser.",

        writeSomethingFirst: "Write something first",
        pleaseLoginToPost: "Please login to post.",
        postedSuccess: "Posted! Your post is now live.",
        unableToPost: "Unable to post. Check your backend.",
        unableToLoadPosts: "Unable to load posts. Is the backend running?",
        loadingPosts: "Loading posts...",
        noPostsYet: "No posts yet — be the first to share!",
        unableToRenderPosts: "Unable to display posts. Please refresh.",
        reactedWithEmoji: "Reacted with {emoji}",
        unableToReact: "Unable to react. Check your backend.",
        liked: "Liked 👍",
        unableToLike: "Unable to like. Check your backend.",
        disliked: "Disliked 👎",
        unableToDislike: "Unable to dislike. Check your backend.",
        repliedToPost: "Replied to the post.",
        unableToAddComment: "Unable to add comment. Check your backend.",
        editPostPrompt: "Edit your post:",
        postUpdated: "Post updated!",
        deletePostConfirm: "Delete this post?",
        postRemoved: "Post removed.",
    },
    Hindi: {
        appName: "अग्रोज्ञानजीपीटी",
        welcomeTitle: "अग्रोज्ञानजीपीटी में आपका स्वागत है",
        welcomeTagline: "जहाँ नवाचार मिलता है कृषि से",
        welcomeDescription: "विश्वसनीय कृषि ज्ञान से उत्तर प्राप्त करें।",
        getGrowing: "शुरू करें",
        tapToContinue: "जारी रखने के लिए कहीं भी टैप करें",

        home: "मुख पृष्ठ",
        connectFarmers: "किसानों से जुड़ें",
        schemes: "सरकारी योजनाएँ",
        profile: "प्रोफ़ाइल",
        login: "लॉगिन",
        logout: "लॉग आउट",
        speak: "बोलें",
        clearHistory: "साफ करें",
        schemesSubtitle: "महत्वपूर्ण कृषि योजनाओं का अन्वेषण करें",

        ask: "पूछें",
        questionPlaceholder: "कृषि प्रश्न टाइप करें या बोलें...",
        answerTitle: "उत्तर",
        answerWaiting: "आपके प्रश्न की प्रतीक्षा...",
        confidence: "विश्वास:",
        noHistory: "कोई इतिहास नहीं। शुरुआत करने के लिए एक प्रश्न पूछें।",
        yourHistory: "आपका इतिहास",
        noSchemes: "कोई योजना नहीं मिली।",

        loginTitle: "लॉगिन",
        loginSubtitle: "सुरक्षित पहुँच पोर्टल",
        emailPlaceholder: "ईमेल पता",
        passwordPlaceholder: "पासवर्ड",
        register: "रजिस्टर करें",
        registerTitle: "एक खाता बनाएं",
        fullNamePlaceholder: "पूरा नाम",
        hasAccountPrompt: "पहले से खाता है?",
        notRegisteredPrompt: "पंजीकृत नहीं?",
        registerHere: "यहाँ रजिस्टर करें",
        backToLogin: "वापस लॉगिन पर",

        yourProfile: "आपकी प्रोफ़ाइल",
        accountInfo: "खाता जानकारी",
        nameLabel: "नाम:",
        emailLabel: "ईमेल:",
        joinedLabel: "जुड़ा:",
        savedSchemes: "सहेजी गई योजनाएँ",
        savedPosts: "सहेजे गए पोस्ट",
        questionHistory: "प्रश्न इतिहास",
        noFavorites: "अभी कोई पसंदीदा नहीं।",
        noPostsSaved: "अभी कोई पोस्ट सहेजा नहीं गया।",
        noQuestions: "अभी तक कोई प्रश्न नहीं पूछा गया।",
        welcomeUserPrefix: "लाइव डेस्क: ",
        communityTitle: "किसान समुदाय",
        communityPostPlaceholder: "समुदाय से कुछ पूछें...",
        communitySearchPlaceholder: "समुदाय पोस्ट खोजें...",
        communityPostButton: "पोस्ट",
        communitySearchButton: "खोजें",
        communityLoadMore: "और दिखाएं",
        communityNewPost: "+ नया पोस्ट",
        communityRefresh: "↻ रीफ्रेश",
        tourWelcome: "स्वागत है!",
        tourText: "आइए समुदाय की विशेषताओं के बारे में जानें।",
        tourStep1Title: "आपके समुदाय में आपका स्वागत है",
        tourStep1Text: "यह विचार साझा करने, प्रश्न पूछने और अन्य किसानों की मदद करने का स्थान है। आइए आपको मार्गदर्शन करें।",
        tourStep2Title: "एक पोस्ट बनाएं",
        tourStep2Text: "ऊपर बॉक्स में टाइप करके और पोस्ट पर टैप करके चर्चा शुरू करें। आपके साथी किसान इसे तुरंत देखेंगे।",
        tourStep3Title: "प्रतिक्रिया दें और उत्तर दें",
        tourStep3Text: "इमोजी प्रतिक्रियाओं का उपयोग करें या पोस्टों पर उत्तर दें ताकि बातचीत जारी रहे। आप अपने पोस्ट को संपादित या हटा भी सकते हैं।",
        tourStep4Title: "खोजें और अन्वेषण करें",
        tourStep4Text: "पोस्ट खोजने के लिए खोज बॉक्स का उपयोग करें, और पुराने चर्चाओं को देखने के लिए लोड मोर पर टैप करें।",
        tourNext: "अगला",
        tourSkip: "छोड़ें",

        confirmLogout: "क्या आप वाकई लॉगआउट करना चाहते हैं?",
        pleaseEnterQuestion: "कृपया एक प्रश्न दर्ज करें।",
        enterEmailPassword: "कृपया ईमेल और पासवर्ड दर्ज करें",
        invalidEmail: "कृपया एक मान्य ईमेल पता दर्ज करें",
        passwordTooShort: "पासवर्ड कम से कम 6 वर्ण का होना चाहिए",
        fillAllFields: "कृपया सभी फ़ील्ड भरें।",
        unableToLogin: "लॉगिन करने में असमर्थ। कृपया पुनः प्रयास करें।",
        unableToRegister: "रजिस्टर करने में असमर्थ। कृपया पुनः प्रयास करें।",
        registrationSuccess: "पंजीकरण सफल! कृपया लॉगिन करें.",
        registrationFailed: "पंजीकरण विफल हुआ।",
        pleaseSelectImage: "कृपया एक छवि चुनें।",
        backendNotReachable: "बैकएंड उपलब्ध नहीं है।",
        extractingImage: "छवि से पाठ निकाल रहा है...",
        errorUploadingImage: "छवि अपलोड करने में त्रुटि।",
        speechNotSupported: "यह ब्राउज़र भाषण का समर्थन नहीं करता है।",
        speechRecognitionNotSupported: "यह ब्राउज़र स्पीच रिकग्निशन का समर्थन नहीं करता।",

        writeSomethingFirst: "पहले कुछ लिखें",
        postedSuccess: "सफलतापूर्वक पोस्ट किया गया! आपकी पोस्ट अब लाइव है।",
        unableToPost: "पोस्ट करने में असमर्थ। कृपया बैकएंड जांचें।",
        unableToLoadPosts: "पोस्ट लोड करने में असमर्थ। क्या बैकएंड चल रहा है?",
        loadingPosts: "पोस्ट लोड हो रहे हैं...",
        noPostsYet: "कोई पोस्ट नहीं है — पहला शेयर करें!",
        unableToRenderPosts: "पोस्ट प्रदर्शित करने में असमर्थ। कृपया रिफ्रेश करें।",
        reactedWithEmoji: "${emoji} के साथ प्रतिक्रिया दी गई",
        unableToReact: "प्रतिक्रिया करने में असमर्थ। कृपया बैकएंड जांचें।",
        liked: "लाइक किया 👍",
        unableToLike: "लाइक करने में असमर्थ। कृपया बैकएंड जांचें।",
        disliked: "अनफॉलो किया 👎",
        unableToDislike: "अनफॉलो करने में असमर्थ। कृपया बैकएंड जांचें।",
        repliedToPost: "पोस्ट का उत्तर दिया गया।",
        unableToAddComment: "टिप्पणी जोड़ने में असमर्थ। कृपया बैकएंड जांचें।",
        editPostPrompt: "अपनी पोस्ट संपादित करें:",
        postUpdated: "पोस्ट अपडेट की गई!",
        deletePostConfirm: "इस पोस्ट को हटाएं?",
        postRemoved: "पोस्ट हटा दी गई।",
    },
    Marathi: {
        appName: "अ‍ॅग्रोज्ञानजीपीटी",
        welcomeTitle: "अ‍ॅग्रोज्ञानजीपीटी मध्ये आपले स्वागत आहे",
        welcomeTagline: "इनोव्हेशन शेतीशी भेटते",
        welcomeDescription: "विश्वसनीय कृषी ज्ञानातून उत्तरे मिळवा.",
        getGrowing: "सुरू करूया",
        tapToContinue: "सुरू करण्यासाठी कुठेही टॅप करा",

        home: "मुख्य",
        connectFarmers: "शेतकर्‍यांशी जोडा",
        schemes: "सरकारी योजना",
        profile: "प्रोफाइल",
        login: "लॉगिन",
        logout: "लॉग आउट",
        speak: "बोल",
        clearHistory: "काढा",
        schemesSubtitle: "महत्वाचे कृषी योजनांचे अन्वेषण करा",

        ask: "विचारा",
        questionPlaceholder: "शेतीचा प्रश्न टाइप करा किंवा बोला...",
        answerTitle: "उत्तर",
        answerWaiting: "आपल्या प्रश्नाची प्रतीक्षा...",
        confidence: "विश्वास:",
        noHistory: "कोणतेही इतिहास नाही. सुरू करण्यासाठी प्रश्न विचारा.",
        yourHistory: "तुमचा इतिहास",
        noSchemes: "कोणतीही योजना सापडली नाही.",

        loginTitle: "लॉगिन",
        loginSubtitle: "सुरक्षित प्रवेश पोर्टल",
        emailPlaceholder: "ईमेल पत्ता",
        passwordPlaceholder: "पासवर्ड",
        register: "नोंदणी करा",
        registerTitle: "खाते तयार करा",
        fullNamePlaceholder: "पूर्ण नाव",
        hasAccountPrompt: "आधीच खाते आहे?",
        notRegisteredPrompt: "नोंदणी नाही?",
        registerHere: "इथे नोंदणी करा",
        backToLogin: "लॉगिनवर परत जा",

        yourProfile: "आपले प्रोफाइल",
        accountInfo: "खाते माहिती",
        nameLabel: "नाव:",
        emailLabel: "ईमेल:",
        joinedLabel: "जोडले गेले:",
        savedSchemes: "जतन केलेल्या योजना",
        savedPosts: "जतन केलेले पोस्ट",
        questionHistory: "प्रश्न इतिहास",
        noFavorites: "अजून कोणतेही आवडते नाहीत.",
        noPostsSaved: "अजून कोणतेही पोस्ट जतन केलेले नाही.",
        noQuestions: "अजून प्रश्न विचारले नाहीत.",
        welcomeUserPrefix: "लाइव्ह डेस्क: ",
        communityTitle: "किसान समुदाय",
        communityPostPlaceholder: "समुदायाला काही विचारा...",
        communitySearchPlaceholder: "समुदाय पोस्ट शोधा...",
        communityPostButton: "पोस्ट",
        communitySearchButton: "शोधा",
        communityLoadMore: "अधिक दाखवा",
        communityNewPost: "+ नवीन पोस्ट",
        communityRefresh: "↻ रिफ्रेश",
        tourWelcome: "स्वागत आहे!",
        tourText: "समुदाय वैशिष्ट्यांबद्दल जाणून घेऊ या.",
        tourStep1Title: "आपल्या समुदायात आपले स्वागत आहे",
        tourStep1Text: "यथे विचार सामायिक करा, प्रश्न विचारा आणि इतर शेतकऱ्यांना मदत करा. चला आपणास मार्गदर्शन करूया.",
        tourStep2Title: "पोस्ट तयार करा",
        tourStep2Text: "वरच्या बॉक्समध्ये टाइप करून आणि पोस्टवर टॅप करून चर्चा सुरू करा. आपले सहकारी शेतकरी ते लगेच पाहतील.",
        tourStep3Title: "प्रतिक्रिया द्या आणि उत्तर द्या",
        tourStep3Text: "संवाद चालू ठेवण्यासाठी इमोजी प्रतिक्रियांचा वापर करा किंवा पोस्टवर उत्तर द्या. आपण आपल्या पोस्टचे संपादन किंवा हटवू शकता.",
        tourStep4Title: "शोध आणि एक्सप्लोर करा",
        tourStep4Text: "पोस्ट शोधण्यासाठी शोध बॉक्स वापरा, आणि जुनी चर्चा पाहण्यासाठी लोड मोअरवर टॅप करा.",
        tourNext: "पुढे",
        tourSkip: "वगळा",

        confirmLogout: "आपण नक्की लॉग आउट करायचे आहे का?",
        pleaseEnterQuestion: "कृपया एक प्रश्न प्रविष्ट करा.",
        enterEmailPassword: "कृपया ईमेल आणि पासवर्ड प्रविष्ट करा",
        invalidEmail: "कृपया वैध ईमेल पत्ता प्रविष्ट करा",
        passwordTooShort: "पासवर्ड किमान 6 अक्षरांचा असावा",
        fillAllFields: "कृपया सर्व फील्ड भरा.",
        unableToLogin: "लॉगिन करण्यात अक्षम. कृपया पुन्हा प्रयत्न करा.",
        unableToRegister: "नोंदणी करण्यात अक्षम. कृपया पुन्हा प्रयत्न करा.",
        registrationSuccess: "नोंदणी यशस्वी! कृपया लॉगिन करा.",
        registrationFailed: "नोंदणी अयशस्वी.",
        pleaseSelectImage: "कृपया एक प्रतिमा निवडा.",
        backendNotReachable: "बॅकएंड पोहोचू शकत नाही.",
        extractingImage: "प्रतिमेतून मजकूर काढत आहे...",
        errorUploadingImage: "प्रतिमा अपलोड करताना त्रुटी.",
        speechNotSupported: "हा ब्राउझर भाषणाला समर्थन करत नाही.",
        speechRecognitionNotSupported: "हा ब्राउझर स्पीच मान्यता समर्थन करत नाही.",

        writeSomethingFirst: "काहीतरी प्रथम लिहा",
        postedSuccess: "पोस्ट केली! तुमची पोस्ट आता लाइव्ह आहे.",
        unableToPost: "पोस्ट करणे शक्य नाही. कृपया बॅकएंड तपासा.",
        unableToLoadPosts: "पोस्ट लोड करण्यास अक्षम. बॅकएंड चालू आहे का?",
        loadingPosts: "पोस्ट लोड झाले आहेत...",
        noPostsYet: "अजून पोस्ट नाही — पहिले सामायिक करा!",
        unableToRenderPosts: "पोस्ट प्रदर्शित करण्यात अक्षम. कृपया रिफ्रेश करा.",
        reactedWithEmoji: "{emoji} सह प्रतिक्रिया दिली",
        unableToReact: "प्रतिक्रिया देणे शक्य नाही. कृपया बॅकएंड तपासा.",
        liked: "लाईक केले 👍",
        unableToLike: "लाईक करणे शक्य नाही. कृपया बॅकएंड तपासा.",
        disliked: "डिसलाईक केले 👎",
        unableToDislike: "डिसलाईक करणे शक्य नाही. कृपया बॅकएंड तपासा.",
        repliedToPost: "पोस्टला उत्तर देण्यात आले.",
        unableToAddComment: "टिप्पणी जोडणे शक्य नाही. कृपया बॅकएंड तपासा.",
        editPostPrompt: "तुमची पोस्ट संपादित करा:",
        postUpdated: "पोस्ट अद्यतनित केली!",
        deletePostConfirm: "ही पोस्ट हटवायची?",
        postRemoved: "पोस्ट काढून टाकले.",
    }
};

function getUILanguage() {
    return localStorage.getItem("uiLanguage") || "English";
}

function setUILanguage(lang) {
    localStorage.setItem("uiLanguage", lang);
    applyTranslations();
    window.dispatchEvent(new CustomEvent("ui-language-changed", { detail: { lang } }));
}

function t(key) {
    const lang = getUILanguage();
    const dict = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.English;
    return dict[key] || UI_TRANSLATIONS.English[key] || key;
}

function applyTranslations() {
    const lang = getUILanguage();
    const dict = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.English;

    // Simple innerText translation
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (dict[key]) {
            el.innerText = dict[key];
        }
    });

    // Placeholder translation
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (dict[key]) {
            el.placeholder = dict[key];
        }
    });

    // Title/tooltip translation
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (dict[key]) {
            el.title = dict[key];
        }
    });

    // Value translation (for button values etc.)
    document.querySelectorAll("[data-i18n-value]").forEach(el => {
        const key = el.getAttribute("data-i18n-value");
        if (dict[key]) {
            el.value = dict[key];
        }
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
        const key = el.getAttribute("data-i18n-aria-label");
        if (dict[key]) {
            el.setAttribute("aria-label", dict[key]);
        }
    });

    applyExactTextTranslations(lang);

    // Sync language selector
    const selector = document.getElementById("uiLanguage");
    if (selector) {
        selector.value = lang;
    }
}

function initI18n() {
    const selector = document.getElementById("uiLanguage");
    if (selector) {
        selector.value = getUILanguage();
        selector.addEventListener("change", (e) => setUILanguage(e.target.value));
    }
    applyTranslations();
}

const EXTRA_UI_TRANSLATIONS = {
    English: {
        myFarm: "My Farm",
        cropCare: "Crop Care",
        market: "Market",
        community: "Community",
        theme: "Theme",
        light: "Light",
        dark: "Dark",
        todayActions: "What should I do today?",
        voiceAssistant: "Voice-first chatbot",
        startVoice: "Start voice mode",
        voiceTips: "Voice tips",
        cropCalendar: "Crop calendar",
        reminders: "Reminders",
        schemeEligibility: "Scheme eligibility",
        documentChecklist: "Document checklist",
        priceTrend: "Price trend",
        sellNowWait: "Sell now or wait?",
        saveMyFarmSetup: "Save My Farm Setup",
        marketDesk: "Market Desk",
        todayMandiPrices: "Today's mandi prices",
        estimateProfit: "Estimate possible profit",
        nearbyAgriSupport: "Find nearby agri support",
        selectState: "Select state",
        selectDistrictCity: "Select district / city",
        sendOtp: "Send OTP",
        verifyOtpRegister: "Verify OTP & Register",
        resendOtp: "Resend OTP",
        mobileNumber: "Mobile number",
        selectRole: "Select role",
        selectStatePrompt: "Select state",
        selectDistrictPrompt: "Select district / city",
        smsOtp: "SMS OTP",
        whatsappOtp: "WhatsApp OTP",
        enterOtp: "Enter 6-digit OTP",
        preferredLanguage: "Preferred language",
        farmer: "Farmer",
        agriAdvisor: "Agri advisor",
        mandiBuyer: "Mandi buyer",
        todayCardSummary: "Top actions for your farm today",
        schemeSupportDesk: "Support navigator",
        postCommunity: "Post to the community",
        searchCommunity: "Search community posts...",
        refresh: "Refresh",
        loading: "Loading..."
        ,
        welcomeBack: "Welcome back",
        verifiedGuidance: "Verified agricultural guidance",
        trustedByFarmers: "Trusted by farmers",
        recordsDocumentsData: "Data from records and uploaded documents",
        otpFlowNote: "Choose SMS or WhatsApp, receive OTP on your phone, then verify to create the account.",
        loggingIn: "Logging in...",
        sendingOtp: "Sending OTP...",
        registering: "Registering...",
        validMobileNumber: "Please enter a valid 10-digit mobile number",
        otpResent: "OTP resent.",
        otpSent: "OTP sent.",
        otpInstruction: "Check your phone and enter the 6-digit code.",
        unableToSendOtp: "Unable to send OTP right now.",
        enterOtpPrompt: "Enter the 6-digit OTP sent to your phone."
        ,
        homeDashboard: "Home dashboard",
        homeHeroTitle: "Your farm, one clear next step.",
        homeHeroSubtitle: "Ask a farming question, check the weather, or explore crop and market tools.",
        askAgro: "Ask AgroGyanGPT",
        mainAiWorkspace: "Main AI workspace",
        dailyHelpText: "This is the main space of the website. Ask anything about crop care, weather timing, mandi prices, farming decisions, or government support.",
        myFarmHeroTitle: "Build the farm profile behind your AI answers.",
        myFarmHeroSubtitle: "Everything here improves personalization. Set your crop, land, soil, season, irrigation, and village once, and AgroGyanGPT can adapt advice across weather, planning, crop care, and schemes.",
        marketHeroTitle: "Prices, selling signals, and business decisions in one place.",
        marketHeroSubtitle: "This page keeps your money-side tools together so the homepage can stay short. Farmers can come here for mandi rates, market prediction, expected profit, and nearby agri ecosystem support."
    },
    Hindi: {
        myFarm: "मेरा खेत",
        cropCare: "फसल देखभाल",
        market: "बाज़ार",
        community: "समुदाय",
        theme: "थीम",
        light: "लाइट",
        dark: "डार्क",
        todayActions: "आज मुझे क्या करना चाहिए?",
        voiceAssistant: "वॉइस-फर्स्ट चैटबॉट",
        startVoice: "वॉइस मोड शुरू करें",
        voiceTips: "वॉइस सुझाव",
        cropCalendar: "फसल कैलेंडर",
        reminders: "रिमाइंडर",
        schemeEligibility: "योजना पात्रता",
        documentChecklist: "दस्तावेज़ चेकलिस्ट",
        priceTrend: "कीमत रुझान",
        sellNowWait: "अभी बेचें या इंतज़ार करें?",
        saveMyFarmSetup: "मेरा खेत सेटअप सेव करें",
        marketDesk: "मार्केट डेस्क",
        todayMandiPrices: "आज के मंडी भाव",
        estimateProfit: "संभावित लाभ का अनुमान",
        nearbyAgriSupport: "नज़दीकी कृषि सहायता खोजें",
        selectState: "राज्य चुनें",
        selectDistrictCity: "ज़िला / शहर चुनें",
        sendOtp: "ओटीपी भेजें",
        verifyOtpRegister: "ओटीपी सत्यापित करें और पंजीकरण करें",
        resendOtp: "ओटीपी फिर भेजें",
        mobileNumber: "मोबाइल नंबर",
        selectRole: "भूमिका चुनें",
        selectStatePrompt: "राज्य चुनें",
        selectDistrictPrompt: "ज़िला / शहर चुनें",
        smsOtp: "एसएमएस ओटीपी",
        whatsappOtp: "व्हाट्सऐप ओटीपी",
        enterOtp: "6 अंकों का ओटीपी दर्ज करें",
        preferredLanguage: "पसंदीदा भाषा",
        farmer: "किसान",
        agriAdvisor: "कृषि सलाहकार",
        mandiBuyer: "मंडी खरीदार",
        todayCardSummary: "आज आपके खेत के लिए सबसे ज़रूरी काम",
        schemeSupportDesk: "सहायता नेविगेटर",
        postCommunity: "समुदाय में पोस्ट करें",
        searchCommunity: "समुदाय पोस्ट खोजें...",
        refresh: "रिफ्रेश",
        loading: "लोड हो रहा है...",
        welcomeBack: "फिर से स्वागत है",
        verifiedGuidance: "सत्यापित कृषि मार्गदर्शन",
        trustedByFarmers: "किसानों द्वारा भरोसेमंद",
        recordsDocumentsData: "रिकॉर्ड और अपलोड दस्तावेज़ों से डेटा",
        otpFlowNote: "एसएमएस या व्हाट्सऐप चुनें, फोन पर ओटीपी प्राप्त करें, फिर सत्यापित करके खाता बनाएँ।",
        loggingIn: "लॉगिन हो रहा है...",
        sendingOtp: "ओटीपी भेजा जा रहा है...",
        registering: "पंजीकरण हो रहा है...",
        validMobileNumber: "कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें",
        otpResent: "ओटीपी फिर भेजा गया।",
        otpSent: "ओटीपी भेजा गया।",
        otpInstruction: "फोन देखें और 6 अंकों का कोड दर्ज करें।",
        unableToSendOtp: "अभी ओटीपी भेजा नहीं जा सका।",
        enterOtpPrompt: "फोन पर भेजा गया 6 अंकों का ओटीपी दर्ज करें।",
        homeDashboard: "होम डैशबोर्ड",
        homeHeroTitle: "आपकी खेती, अगला सही कदम।",
        homeHeroSubtitle: "खेती से जुड़ा सवाल पूछें, मौसम देखें या फसल और बाज़ार के साधन खोलें।",
        askAgro: "AgroGyanGPT से पूछें",
        mainAiWorkspace: "मुख्य एआई कार्यक्षेत्र",
        dailyHelpText: "यह वेबसाइट का मुख्य भाग है। फसल, मौसम, मंडी भाव, खेती के फैसले या सरकारी सहायता के बारे में पूछें।",
        myFarmHeroTitle: "अपने एआई जवाबों के पीछे का खेत प्रोफ़ाइल बनाइए।",
        myFarmHeroSubtitle: "यहाँ की जानकारी निजीकरण बेहतर करती है। फसल, ज़मीन, मिट्टी, मौसम, सिंचाई और गाँव सेट करें ताकि AgroGyanGPT बेहतर सलाह दे सके।",
        marketHeroTitle: "भाव, बिक्री संकेत और व्यावसायिक फैसले एक ही जगह।",
        marketHeroSubtitle: "यह पेज आपके बाज़ार वाले टूल्स को एक जगह रखता है ताकि होमपेज छोटा रहे। यहाँ मंडी भाव, पूर्वानुमान, लाभ और आसपास की कृषि सुविधा देखें।"
    },
    Marathi: {
        myFarm: "माझे शेत",
        cropCare: "पीक काळजी",
        market: "बाजार",
        community: "समुदाय",
        theme: "थीम",
        light: "लाईट",
        dark: "डार्क",
        todayActions: "आज मला काय करायला हवे?",
        voiceAssistant: "व्हॉइस-फर्स्ट चॅटबॉट",
        startVoice: "व्हॉइस मोड सुरू करा",
        voiceTips: "व्हॉइस टिप्स",
        cropCalendar: "पीक कॅलेंडर",
        reminders: "रिमाइंडर",
        schemeEligibility: "योजना पात्रता",
        documentChecklist: "दस्तऐवज तपासणी यादी",
        priceTrend: "भावाचा ट्रेंड",
        sellNowWait: "आता विकायचे की थांबायचे?",
        saveMyFarmSetup: "माझे शेत सेटअप सेव्ह करा",
        marketDesk: "मार्केट डेस्क",
        todayMandiPrices: "आजचे मंडी भाव",
        estimateProfit: "संभाव्य नफ्याचा अंदाज",
        nearbyAgriSupport: "जवळची कृषी मदत शोधा",
        selectState: "राज्य निवडा",
        selectDistrictCity: "जिल्हा / शहर निवडा",
        sendOtp: "ओटीपी पाठवा",
        verifyOtpRegister: "ओटीपी तपासा व नोंदणी करा",
        resendOtp: "ओटीपी पुन्हा पाठवा",
        mobileNumber: "मोबाईल नंबर",
        selectRole: "भूमिका निवडा",
        selectStatePrompt: "राज्य निवडा",
        selectDistrictPrompt: "जिल्हा / शहर निवडा",
        smsOtp: "एसएमएस ओटीपी",
        whatsappOtp: "व्हॉट्सअॅप ओटीपी",
        enterOtp: "6 अंकी ओटीपी टाका",
        preferredLanguage: "पसंतीची भाषा",
        farmer: "शेतकरी",
        agriAdvisor: "कृषी सल्लागार",
        mandiBuyer: "मंडी खरेदीदार",
        todayCardSummary: "आज तुमच्या शेतासाठी महत्त्वाचे काम",
        schemeSupportDesk: "सहाय्य नेव्हिगेटर",
        postCommunity: "समुदायात पोस्ट करा",
        searchCommunity: "समुदाय पोस्ट शोधा...",
        refresh: "रिफ्रेश",
        loading: "लोड होत आहे...",
        welcomeBack: "पुन्हा स्वागत आहे",
        verifiedGuidance: "पडताळलेले कृषी मार्गदर्शन",
        trustedByFarmers: "शेतकऱ्यांचा विश्वास",
        recordsDocumentsData: "नोंदी आणि अपलोड कागदपत्रांमधील माहिती",
        otpFlowNote: "एसएमएस किंवा व्हॉट्सअॅप निवडा, फोनवर ओटीपी घ्या आणि पडताळणी करून खाते तयार करा.",
        loggingIn: "लॉगिन सुरू आहे...",
        sendingOtp: "ओटीपी पाठवला जात आहे...",
        registering: "नोंदणी सुरू आहे...",
        validMobileNumber: "कृपया योग्य 10 अंकी मोबाईल नंबर टाका",
        otpResent: "ओटीपी पुन्हा पाठवला.",
        otpSent: "ओटीपी पाठवला.",
        otpInstruction: "फोन तपासा आणि 6 अंकी कोड टाका.",
        unableToSendOtp: "सध्या ओटीपी पाठवता आला नाही.",
        enterOtpPrompt: "फोनवर आलेला 6 अंकी ओटीपी टाका.",
        homeDashboard: "होम डॅशबोर्ड",
        homeHeroTitle: "तुमच्या शेतीसाठी योग्य पुढचे पाऊल.",
        homeHeroSubtitle: "शेतीबद्दल प्रश्न विचारा, हवामान पाहा किंवा पीक आणि बाजाराची माहिती मिळवा.",
        askAgro: "AgroGyanGPT ला विचारा",
        mainAiWorkspace: "मुख्य एआय कार्यक्षेत्र",
        dailyHelpText: "ही वेबसाइटची मुख्य जागा आहे. पीक, हवामान, मंडी भाव, शेतीचे निर्णय किंवा सरकारी मदतीबद्दल विचारा.",
        myFarmHeroTitle: "तुमच्या एआय उत्तरांमागचा शेत प्रोफाइल तयार करा.",
        myFarmHeroSubtitle: "येथील माहिती वैयक्तिक सल्ला सुधारते. पीक, जमीन, माती, हंगाम, सिंचन आणि गाव सेट करा म्हणजे AgroGyanGPT अधिक योग्य मार्गदर्शन देईल.",
        marketHeroTitle: "भाव, विक्री संकेत आणि व्यवसायिक निर्णय एकाच ठिकाणी.",
        marketHeroSubtitle: "हे पान तुमची बाजाराशी संबंधित साधने एकत्र ठेवते. येथे मंडी भाव, अंदाज, नफा आणि जवळची कृषी सुविधा पाहा."
    }
};

Object.keys(EXTRA_UI_TRANSLATIONS).forEach((lang) => {
    UI_TRANSLATIONS[lang] = { ...(UI_TRANSLATIONS[lang] || {}), ...EXTRA_UI_TRANSLATIONS[lang] };
});

const EXACT_TEXT_TRANSLATIONS = {
    Hindi: {
        "Theme": "थीम",
        "My Farm": "मेरा खेत",
        "Crop Care": "फसल देखभाल",
        "Market": "बाज़ार",
        "Market Desk": "मार्केट डेस्क",
        "Community": "समुदाय",
        "Home": "मुख पृष्ठ",
        "Schemes": "योजनाएँ",
        "Profile": "प्रोफ़ाइल",
        "Welcome back": "फिर से स्वागत है",
        "Verified agricultural guidance": "सत्यापित कृषि मार्गदर्शन",
        "Trusted by farmers": "किसानों द्वारा भरोसेमंद",
        "Data from records and uploaded documents": "रिकॉर्ड और अपलोड दस्तावेज़ों से डेटा",
        "Send OTP": "ओटीपी भेजें",
        "Verify OTP & Register": "ओटीपी सत्यापित करें और पंजीकरण करें",
        "Resend OTP": "ओटीपी फिर भेजें",
        "Farmer": "किसान",
        "Agri advisor": "कृषि सलाहकार",
        "Mandi buyer": "मंडी खरीदार",
        "SMS OTP": "एसएमएस ओटीपी",
        "WhatsApp OTP": "व्हाट्सऐप ओटीपी",
        "Select state": "राज्य चुनें",
        "Select district / city": "ज़िला / शहर चुनें"
    },
    Marathi: {
        "Theme": "थीम",
        "My Farm": "माझे शेत",
        "Crop Care": "पीक काळजी",
        "Market": "बाजार",
        "Market Desk": "मार्केट डेस्क",
        "Community": "समुदाय",
        "Home": "मुख्य",
        "Schemes": "योजना",
        "Profile": "प्रोफाइल",
        "Welcome back": "पुन्हा स्वागत",
        "Verified agricultural guidance": "पडताळलेले कृषी मार्गदर्शन",
        "Trusted by farmers": "शेतकऱ्यांचा विश्वास",
        "Data from records and uploaded documents": "नोंदी आणि अपलोड कागदपत्रांमधील माहिती",
        "Send OTP": "ओटीपी पाठवा",
        "Verify OTP & Register": "ओटीपी तपासा व नोंदणी करा",
        "Resend OTP": "ओटीपी पुन्हा पाठवा",
        "Farmer": "शेतकरी",
        "Agri advisor": "कृषी सल्लागार",
        "Mandi buyer": "मंडी खरेदीदार",
        "SMS OTP": "एसएमएस ओटीपी",
        "WhatsApp OTP": "व्हॉट्सअॅप ओटीपी",
        "Select state": "राज्य निवडा",
        "Select district / city": "जिल्हा / शहर निवडा"
    }
};

function applyExactTextTranslations(lang) {
    const replacements = EXACT_TEXT_TRANSLATIONS[lang];
    if (!replacements) return;

    document.querySelectorAll("button, a, span, p, h1, h2, h3, h4, label, option").forEach((el) => {
        if (el.hasAttribute("data-i18n")) return;
        if (el.children.length > 0) return;
        const text = (el.textContent || "").trim();
        if (replacements[text]) {
            el.textContent = replacements[text];
        }
    });

    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
        const placeholder = el.getAttribute("placeholder");
        if (replacements[placeholder]) {
            el.setAttribute("placeholder", replacements[placeholder]);
        }
    });
}

function registerTranslations(extraTranslations) {
    Object.entries(extraTranslations || {}).forEach(([lang, entries]) => {
        UI_TRANSLATIONS[lang] = { ...(UI_TRANSLATIONS[lang] || {}), ...(entries || {}) };
    });
    applyTranslations();
}

// Expose helpers globally for other scripts
window.getUILanguage = getUILanguage;
window.setUILanguage = setUILanguage;
window.t = t;
window.initI18n = initI18n;
window.registerTranslations = registerTranslations;

window.addEventListener("storage", (event) => {
    if (event.key === "uiLanguage") {
        applyTranslations();
    }
});

window.addEventListener("load", () => {
    window.dispatchEvent(new CustomEvent("ui-language-changed", { detail: { lang: getUILanguage() } }));
});
