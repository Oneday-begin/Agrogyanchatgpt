const AGRO_API_URL = window.AGRO_API_URL || "http://127.0.0.1:8000";
let remoteInventoryMap = {};
let remoteFeedStatus = null;
let remoteMarketNotifications = [];
let remoteProduceListings = [];
let liveWeatherRefreshTimer = null;

function readCachedJson(key, fallback) {
    return typeof window.readAgroJson === "function" ? window.readAgroJson(key, fallback) : fallback;
}

function getCurrentUserId() {
    const userId = parseInt(localStorage.getItem("userId") || "0", 10);
    return Number.isFinite(userId) && userId > 0 ? userId : null;
}

async function fetchJsonSafe(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

async function syncLiveFeeds(force = false) {
    const userId = getCurrentUserId();
    const query = userId ? `?user_id=${userId}${force ? "&force=true" : ""}` : `${force ? "?force=true" : ""}`;
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/ops/live-sync${query}`);
        remoteFeedStatus = payload.data_status || null;
        localStorage.setItem("agroLiveFeedStatus", JSON.stringify(remoteFeedStatus || {}));
        return payload;
    } catch (error) {
        return null;
    }
}

async function loadFeedStatus() {
    const userId = getCurrentUserId();
    const query = userId ? `?user_id=${userId}` : "";
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/ops/feed-status${query}`);
        remoteFeedStatus = payload;
        localStorage.setItem("agroLiveFeedStatus", JSON.stringify(payload));
        return payload;
    } catch (error) {
        remoteFeedStatus = readCachedJson("agroLiveFeedStatus", null);
        return remoteFeedStatus;
    }
}

async function loadRemoteInventory() {
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/shop/inventory`);
        const map = {};
        (payload.items || []).forEach((item) => {
            map[item.product_id] = item;
        });
        remoteInventoryMap = map;
        localStorage.setItem("agroRemoteInventory", JSON.stringify(payload.items || []));
        return payload.items || [];
    } catch (error) {
        const cached = readCachedJson("agroRemoteInventory", []);
        remoteInventoryMap = Object.fromEntries(cached.map((item) => [item.product_id, item]));
        return cached;
    }
}

async function loadRemoteOrders() {
    const userId = getCurrentUserId();
    if (!userId) return getShopOrders();
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/shop/orders?user_id=${userId}`);
        const orders = (payload.orders || []).map((order) => ({
            id: order.order_code,
            items: order.items,
            total: Number(order.total) || 0,
            item_count: order.item_count,
            payment_method: order.payment_method,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            delivery_address: order.delivery_address,
            status: order.status,
            created_at: order.created_at,
            timeline: order.timeline || []
        }));
        saveShopOrders(orders);
        return orders;
    } catch (error) {
        return getShopOrders();
    }
}

function trackDemandSignal(productId, signalType) {
    const product = getShopCatalog().find((item) => item.id === productId) || getShopProductCache().find((item) => item.id === productId);
    fetch(`${AGRO_API_URL}/shop/demand-signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: getCurrentUserId(),
            product_id: productId,
            product_name: product?.name || productId,
            signal_type: signalType
        })
    }).catch(() => {});
}

async function syncMarketAlertsFromServer() {
    const userId = getCurrentUserId();
    const query = userId ? `?user_id=${userId}` : "";
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/market-alerts${query}`);
        remoteMarketNotifications = payload.notifications || [];
        if (payload.subscriptions?.length) {
            saveMarketAlerts(payload.subscriptions.map((item) => ({
                crop: item.crop,
                price: item.target_price,
                created_at: item.created_at,
                remote: true
            })));
        }
        return payload;
    } catch (error) {
        remoteMarketNotifications = [];
        return null;
    }
}

function getProduceCart() {
    return readCachedJson("agroProduceCart", []);
}

function saveProduceCart(cart) {
    localStorage.setItem("agroProduceCart", JSON.stringify(cart || []));
}

async function loadProduceListings() {
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/produce/listings`);
        remoteProduceListings = payload.listings || [];
        localStorage.setItem("agroProduceListingsCache", JSON.stringify(remoteProduceListings));
        return remoteProduceListings;
    } catch (error) {
        remoteProduceListings = readCachedJson("agroProduceListingsCache", []);
        return remoteProduceListings;
    }
}

function getProduceCartDetailedItems() {
    const listings = remoteProduceListings.length ? remoteProduceListings : readCachedJson("agroProduceListingsCache", []);
    return getProduceCart().map((item) => {
        const listing = listings.find((entry) => entry.listing_code === item.listing_code);
        if (!listing) return null;
        const price = Number(listing.price_per_unit) || 0;
        return {
            ...listing,
            qty: item.qty,
            total: price * item.qty
        };
    }).filter(Boolean);
}

function getProduceCartTotals() {
    const items = getProduceCartDetailedItems();
    return {
        items,
        count: items.reduce((sum, item) => sum + item.qty, 0),
        total: items.reduce((sum, item) => sum + item.total, 0)
    };
}

function addProduceToCart(listingCode) {
    const listing = remoteProduceListings.find((item) => item.listing_code === listingCode);
    if (!listing) return;
    const cart = getProduceCart();
    const existing = cart.find((item) => item.listing_code === listingCode);
    if (existing) {
        existing.qty = Math.min(existing.qty + 1, listing.available_quantity || existing.qty + 1);
    } else {
        cart.push({ listing_code: listingCode, qty: 1 });
    }
    saveProduceCart(cart);
    renderProduceMarketplacePage();
}

function updateProduceCartQty(listingCode, delta) {
    const listing = remoteProduceListings.find((item) => item.listing_code === listingCode);
    const maxQty = listing?.available_quantity || 9999;
    const nextCart = getProduceCart()
        .map((item) => item.listing_code === listingCode ? { ...item, qty: Math.min(maxQty, item.qty + delta) } : item)
        .filter((item) => item.qty > 0);
    saveProduceCart(nextCart);
    renderProduceMarketplacePage();
}

function removeProduceCartItem(listingCode) {
    saveProduceCart(getProduceCart().filter((item) => item.listing_code !== listingCode));
    renderProduceMarketplacePage();
}

function clearProduceCart() {
    saveProduceCart([]);
    renderProduceMarketplacePage();
}
let latestFarmerPageData = null;
let weatherSlideshowTimer = null;

const WEATHER_SLIDES = [
    {
        title: "Morning field view",
        tags: ["Fresh sunrise", "Low wind", "Photo 1 of 5"],
        image: "https://images.pexels.com/photos/2132250/pexels-photo-2132250.jpeg?auto=compress&cs=tinysrgb&w=1200"
    },
    {
        title: "Green crop stretch",
        tags: ["Healthy canopy", "Irrigation ready", "Photo 2 of 5"],
        image: "https://images.pexels.com/photos/2252584/pexels-photo-2252584.jpeg?auto=compress&cs=tinysrgb&w=1200"
    },
    {
        title: "Village-side farmland",
        tags: ["Near settlement", "Field planning", "Photo 3 of 5"],
        image: "https://images.pexels.com/photos/32722797/pexels-photo-32722797.jpeg?auto=compress&cs=tinysrgb&w=1200"
    },
    {
        title: "Wide open plantation",
        tags: ["Growth check", "Boundary watch", "Photo 4 of 5"],
        image: "https://images.pexels.com/photos/974314/pexels-photo-974314.jpeg?auto=compress&cs=tinysrgb&w=1200"
    },
    {
        title: "Harvest-side landscape",
        tags: ["Season scan", "Market prep", "Photo 5 of 5"],
        image: "https://images.pexels.com/photos/1595104/pexels-photo-1595104.jpeg?auto=compress&cs=tinysrgb&w=1200"
    }
];

const SHOP_CATALOG = [
    { id: "seed-wheat-elite", name: "Wheat Seed Elite", category: "seed", price: 1850, unit: "10 kg bag", seller: "AgroSeed Bharat", delivery: "2 days", image: "https://images.pexels.com/photos/5503204/pexels-photo-5503204.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["wheat"], seasonMatches: ["rabi"], soilMatches: ["loamy", "black"], baseQtyPerAcre: 1.2, description: "High-germination seed for uniform stand and strong early growth." },
    { id: "seed-paddy-hybrid", name: "Paddy Hybrid 27", category: "seed", price: 2240, unit: "8 kg pack", seller: "Kisan Seed House", delivery: "3 days", image: "https://images.pexels.com/photos/2165688/pexels-photo-2165688.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["paddy"], seasonMatches: ["kharif"], soilMatches: ["clay", "loamy"], baseQtyPerAcre: 1.1, description: "Hybrid paddy seed suited for transplanting and monsoon planning." },
    { id: "seed-cotton-bt", name: "Cotton Seed Shield", category: "seed", price: 930, unit: "450 g packet", seller: "FieldStart Inputs", delivery: "2 days", image: "https://images.pexels.com/photos/4946997/pexels-photo-4946997.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["cotton"], seasonMatches: ["kharif"], soilMatches: ["black"], baseQtyPerAcre: 2.2, description: "Cotton hybrid seed packet with strong early vigor." },
    { id: "seed-onion-red", name: "Red Onion Seed Pack", category: "seed", price: 760, unit: "1 kg pack", seller: "Village Crop Store", delivery: "2 days", image: "https://images.pexels.com/photos/533342/pexels-photo-533342.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["onion"], seasonMatches: ["rabi", "summer"], soilMatches: ["loamy", "sandy"], baseQtyPerAcre: 1.5, description: "Reliable onion seed for strong bulb development." },
    { id: "seed-tomato-hybrid", name: "Tomato Hybrid Pro Seeds", category: "seed", price: 999, unit: "3500 seeds", seller: "Vegetable Seed World", delivery: "2 days", image: "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["tomato"], seasonMatches: ["rabi", "summer"], soilMatches: ["loamy", "sandy"], baseQtyPerAcre: 1.4, description: "High-yield tomato hybrid seeds for vegetable growers." },
    { id: "fert-urea-max", name: "Urea Max", category: "fertilizer", price: 299, unit: "45 kg bag", seller: "Krishi Supply Point", delivery: "1 day", image: "https://images.pexels.com/photos/6231818/pexels-photo-6231818.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["wheat", "paddy", "maize", "sugarcane"], baseQtyPerAcre: 1, description: "Nitrogen support for vegetative growth during active stages." },
    { id: "fert-dap-gold", name: "DAP Gold", category: "fertilizer", price: 1450, unit: "50 kg bag", seller: "Mandi Input Mart", delivery: "2 days", image: "https://images.pexels.com/photos/6231786/pexels-photo-6231786.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["wheat", "paddy", "cotton", "soybean", "tomato", "onion"], baseQtyPerAcre: 0.8, description: "Phosphorus-rich starter fertilizer for root establishment." },
    { id: "nutri-micro-mix", name: "Micro Nutrient Mix", category: "nutrition", price: 680, unit: "5 kg pack", seller: "SoilCare Labs", delivery: "3 days", image: "https://images.pexels.com/photos/4505160/pexels-photo-4505160.jpeg?auto=compress&cs=tinysrgb&w=900", soilMatches: ["loamy", "sandy", "black"], baseQtyPerAcre: 0.4, description: "Balanced micronutrient blend for visible deficiency support." },
    { id: "nutri-organic-carbon", name: "Organic Carbon Booster", category: "nutrition", price: 540, unit: "25 kg bag", seller: "Green Earth Organics", delivery: "3 days", image: "https://images.pexels.com/photos/7728075/pexels-photo-7728075.jpeg?auto=compress&cs=tinysrgb&w=900", soilMatches: ["sandy", "clay"], baseQtyPerAcre: 1, description: "Improves soil structure and moisture retention." },
    { id: "protect-fungicide-safe", name: "Fungicide SafeGuard", category: "protection", price: 720, unit: "1 L bottle", seller: "Plant Health Hub", delivery: "2 days", image: "https://images.pexels.com/photos/6231666/pexels-photo-6231666.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["tomato", "onion", "paddy", "wheat"], seasonMatches: ["kharif", "rabi"], baseQtyPerAcre: 0.25, description: "Protective fungicide for humidity-driven disease pressure." },
    { id: "protect-insect-control", name: "Insect Control Plus", category: "protection", price: 860, unit: "1 L bottle", seller: "Plant Health Hub", delivery: "2 days", image: "https://images.pexels.com/photos/4503273/pexels-photo-4503273.jpeg?auto=compress&cs=tinysrgb&w=900", cropMatches: ["cotton", "soybean", "tomato", "onion"], baseQtyPerAcre: 0.2, description: "Useful when pest pressure starts building in the field." },
    { id: "irrigation-drip-kit", name: "Drip Line Starter Kit", category: "irrigation", price: 3200, unit: "starter set", seller: "WaterSmart Agro", delivery: "4 days", image: "https://images.pexels.com/photos/2886937/pexels-photo-2886937.jpeg?auto=compress&cs=tinysrgb&w=900", irrigationMatches: ["drip"], description: "Starter drip support set for row crops and horticulture blocks." },
    { id: "irrigation-sprayer", name: "Power Sprayer Set", category: "irrigation", price: 4500, unit: "unit", seller: "Field Tools Depot", delivery: "4 days", image: "https://images.pexels.com/photos/162625/tractor-farm-machine-agriculture-162625.jpeg?auto=compress&cs=tinysrgb&w=900", description: "Field-ready sprayer set for crop protection and foliar feeding." }
];

const SHOP_IMAGE_BANK = {
    seed: [
        "https://images.pexels.com/photos/5503204/pexels-photo-5503204.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/1327838/pexels-photo-1327838.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/533342/pexels-photo-533342.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    fertilizer: [
        "https://images.pexels.com/photos/6231818/pexels-photo-6231818.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/6231786/pexels-photo-6231786.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    nutrition: [
        "https://images.pexels.com/photos/4505160/pexels-photo-4505160.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/7728075/pexels-photo-7728075.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    protection: [
        "https://images.pexels.com/photos/6231666/pexels-photo-6231666.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/4503273/pexels-photo-4503273.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    irrigation: [
        "https://images.pexels.com/photos/2886937/pexels-photo-2886937.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/162625/tractor-farm-machine-agriculture-162625.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    machinery: [
        "https://images.pexels.com/photos/162625/tractor-farm-machine-agriculture-162625.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/2132171/pexels-photo-2132171.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    animal: [
        "https://images.pexels.com/photos/825949/pexels-photo-825949.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/422218/pexels-photo-422218.jpeg?auto=compress&cs=tinysrgb&w=900"
    ],
    garden: [
        "https://images.pexels.com/photos/2132250/pexels-photo-2132250.jpeg?auto=compress&cs=tinysrgb&w=900",
        "https://images.pexels.com/photos/974314/pexels-photo-974314.jpeg?auto=compress&cs=tinysrgb&w=900"
    ]
};

function slugifyShopValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function getShopOriginalPrice(price, index) {
    const discount = 12 + (index % 6) * 4;
    return Math.round(price / (1 - discount / 100));
}

function decorateShopProduct(product, index) {
    const originalPrice = product.originalPrice || getShopOriginalPrice(product.price, index);
    const discountPercent = Math.max(5, Math.round(((originalPrice - product.price) / originalPrice) * 100));
    return {
        ...product,
        brand: product.brand || product.seller || "AgroGyan Select",
        seller: product.seller || product.brand || "AgroGyan Select",
        originalPrice,
        discountPercent,
        rating: product.rating || (4.1 + (index % 6) * 0.1).toFixed(1),
        reviews: product.reviews || (31 + index * 9),
        sizes: product.sizes?.length ? product.sizes : [product.unit],
        image: product.image || SHOP_IMAGE_BANK[product.category]?.[index % (SHOP_IMAGE_BANK[product.category]?.length || 1)] || SHOP_IMAGE_BANK.seed[0]
    };
}

function buildMarketplaceCatalog() {
    const crops = [
        ["Tomato", 999, "3500 seeds"], ["Brinjal", 179, "10 gms"], ["Cucumber", 349, "10 gms"], ["Chilli", 420, "10 gms"],
        ["Okra", 699, "250 gms"], ["Cauliflower", 699, "10 gms"], ["Cabbage", 389, "10 gms"], ["Onion", 760, "1 kg"],
        ["Bottle Gourd", 259, "50 gms"], ["Bitter Gourd", 319, "50 gms"], ["Watermelon", 540, "50 gms"], ["Muskmelon", 499, "50 gms"],
        ["Paddy", 2240, "8 kg"], ["Wheat", 1850, "10 kg"], ["Cotton", 930, "450 gms"], ["Mustard", 460, "1 kg"],
        ["Groundnut", 990, "5 kg"], ["Maize", 640, "2 kg"], ["Soybean", 790, "5 kg"], ["Sunflower", 520, "1 kg"],
        ["Coriander", 299, "500 gms"], ["Fenugreek", 230, "500 gms"], ["Spinach", 199, "250 gms"], ["Marigold", 450, "100 gms"]
    ];
    const seedBrands = ["Syngenta", "VNR", "Namdhari", "Seminis", "Advanta"];
    const fertilizerItems = [
        ["Urea Max", 299, "45 kg bag"], ["DAP Gold", 1450, "50 kg bag"], ["NPK 19:19:19", 980, "25 kg bag"], ["Potash Booster", 890, "25 kg bag"],
        ["Ammonium Sulphate", 540, "25 kg bag"], ["SSP Root Mix", 620, "50 kg bag"], ["Calcium Nitrate", 960, "25 kg bag"], ["Magnesium Sulphate", 410, "25 kg bag"],
        ["Zinc Sulphate", 560, "10 kg"], ["Boron Granules", 330, "5 kg"], ["Sulphur Bentonite", 780, "25 kg"], ["Water Soluble NPK", 1240, "25 kg bag"]
    ];
    const nutritionItems = [
        ["Humic Acid Pro", 560, "1 ltr"], ["Seaweed Extract", 690, "500 ml"], ["Bio Stimulant Plus", 840, "1 ltr"], ["Micronutrient Chelated Mix", 680, "5 kg"],
        ["Organic Carbon Booster", 540, "25 kg"], ["Silica Shield", 740, "1 ltr"], ["Calcium Boron Booster", 620, "1 ltr"], ["Flowering Promoter", 480, "500 ml"],
        ["Fruit Setting Spray", 560, "500 ml"], ["Root Booster Gel", 350, "250 ml"], ["Amino Acid Tonic", 720, "1 ltr"], ["Soil Conditioner Organic", 850, "25 kg"]
    ];
    const protectionItems = [
        ["Fungicide SafeGuard", 720, "1 ltr"], ["Insect Control Plus", 860, "1 ltr"], ["Herbicide Field Clean", 540, "1 ltr"], ["Termite Stop", 399, "500 ml"],
        ["Mildew Care", 620, "500 ml"], ["Leaf Spot Cure", 580, "500 ml"], ["Thrips Guard", 690, "250 ml"], ["Stem Borer Shield", 760, "500 ml"],
        ["Blast Protector", 840, "1 ltr"], ["Weed Knock", 470, "1 ltr"], ["Mite Defender", 610, "250 ml"], ["Fruit Fly Trap Pack", 390, "set"],
        ["Snail Control Granules", 280, "1 kg"], ["Sticky Trap Set", 240, "pack of 10"], ["Bio Pesticide Neem Pro", 520, "1 ltr"], ["Copper Oxychloride Mix", 450, "500 gms"],
        ["Sulphur Dust", 360, "1 kg"], ["Bacterial Blight Care", 640, "500 ml"], ["Fungal Shield Combo", 999, "combo pack"], ["Pest Scout Lure", 199, "pack"]
    ];
    const irrigationItems = [
        ["Drip Line Starter Kit", 3200, "starter set"], ["Power Sprayer Set", 4500, "unit"], ["Mini Sprinkler Pack", 2100, "set of 20"], ["Fogger Nozzle Kit", 890, "pack of 12"],
        ["Lay Flat Pipe", 1650, "100 m"], ["Venturi Injector", 1180, "unit"], ["Irrigation Timer", 2200, "unit"], ["Filter Assembly Set", 1750, "set"],
        ["Drip Punch Tool", 180, "unit"], ["Inline Dripper Pack", 760, "pack of 50"], ["PVC Hose Reel", 980, "unit"], ["Rain Gun Tripod", 6200, "unit"]
    ];
    const machineryItems = [
        ["Battery Sprayer", 2850, "16 ltr"], ["Hand Weeder", 420, "unit"], ["Pruning Secateur", 340, "unit"], ["Seedling Tray Pack", 260, "pack of 10"],
        ["Mulching Sheet Roll", 1850, "400 m"], ["Shade Net 50%", 2250, "roll"], ["Tarpaulin Cover", 990, "12 x 18 ft"], ["Soil Testing Kit", 1490, "kit"],
        ["Moisture Meter", 1350, "unit"], ["Farm Gloves Heavy Duty", 180, "pair"], ["Khurpi Tool", 140, "unit"], ["Wheel Hoe", 2450, "unit"]
    ];
    const animalItems = [
        ["Cattle Feed Premium", 1250, "50 kg bag"], ["Mineral Mixture", 420, "5 kg"], ["Poultry Feed Grower", 980, "30 kg bag"], ["Cattle Dewormer", 240, "100 ml"],
        ["Milking Sanitizer", 320, "1 ltr"], ["Silage Inoculant", 560, "1 kg"], ["Feed Supplement Tonic", 380, "500 ml"], ["Poultry Vitamin Mix", 290, "1 kg"],
        ["Dairy Calcium Booster", 460, "1 ltr"], ["Cow Mat Rubber", 2100, "unit"], ["Livestock Rope Set", 180, "set"], ["Water Trough", 950, "unit"]
    ];
    const gardenItems = [
        ["Garden Pruner", 260, "unit"], ["Hand Sprayer Mini", 320, "1 ltr"], ["Kitchen Garden Seed Kit", 499, "combo pack"], ["Compost Maker", 780, "5 kg"],
        ["Vermicompost Bag", 340, "25 kg"], ["Cocopeat Block", 220, "5 kg"], ["Grow Bag Set", 380, "pack of 5"], ["Plant Support Clips", 120, "pack"],
        ["Nursery Pot Set", 240, "pack of 10"], ["Watering Can", 410, "10 ltr"], ["Organic Pest Repellent", 290, "500 ml"], ["Rose Food Mix", 310, "1 kg"]
    ];

    const catalog = SHOP_CATALOG.map((item, index) => decorateShopProduct(item, index));
    const pushItems = (items, category, brands, offset, extra = {}) => {
        items.forEach(([label, price, unit], index) => {
            const brand = brands[index % brands.length];
            const cropKey = label.split(" ")[0].toLowerCase();
            catalog.push(decorateShopProduct({
                id: `${category}-${slugifyShopValue(label)}-${index}`,
                name: label,
                category,
                price,
                unit,
                brand,
                seller: brand,
                delivery: `${1 + ((index + offset) % 4)} days`,
                description: `${label} from ${brand} for practical farm use and seasonal planning.`,
                cropMatches: extra.cropMatches?.[cropKey] || (category === "seed" ? [cropKey] : extra.defaultCropMatches || []),
                seasonMatches: extra.defaultSeasonMatches || [],
                soilMatches: extra.defaultSoilMatches || [],
                irrigationMatches: extra.defaultIrrigationMatches || [],
                baseQtyPerAcre: extra.baseQtyPerAcre || (category === "seed" ? 1 : 0.5),
                sizes: extra.sizesMap?.[label] || [unit]
            }, offset + index));
        });
    };

    pushItems(crops, "seed", seedBrands, 20, { defaultSeasonMatches: ["rabi", "kharif", "summer"], defaultSoilMatches: ["loamy", "sandy", "black"], baseQtyPerAcre: 1.1 });
    pushItems(fertilizerItems, "fertilizer", ["IFFCO", "Coromandel", "Deepak", "Multiplex"], 80, { defaultCropMatches: ["wheat", "paddy", "tomato", "cotton"], baseQtyPerAcre: 0.9 });
    pushItems(nutritionItems, "nutrition", ["Multiplex", "Actosol", "BioCare", "Green Earth"], 120, { defaultCropMatches: ["tomato", "chilli", "brinjal", "paddy"], baseQtyPerAcre: 0.4, defaultSoilMatches: ["loamy", "sandy", "black"] });
    pushItems(protectionItems, "protection", ["Bayer", "UPL", "Syngenta", "Adama", "Dhanuka"], 160, { defaultCropMatches: ["tomato", "paddy", "cotton", "onion"], defaultSeasonMatches: ["rabi", "kharif"], baseQtyPerAcre: 0.25 });
    pushItems(irrigationItems, "irrigation", ["Jain", "KisanKraft", "Captain", "Netafim"], 220, { defaultIrrigationMatches: ["drip", "sprinkler"] });
    pushItems(machineryItems, "machinery", ["Falcon", "KisanKraft", "Generic Farm Tools"], 260);
    pushItems(animalItems, "animal", ["Godrej Agrovet", "Amul Feed", "Cargill", "DairyMax"], 300);
    pushItems(gardenItems, "garden", ["HomeCrop", "Urban Roots", "Garden Pro"], 340);

    return catalog.slice(0, 132);
}

let SHOP_PRODUCT_CATALOG = null;

function getShopCatalog() {
    if (Array.isArray(SHOP_PRODUCT_CATALOG) && SHOP_PRODUCT_CATALOG.length) {
        return SHOP_PRODUCT_CATALOG;
    }

    try {
        SHOP_PRODUCT_CATALOG = buildMarketplaceCatalog();
    } catch (error) {
        console.error("shop catalog build error", error);
        SHOP_PRODUCT_CATALOG = SHOP_CATALOG.map((item, index) => decorateShopProduct(item, index));
    }

    return SHOP_PRODUCT_CATALOG;
}

const PAGE_COPY = {
    English: {
        weatherGuidance: "Weather guidance will appear here.",
        rainWatch: "Rain watch",
        spraySafe: "Spray safe",
        marketPricesSoon: "Market prices will appear here.",
        active: "Active",
        stable: "Stable",
        todayTasksFallback: "Your daily AI tasks will appear here.",
        noWeatherAlerts: "No weather alerts right now.",
        completeFarmSetup: "Complete your farm setup to improve personalization.",
        weekPlanner: "This week's planner",
        plannerWillAppear: "Your planner will appear here.",
        relevantSchemes: "Relevant schemes will appear here.",
        noLiveFieldAlerts: "No live field alerts yet.",
        nearbyContext: "Nearby context",
        nearbyContextSoon: "Nearby context will appear here.",
        complete: "Complete",
        inProgress: "In progress",
        useMoreForMemory: "Use AgroGyanGPT more to build memory.",
        noUrgentAlerts: "No urgent field alerts right now.",
        watchThisWeek: "Watch this week",
        predictionSoon: "Prediction insight will appear here.",
        noMarketAlerts: "No weather-linked market alerts right now.",
        todayAiTitle: "What should I do today?",
        todayAiSummary: "Top actions for your farm today",
        voiceTitle: "Voice-first chatbot",
        voiceHelp: "Tap the large mic button and ask in your own language.",
        voicePromptOne: "Ask: What should I spray today?",
        voicePromptTwo: "Ask: Should I sell now or wait?",
        voicePromptThree: "Ask: My crop has yellow leaves, what do I do?",
        startVoiceMode: "Start voice mode",
        cropCalendarTitle: "Crop calendar",
        remindersTitle: "Reminders",
        marketTrendTitle: "Price trend",
        sellDecisionTitle: "Sell now or wait?",
        schemeEligibilityTitle: "Scheme eligibility",
        documentChecklistTitle: "Document checklist",
        saveFarmSuccess: "Farm setup saved successfully.",
        saveFarmFallback: "Saved locally. Backend sync will retry when available.",
        strongStreak: "Strong streak. Your dashboard is learning your field rhythm.",
        buildStreak: "Keep checking in daily to unlock a stronger farm guidance streak.",
        stagePrep: "Preparation",
        stageSowing: "Sowing",
        stageGrowth: "Growth",
        stageProtection: "Protection",
        stageHarvest: "Harvest",
        reminderWeather: "Check rain and wind before spraying or irrigation.",
        reminderMarket: "Review mandi rates before making a bulk sale.",
        reminderCrop: "Inspect the field today for pest or disease early signs.",
        eligible: "Likely eligible",
        maybeEligible: "Check documents",
        notEnoughProfile: "Complete your farm profile for better eligibility matching.",
        docAadhaar: "Aadhaar card",
        docBank: "Bank passbook",
        docLand: "Land record / 7-12 extract",
        docMobile: "Registered mobile number",
        docCrop: "Crop details and sowing record",
        sellWait: "Wait a little",
        sellNow: "Good time to sell",
        sellMixed: "Sell partially",
        trendUp: "Price trend is rising",
        trendDown: "Price trend is soft",
        trendFlat: "Price trend is stable",
        voiceReady: "Voice farmer mode ready"
    },
    Hindi: {
        weatherGuidance: "मौसम मार्गदर्शन यहाँ दिखाई देगा।",
        rainWatch: "बारिश पर नज़र",
        spraySafe: "स्प्रे सुरक्षित",
        marketPricesSoon: "बाज़ार भाव यहाँ दिखाई देंगे।",
        active: "सक्रिय",
        stable: "स्थिर",
        todayTasksFallback: "आज के एआई कार्य यहाँ दिखाई देंगे।",
        noWeatherAlerts: "अभी कोई मौसम चेतावनी नहीं है।",
        completeFarmSetup: "बेहतर सुझावों के लिए अपना खेत सेटअप पूरा करें।",
        weekPlanner: "इस सप्ताह की योजना",
        plannerWillAppear: "आपकी योजना यहाँ दिखाई देगी।",
        relevantSchemes: "संबंधित योजनाएँ यहाँ दिखाई देंगी।",
        noLiveFieldAlerts: "अभी कोई लाइव फील्ड अलर्ट नहीं है।",
        nearbyContext: "नज़दीकी संदर्भ",
        nearbyContextSoon: "नज़दीकी संदर्भ यहाँ दिखाई देगा।",
        complete: "पूरा",
        inProgress: "प्रगति में",
        useMoreForMemory: "मेमोरी बनाने के लिए AgroGyanGPT का अधिक उपयोग करें।",
        noUrgentAlerts: "अभी कोई तात्कालिक चेतावनी नहीं है।",
        watchThisWeek: "इस सप्ताह नज़र रखें",
        predictionSoon: "पूर्वानुमान यहाँ दिखाई देगा।",
        noMarketAlerts: "अभी कोई मौसम-आधारित बाज़ार चेतावनी नहीं है।",
        todayAiTitle: "आज मुझे क्या करना चाहिए?",
        todayAiSummary: "आज आपके खेत के लिए सबसे ज़रूरी काम",
        voiceTitle: "वॉइस-फर्स्ट चैटबॉट",
        voiceHelp: "बड़े माइक बटन पर टैप करें और अपनी भाषा में पूछें।",
        voicePromptOne: "पूछें: आज क्या स्प्रे करूँ?",
        voicePromptTwo: "पूछें: अभी बेचूँ या रुकूँ?",
        voicePromptThree: "पूछें: मेरी फसल की पत्तियाँ पीली हैं, क्या करूँ?",
        startVoiceMode: "वॉइस मोड शुरू करें",
        cropCalendarTitle: "फसल कैलेंडर",
        remindersTitle: "रिमाइंडर",
        marketTrendTitle: "कीमत रुझान",
        sellDecisionTitle: "अभी बेचें या इंतज़ार करें?",
        schemeEligibilityTitle: "योजना पात्रता",
        documentChecklistTitle: "दस्तावेज़ चेकलिस्ट",
        saveFarmSuccess: "खेत सेटअप सफलतापूर्वक सेव हो गया।",
        saveFarmFallback: "लोकल में सेव हो गया। बैकएंड उपलब्ध होने पर सिंक होगा।",
        strongStreak: "बहुत अच्छा। आपका डैशबोर्ड आपके खेत की आदत सीख रहा है।",
        buildStreak: "रोज़ उपयोग करें ताकि आपका फार्म गाइडेंस और मज़बूत हो।",
        stagePrep: "तैयारी",
        stageSowing: "बुवाई",
        stageGrowth: "विकास",
        stageProtection: "सुरक्षा",
        stageHarvest: "कटाई",
        reminderWeather: "स्प्रे या सिंचाई से पहले बारिश और हवा जाँचें।",
        reminderMarket: "थोक बिक्री से पहले मंडी भाव देखें।",
        reminderCrop: "आज खेत में कीट या रोग के शुरुआती संकेत देखें।",
        eligible: "संभावित रूप से पात्र",
        maybeEligible: "दस्तावेज़ जाँचें",
        notEnoughProfile: "बेहतर मिलान के लिए खेत प्रोफ़ाइल पूरी करें।",
        docAadhaar: "आधार कार्ड",
        docBank: "बैंक पासबुक",
        docLand: "भूमि रिकॉर्ड / 7-12",
        docMobile: "पंजीकृत मोबाइल नंबर",
        docCrop: "फसल विवरण और बुवाई रिकॉर्ड",
        sellWait: "थोड़ा इंतज़ार करें",
        sellNow: "बेचने का अच्छा समय",
        sellMixed: "आंशिक बिक्री करें",
        trendUp: "कीमत ऊपर जा रही है",
        trendDown: "कीमत नरम है",
        trendFlat: "कीमत स्थिर है",
        voiceReady: "वॉइस किसान मोड तैयार है"
    },
    Marathi: {
        weatherGuidance: "हवामान मार्गदर्शन येथे दिसेल.",
        rainWatch: "पावसावर लक्ष",
        spraySafe: "फवारणी सुरक्षित",
        marketPricesSoon: "बाजारभाव येथे दिसतील.",
        active: "सक्रिय",
        stable: "स्थिर",
        todayTasksFallback: "आजचे एआय काम येथे दिसेल.",
        noWeatherAlerts: "सध्या हवामान इशारा नाही.",
        completeFarmSetup: "चांगल्या सल्ल्यासाठी शेत सेटअप पूर्ण करा.",
        weekPlanner: "या आठवड्याची योजना",
        plannerWillAppear: "तुमची योजना येथे दिसेल.",
        relevantSchemes: "संबंधित योजना येथे दिसतील.",
        noLiveFieldAlerts: "सध्या कोणतेही लाईव्ह फील्ड अलर्ट नाहीत.",
        nearbyContext: "जवळचा संदर्भ",
        nearbyContextSoon: "जवळचा संदर्भ येथे दिसेल.",
        complete: "पूर्ण",
        inProgress: "प्रगतीत",
        useMoreForMemory: "मेमरी तयार होण्यासाठी AgroGyanGPT अधिक वापरा.",
        noUrgentAlerts: "सध्या तातडीचे अलर्ट नाहीत.",
        watchThisWeek: "या आठवड्यात लक्ष ठेवा",
        predictionSoon: "अंदाज येथे दिसेल.",
        noMarketAlerts: "सध्या हवामानाशी संबंधित बाजार इशारे नाहीत.",
        todayAiTitle: "आज मला काय करायला हवे?",
        todayAiSummary: "आज तुमच्या शेतासाठी महत्त्वाचे काम",
        voiceTitle: "व्हॉइस-फर्स्ट चॅटबॉट",
        voiceHelp: "मोठ्या माइक बटणावर टॅप करा आणि आपल्या भाषेत विचारा.",
        voicePromptOne: "विचारा: आज काय फवारू?",
        voicePromptTwo: "विचारा: आता विकू की थांबू?",
        voicePromptThree: "विचारा: पानं पिवळी होत आहेत, काय करू?",
        startVoiceMode: "व्हॉइस मोड सुरू करा",
        cropCalendarTitle: "पीक कॅलेंडर",
        remindersTitle: "रिमाइंडर",
        marketTrendTitle: "भावाचा ट्रेंड",
        sellDecisionTitle: "आता विकायचे की थांबायचे?",
        schemeEligibilityTitle: "योजना पात्रता",
        documentChecklistTitle: "दस्तऐवज तपासणी यादी",
        saveFarmSuccess: "शेत सेटअप यशस्वीरित्या सेव्ह झाले.",
        saveFarmFallback: "लोकलमध्ये सेव्ह झाले. बॅकएंड नंतर सिंक होईल.",
        strongStreak: "छान. तुमचा डॅशबोर्ड तुमच्या शेताची सवय शिकत आहे.",
        buildStreak: "दररोज वापरा म्हणजे तुमचे मार्गदर्शन अधिक मजबूत होईल.",
        stagePrep: "तयारी",
        stageSowing: "पेरणी",
        stageGrowth: "वाढ",
        stageProtection: "संरक्षण",
        stageHarvest: "कापणी",
        reminderWeather: "फवारणी किंवा पाण्यापूर्वी पाऊस आणि वारा तपासा.",
        reminderMarket: "मोठी विक्री करण्यापूर्वी मंडी भाव तपासा.",
        reminderCrop: "आज कीड किंवा रोगाची सुरुवातीची लक्षणे तपासा.",
        eligible: "बहुधा पात्र",
        maybeEligible: "कागदपत्रे तपासा",
        notEnoughProfile: "चांगल्या पात्रतेसाठी शेत प्रोफाइल पूर्ण करा.",
        docAadhaar: "आधार कार्ड",
        docBank: "बँक पासबुक",
        docLand: "जमिनीचा उतारा / 7-12",
        docMobile: "नोंदणीकृत मोबाईल नंबर",
        docCrop: "पीक तपशील आणि पेरणी नोंद",
        sellWait: "थोडे थांबा",
        sellNow: "विक्रीसाठी चांगला वेळ",
        sellMixed: "थोडे विकून थोडे थांबा",
        trendUp: "भाव वाढत आहेत",
        trendDown: "भाव नरम आहेत",
        trendFlat: "भाव स्थिर आहेत",
        voiceReady: "व्हॉइस शेतकरी मोड तयार आहे"
    }
};

function fc(key) {
    const lang = typeof getUILanguage === "function" ? getUILanguage() : "English";
    return PAGE_COPY[lang]?.[key] || PAGE_COPY.English[key] || key;
}

function sanitizeText(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatShopCurrency(value) {
    return `Rs ${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
}

function getFarmProfileSnapshot() {
    const saved = typeof window.getAgroFarmSnapshot === "function" ? window.getAgroFarmSnapshot() : {};
    const crop = saved.crop || localStorage.getItem("crop_name") || "Wheat";
    const landText = saved.land || localStorage.getItem("land_size") || "";
    const area = parseFarmArea(landText);

    return {
        crop,
        cropKey: crop.trim().toLowerCase(),
        landText,
        area,
        soil: saved.soil || localStorage.getItem("soil_type") || "Loamy",
        soilKey: (saved.soil || localStorage.getItem("soil_type") || "Loamy").trim().toLowerCase(),
        season: saved.season || localStorage.getItem("season") || "Rabi",
        seasonKey: (saved.season || localStorage.getItem("season") || "Rabi").trim().toLowerCase(),
        irrigation: saved.irrigation || localStorage.getItem("farm_irrigation") || "",
        irrigationKey: (saved.irrigation || localStorage.getItem("farm_irrigation") || "").trim().toLowerCase(),
        village: saved.village || localStorage.getItem("village") || "",
        farmName: saved.farmName || localStorage.getItem("farm_name") || ""
    };
}

function getShopCart() {
    return readCachedJson("agroSmartCart", []);
}

function saveShopCart(cart) {
    localStorage.setItem("agroSmartCart", JSON.stringify(cart));
}

function getShopProductCache() {
    return readCachedJson("agroShopProductCache", []);
}

function saveShopProductCache(products) {
    localStorage.setItem("agroShopProductCache", JSON.stringify(products || []));
}

function getShopOrders() {
    return readCachedJson("agroShopOrders", []);
}

function saveShopOrders(orders) {
    localStorage.setItem("agroShopOrders", JSON.stringify(orders));
}

function getShopWishlist() {
    return readCachedJson("agroShopWishlist", []);
}

function saveShopWishlist(items) {
    localStorage.setItem("agroShopWishlist", JSON.stringify(items || []));
}

function getShopCompare() {
    return readCachedJson("agroShopCompare", []);
}

function saveShopCompare(items) {
    localStorage.setItem("agroShopCompare", JSON.stringify(items || []));
}

function getMarketAlerts() {
    return readCachedJson("agroMarketAlerts", []);
}

function saveMarketAlerts(items) {
    localStorage.setItem("agroMarketAlerts", JSON.stringify(items || []));
}

function getShopCustomerProfile() {
    return {
        name: localStorage.getItem("shop_customer_name") || localStorage.getItem("user") || "",
        phone: localStorage.getItem("shop_customer_phone") || "",
        address: localStorage.getItem("shop_delivery_address") || buildFarmLocationQuery() || "",
        payment: localStorage.getItem("shop_payment_method") || "COD",
        email: localStorage.getItem("shop_customer_email") || "",
        street: localStorage.getItem("shop_checkout_street") || localStorage.getItem("farm_street_address") || "",
        villageCity: localStorage.getItem("shop_checkout_village_city") || localStorage.getItem("farm_city") || localStorage.getItem("village") || "",
        state: localStorage.getItem("shop_checkout_state") || localStorage.getItem("farm_state") || localStorage.getItem("userState") || "",
        pincode: localStorage.getItem("shop_checkout_pincode") || localStorage.getItem("farm_pincode") || "",
        instructions: localStorage.getItem("shop_checkout_instructions") || ""
    };
}

function saveShopCustomerProfile(profile) {
    localStorage.setItem("shop_customer_name", profile.name || "");
    localStorage.setItem("shop_customer_phone", profile.phone || "");
    localStorage.setItem("shop_delivery_address", profile.address || "");
    localStorage.setItem("shop_payment_method", profile.payment || "COD");
    localStorage.setItem("shop_customer_email", profile.email || "");
    localStorage.setItem("shop_checkout_street", profile.street || "");
    localStorage.setItem("shop_checkout_village_city", profile.villageCity || "");
    localStorage.setItem("shop_checkout_state", profile.state || "");
    localStorage.setItem("shop_checkout_pincode", profile.pincode || "");
    localStorage.setItem("shop_checkout_instructions", profile.instructions || "");
}

function getCartQuantityForProduct(productId) {
    return getShopCart().find((item) => item.id === productId)?.qty || 0;
}

function getCartDetailedItems() {
    return getShopCart().map((item) => {
        const product = getShopCatalog().find((entry) => entry.id === item.id)
            || getShopProductCache().find((entry) => entry.id === item.id);
        if (!product) return null;
        return {
            ...product,
            qty: item.qty,
            total: product.price * item.qty
        };
    }).filter(Boolean);
}

function getCartTotals() {
    const items = getCartDetailedItems();
    return {
        items,
        count: items.reduce((sum, item) => sum + item.qty, 0),
        total: items.reduce((sum, item) => sum + item.total, 0)
    };
}

function buildProductRecommendation(product, profile) {
    let score = 0;
    const reasons = [];

    if (product.cropMatches?.includes(profile.cropKey)) {
        score += 5;
        reasons.push(`Fits ${profile.crop}`);
    }
    if (product.seasonMatches?.includes(profile.seasonKey)) {
        score += 2;
        reasons.push(`Useful in ${profile.season}`);
    }
    if (product.soilMatches?.includes(profile.soilKey)) {
        score += 2;
        reasons.push(`Suitable for ${profile.soil} soil`);
    }
    if (product.irrigationMatches?.some((item) => profile.irrigationKey.includes(item))) {
        score += 2;
        reasons.push(`Matches ${profile.irrigation || "current"} irrigation`);
    }

    if (["fertilizer", "nutrition"].includes(product.category)) {
        score += 1;
        reasons.push("Common input for planned crop growth");
    }
    if (product.category === "protection" && ["kharif", "rabi"].includes(profile.seasonKey)) {
        score += 1;
        reasons.push("Helps with seasonal crop protection planning");
    }
    if (product.category === "irrigation" && !product.irrigationMatches?.length) {
        score += 1;
        reasons.push("Useful farm utility item");
    }

    if (!reasons.length) {
        reasons.push("General farm-use product");
    }

    return {
        score,
        reasons
    };
}

function getSuggestedQuantity(product, area) {
    if (!area?.acres || !product.baseQtyPerAcre) {
        return `1 ${product.unit}`;
    }

    const quantity = Math.max(1, Math.ceil(area.acres * product.baseQtyPerAcre * 10) / 10);
    return `${quantity} x ${product.unit}`;
}

function getRecommendedProducts(profile = getFarmProfileSnapshot()) {
    return getShopCatalog().map((product) => ({
        ...product,
        recommendation: buildProductRecommendation(product, profile)
    }))
        .sort((a, b) => b.recommendation.score - a.recommendation.score || a.price - b.price);
}

function getRecommendedBundle(profile = getFarmProfileSnapshot()) {
    const picks = getRecommendedProducts(profile).slice(0, 3);
    return {
        items: picks,
        total: picks.reduce((sum, item) => sum + item.price, 0)
    };
}

function getStoredFarmBudget() {
    const rawBudget = localStorage.getItem("farm_budget") || localStorage.getItem("shop_budget") || "";
    const numericBudget = Number(String(rawBudget).replace(/[^\d.]/g, ""));
    return Number.isFinite(numericBudget) && numericBudget > 0 ? numericBudget : 0;
}

function getShopAlternatives(product, catalog = getShopCatalog()) {
    const sameCategory = catalog
        .filter((item) => item.category === product.category && item.id !== product.id)
        .sort((a, b) => a.price - b.price);
    const cheaper = sameCategory.find((item) => item.price < product.price) || null;
    const premium = [...sameCategory].reverse().find((item) => item.price > product.price) || null;
    return { cheaper, premium };
}

function getProductSkipRisk(product, profile = getFarmProfileSnapshot()) {
    if (product.cropMatches?.includes(profile.cropKey) && product.category === "seed") {
        return "Skipping this can delay sowing quality and stand establishment.";
    }
    if (["fertilizer", "nutrition"].includes(product.category)) {
        return "Skipping this may reduce growth support and visible plant vigor.";
    }
    if (product.category === "protection") {
        return "Skipping this can raise disease or pest risk if pressure increases.";
    }
    if (product.category === "irrigation") {
        return "Skipping this may reduce water-use efficiency and timing control.";
    }
    return "Skipping this may not block work today, but it can reduce readiness later.";
}

function buildProductDecisionSummary(product, profile = getFarmProfileSnapshot()) {
    const { cheaper, premium } = getShopAlternatives(product);
    return {
        fit: product.recommendation?.reasons?.slice(0, 2).join(". ") || "General farm-use product",
        quantity: getSuggestedQuantity(product, profile.area),
        cheaper: cheaper ? `${cheaper.name} (${formatShopCurrency(cheaper.price)})` : "No lower-priced alternative in this category",
        premium: premium ? `${premium.name} (${formatShopCurrency(premium.price)})` : "This is already among the premium options",
        risk: getProductSkipRisk(product, profile),
        priceSource: "AgroGyan sample catalog price",
        sellerRating: `${(4.2 + ((product.reviews || 20) % 5) * 0.1).toFixed(1)}/5 seller rating`,
        farmerReview: `Farmers usually pick this for ${product.category} planning when they want practical, farm-ready supply.`
    };
}

function getWishlistDetailedItems() {
    const catalog = getShopCatalog();
    return getShopWishlist().map((id) => catalog.find((item) => item.id === id)).filter(Boolean);
}

function getCompareDetailedItems() {
    const catalog = getShopCatalog();
    return getShopCompare().map((id) => catalog.find((item) => item.id === id)).filter(Boolean);
}

function toggleShopWishlist(productId) {
    const wishlist = getShopWishlist();
    const added = !wishlist.includes(productId);
    const nextWishlist = added ? [...wishlist, productId] : wishlist.filter((id) => id !== productId);
    saveShopWishlist(nextWishlist);
    if (added) trackDemandSignal(productId, "wishlist");
    renderShopPage();
}

function toggleShopCompare(productId) {
    const compare = getShopCompare();
    let nextCompare;
    if (compare.includes(productId)) {
        nextCompare = compare.filter((id) => id !== productId);
    } else {
        nextCompare = [...compare, productId].slice(-3);
        trackDemandSignal(productId, "compare");
    }
    saveShopCompare(nextCompare);
    renderShopPage();
}

function removeFromWishlist(productId) {
    saveShopWishlist(getShopWishlist().filter((id) => id !== productId));
    renderShopPage();
}

function removeFromCompare(productId) {
    saveShopCompare(getShopCompare().filter((id) => id !== productId));
    renderShopPage();
}

function getOrderTrackingMilestones(order) {
    if (Array.isArray(order?.timeline) && order.timeline.length) {
        return order.timeline.map((item) => ({ label: item.status, active: true, note: item.note || "" }));
    }
    const status = String(order?.status || "").toLowerCase();
    const packed = /confirm|packed|payment|created|placed|waiting/.test(status);
    const shipped = /shipped|dispatch/.test(status);
    const delivered = /delivered/.test(status);
    return [
        { label: "Placed", active: true },
        { label: "Packed", active: packed || shipped || delivered },
        { label: "Shipped", active: shipped || delivered },
        { label: "Delivered", active: delivered }
    ];
}

function renderShopWishlistAndCompare() {
    const wishlistBody = document.getElementById("shopWishlistBody");
    const wishlistCount = document.getElementById("shopWishlistCount");
    const compareBody = document.getElementById("shopCompareBody");
    const compareCount = document.getElementById("shopCompareCount");
    const wishlistItems = getWishlistDetailedItems();
    const compareItems = getCompareDetailedItems();

    if (wishlistCount) wishlistCount.innerText = `${wishlistItems.length} saved`;
    if (compareCount) compareCount.innerText = `${compareItems.length} selected`;

    if (wishlistBody) {
        wishlistBody.innerHTML = wishlistItems.map((item) => `
            <div class="shop-mini-item">
                <div>
                    <h4>${sanitizeText(item.name)}</h4>
                    <p>${sanitizeText(formatShopCurrency(item.price))}</p>
                </div>
                <button class="nav-btn" type="button" onclick="removeFromWishlist('${item.id}')">Remove</button>
            </div>
        `).join("") || `<div class="timeline-item"><p>No wishlist items yet. Tap the heart on products to save them.</p></div>`;
    }

    if (compareBody) {
        compareBody.innerHTML = compareItems.map((item) => `
            <div class="shop-mini-item">
                <div>
                    <h4>${sanitizeText(item.name)}</h4>
                    <p>${sanitizeText(formatShopCurrency(item.price))} | ${sanitizeText(item.category)}</p>
                </div>
                <button class="nav-btn" type="button" onclick="removeFromCompare('${item.id}')">Remove</button>
            </div>
        `).join("") || `<div class="timeline-item"><p>Select up to 3 products to build a quick comparison shortlist.</p></div>`;
    }
}

function buildFarmCommandCenter(data, profile = getFarmProfileSnapshot()) {
    const { count, total } = getCartTotals();
    const orders = getShopOrders();
    const budget = getStoredFarmBudget();
    const topMarket = data.markets?.[0];
    const weatherWarning = /rain|storm|humid/i.test(data.weather?.condition || "")
        ? `Weather warning: ${data.weather.condition}`
        : `Weather window: ${data.weather?.condition || "Normal field conditions"}`;
    const pendingOrder = orders[0]
        ? `Latest order ${orders[0].id} is ${orders[0].status}`
        : "No placed order yet";
    const schemeItems = data.scheme_matches?.length
        ? data.scheme_matches.map((item) => `${item.name}: ${item.reason}`)
        : buildSchemeEligibility({
            crop_name: profile.crop,
            land_size: profile.landText,
            season: profile.season
        });
    const expectedYield = profile.area?.acres
        ? `${Math.max(8, Math.round(profile.area.acres * 18))} qtl estimated output range`
        : "Add land size for expected yield";

    return {
        identity: [
            `Crop: ${profile.crop}`,
            `Land: ${profile.landText || "Add land size"}`,
            `Season: ${profile.season}`,
            `Soil: ${profile.soil}`,
            `Irrigation: ${profile.irrigation || "Add irrigation type"}`,
            `Village: ${profile.village || "Add village"}`,
            `Budget: ${budget ? formatShopCurrency(budget) : "Add farm budget"}`
        ],
        decisions: [
            data.daily_briefing?.top_tasks?.[0] || "Inspect crop health before spending on inputs.",
            data.pest_risk?.likely_issue ? `Spray/apply next: ${data.pest_risk.likely_issue}` : "Spray/apply next: check crop stage first.",
            topMarket ? `Market signal: ${topMarket.crop} at ${topMarket.price}` : "Market signal: rates will appear here",
            weatherWarning
        ],
        commerce: [
            count ? `Pending cart: ${count} item(s), ${formatShopCurrency(total)}` : "Pending cart: empty",
            pendingOrder,
            `Price-drop alerts: ${count ? "Watch shortlist items for changes" : "Start a shortlist to track alerts"}`,
            `Scheme eligibility: ${schemeItems[0]}`
        ],
        plan: [
            data.farm_plan?.tasks?.[0] ? `${data.farm_plan.tasks[0].stage}: ${data.farm_plan.tasks[0].task}` : "Season plan will appear here.",
            budget ? `Input budget target: ${formatShopCurrency(budget)}` : "Input budget target: add a farm budget",
            `Expected cost now: ${count ? formatShopCurrency(total) : "Build cart to estimate cost"}`,
            `Expected yield: ${expectedYield}`,
            `Buy-all bundle: ${formatShopCurrency(getRecommendedBundle(profile).total)} starter kit available`
        ],
        retention: [
            data.daily_briefing?.headline || "Daily advisory will appear here.",
            "Crop stage reminder: check leaves and moisture before the next spray.",
            topMarket ? `Mandi alert: watch ${topMarket.crop} trend before bulk sale.` : "Mandi alert: rate signals will appear here.",
            /rain|storm/i.test(data.weather?.condition || "") ? "Rain alert: protect spray timing and harvest drying." : "Rain alert: low immediate risk",
            count ? "Shop alert: saved items are ready for checkout or comparison." : "Shop alert: add key products to start price tracking."
        ]
    };
}

function syncExperienceLanguage(lang) {
    if (!lang) return;
    if (typeof window.setUILanguage === "function") {
        window.setUILanguage(lang);
    } else {
        localStorage.setItem("uiLanguage", lang);
    }
    localStorage.setItem("preferred_language", lang);
    const answerLanguage = document.getElementById("language");
    if (answerLanguage) answerLanguage.value = lang;
    const uiLanguage = document.getElementById("uiLanguage");
    if (uiLanguage) uiLanguage.value = lang;
}

function setExperienceLanguage(lang) {
    syncExperienceLanguage(lang);
    const voicePill = document.getElementById("voicePill");
    if (voicePill) voicePill.innerText = `${lang} voice mode ready`;
}

function launchVoiceWorkflow(lang) {
    syncExperienceLanguage(lang || localStorage.getItem("preferred_language") || "English");
    document.getElementById("assistantHub")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof window.startListening === "function") {
        window.startListening();
    }
}

function getShopCategoryCards() {
    return [
        { key: "seed", label: "Seeds", image: SHOP_IMAGE_BANK.seed[0] },
        { key: "fertilizer", label: "Fertilizers", image: SHOP_IMAGE_BANK.fertilizer[0] },
        { key: "nutrition", label: "Crop Nutrition", image: SHOP_IMAGE_BANK.nutrition[0] },
        { key: "protection", label: "Crop Protection", image: SHOP_IMAGE_BANK.protection[0] },
        { key: "irrigation", label: "Irrigation", image: SHOP_IMAGE_BANK.irrigation[0] },
        { key: "machinery", label: "Farm Machinery", image: SHOP_IMAGE_BANK.machinery[0] },
        { key: "animal", label: "Animal Husbandry", image: SHOP_IMAGE_BANK.animal[0] },
        { key: "garden", label: "Garden Tools", image: SHOP_IMAGE_BANK.garden[0] },
        { key: "all", label: "View All", image: SHOP_IMAGE_BANK.seed[1] }
    ];
}

function getShopFilters() {
    return {
        category: document.getElementById("shopCategoryFilter")?.value || "all",
        search: (document.getElementById("shopSearchInput")?.value || "").trim().toLowerCase()
    };
}

function getFilteredShopProducts() {
    const profile = getFarmProfileSnapshot();
    const filters = getShopFilters();

    return getShopCatalog()
        .map((product) => ({
            ...product,
            recommendation: buildProductRecommendation(product, profile)
        }))
        .filter((product) => {
            const matchesCategory = filters.category === "all" || product.category === filters.category;
            const haystack = [
                product.name,
                product.category,
                product.description,
                product.seller,
                ...(product.cropMatches || [])
            ].join(" ").toLowerCase();
            const simplifiedSearch = filters.search
                .replace(/oes\b/g, "o")
                .replace(/ies\b/g, "y")
                .replace(/s\b/g, "");
            const matchesSearch = !filters.search || haystack.includes(filters.search) || haystack.includes(simplifiedSearch);
            return matchesCategory && matchesSearch;
        })
        .sort((a, b) => b.recommendation.score - a.recommendation.score || a.price - b.price);
}

function renderShopProductGrid() {
    const productGrid = document.getElementById("shopProductGrid");
    const filterResult = document.getElementById("shopFilterResult");
    const emptyState = document.getElementById("shopEmptyState");
    const filterHelp = document.getElementById("shopFilterHelp");
    if (!productGrid) return;

    const profile = getFarmProfileSnapshot();
    const filters = getShopFilters();
    const filteredProducts = getFilteredShopProducts();

    if (filterResult) {
        filterResult.innerText = filteredProducts.length
            ? `${filteredProducts.length} visible product${filteredProducts.length === 1 ? "" : "s"}`
            : "No matching products";
    }

    if (emptyState) {
        emptyState.innerHTML = filteredProducts.length
            ? ""
            : `
                <div class="timeline-item shop-empty-card">
                    <h4>No exact match found</h4>
                    <p>Try a simpler search, switch category, or press Reset. Example: use <strong>tomato</strong> with <strong>All products</strong> or <strong>Seeds</strong>.</p>
                    <p><button class="nav-btn" type="button" onclick="clearShopFilters()">Show all products</button></p>
                </div>
            `;
    }

    if (filterHelp) {
        filterHelp.innerHTML = `
            <div class="timeline-item">
                <h4>How this page works</h4>
                <p>1. Select a category. 2. Products appear on the right instantly. 3. Add products to cart. 4. Open Cart to review totals. 5. Complete payment on Checkout.</p>
            </div>
            <div class="timeline-item">
                <p>Current selection: <strong>${sanitizeText(filters.category)}</strong>${filters.search ? ` | Search: <strong>${sanitizeText(filters.search)}</strong>` : ""}</p>
            </div>
        `;
    }

    productGrid.innerHTML = filteredProducts.map((product) => {
        const quantity = getCartQuantityForProduct(product.id);
        const saveAmount = Math.max(0, product.originalPrice - product.price);
        return `
            <article class="shop-product-card marketplace-product-card">
                <div class="shop-deal-badge">${sanitizeText(`${product.discountPercent}% OFF`)}</div>
                <button class="shop-wishlist-btn" type="button" aria-label="Save product">♡</button>
                <div class="shop-product-image" style="background-image: linear-gradient(180deg, rgba(15, 33, 18, 0.06), rgba(15, 33, 18, 0.22)), url('${product.image}')"></div>
                <div class="shop-rating-row">
                    <span class="shop-rating-pill">${sanitizeText(`${product.rating} ★ | ${product.reviews}`)}</span>
                </div>
                <div class="shop-product-head">
                    <div>
                        <span class="shop-category-pill">${sanitizeText(product.category)}</span>
                        <h4>${sanitizeText(product.name)}</h4>
                    </div>
                </div>
                <p class="shop-product-brand">${sanitizeText(product.brand)}</p>
                <p class="shop-product-copy">${sanitizeText(product.description)}</p>
                <div class="shop-price-stack">
                    <strong>${sanitizeText(formatShopCurrency(product.price))}</strong>
                    <span class="shop-original-price">${sanitizeText(formatShopCurrency(product.originalPrice))}</span>
                </div>
                <div class="shop-save-note">Save ${sanitizeText(formatShopCurrency(saveAmount))}</div>
                <div class="shop-product-meta">
                    <span>${sanitizeText(getSuggestedQuantity(product, profile.area))}</span>
                    <span>${sanitizeText(product.delivery)}</span>
                </div>
                <div class="shop-product-callout">
                    <strong>Why it fits</strong>
                    <p>${sanitizeText(product.recommendation.reasons.slice(0, 2).join(". "))}</p>
                </div>
                <div class="shop-size-row">
                    <span>Size</span>
                    <select class="shop-size-select" aria-label="Choose size for ${sanitizeText(product.name)}">
                        ${product.sizes.map((size) => `<option>${sanitizeText(size)}</option>`).join("")}
                    </select>
                </div>
                <div class="shop-seller-row">
                    <span>Seller: <strong>${sanitizeText(product.seller)}</strong></span>
                </div>
                <div class="section-header shop-card-actions">
                    <button class="nav-btn" type="button" onclick="openShopProductModal('${product.id}')">View details</button>
                    <button class="primary-btn" type="button" onclick="addToShopCart('${product.id}')">${quantity ? `Add more (${quantity})` : "Add to cart"}</button>
                    <span class="badge-chip ${quantity ? "active" : ""}">${quantity || 0} in cart</span>
                </div>
            </article>
        `;
    }).join("") || `<div class="timeline-item"><p>No products match this filter right now.</p></div>`;
}

function renderCompactShopProductGrid() {
    const productGrid = document.getElementById("shopProductGrid");
    const paginationHost = document.getElementById("shopPagination");
    const filterResult = document.getElementById("shopFilterResult");
    const emptyState = document.getElementById("shopEmptyState");
    const filterHelp = document.getElementById("shopFilterHelp");
    if (!productGrid) return;

    const productsPerPage = 20;
    const profile = getFarmProfileSnapshot();
    const filters = getShopFilters();
    const filteredProducts = getFilteredShopProducts();
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
    const currentPage = Math.min(Math.max(window.shopCurrentPage || 1, 1), totalPages);
    const startIndex = (currentPage - 1) * productsPerPage;
    const visibleProducts = filteredProducts.slice(startIndex, startIndex + productsPerPage);
    window.shopCurrentPage = currentPage;

    if (filterResult) {
        filterResult.innerText = filteredProducts.length
            ? `${filteredProducts.length} products | Page ${currentPage} of ${totalPages}`
            : "No matching products";
    }

    if (emptyState) {
        emptyState.innerHTML = filteredProducts.length
            ? ""
            : `
                <div class="timeline-item shop-empty-card">
                    <h4>No exact match found</h4>
                    <p>Try a simpler search, switch category, or press Reset. Example: use <strong>tomato</strong> with <strong>All products</strong> or <strong>Seeds</strong>.</p>
                    <p><button class="nav-btn" type="button" onclick="clearShopFilters()">Show all products</button></p>
                </div>
            `;
    }

    if (filterHelp) {
        filterHelp.innerHTML = `
            <div class="timeline-item">
                <h4>How this page works</h4>
                <p>1. Products are visible instantly. 2. Use category or search only if needed. 3. Add items and edit cart from this same page. 4. Open Cart or Checkout when ready.</p>
            </div>
            <div class="timeline-item">
                <p>Current selection: <strong>${sanitizeText(filters.category)}</strong>${filters.search ? ` | Search: <strong>${sanitizeText(filters.search)}</strong>` : ""}</p>
            </div>
        `;
    }

    productGrid.innerHTML = visibleProducts.map((product) => {
        const quantity = getCartQuantityForProduct(product.id);
        const saveAmount = Math.max(0, product.originalPrice - product.price);
        const decision = buildProductDecisionSummary(product, profile);
        const isWishlisted = getShopWishlist().includes(product.id);
        const isCompared = getShopCompare().includes(product.id);
        const inventory = remoteInventoryMap[product.id];
        const stockText = inventory ? `${inventory.stock_count} in stock` : "Stock sync pending";
        return `
            <article class="shop-product-card marketplace-product-card">
                <div class="shop-deal-badge">${sanitizeText(`${product.discountPercent}% OFF`)}</div>
                <button class="shop-wishlist-btn ${isWishlisted ? "active" : ""}" type="button" aria-label="Save product" onclick="toggleShopWishlist('${product.id}')">${isWishlisted ? "♥" : "♡"}</button>
                <div class="shop-product-image" style="background-image: linear-gradient(180deg, rgba(15, 33, 18, 0.06), rgba(15, 33, 18, 0.22)), url('${product.image}')"></div>
                <div class="shop-rating-row">
                    <span class="shop-rating-pill">${sanitizeText(`${product.rating} ★ | ${product.reviews}`)}</span>
                </div>
                <div class="shop-product-head">
                    <div>
                        <span class="shop-category-pill">${sanitizeText(product.category)}</span>
                        <h4>${sanitizeText(product.name)}</h4>
                    </div>
                </div>
                <p class="shop-product-brand">${sanitizeText(product.brand)}</p>
                <p class="shop-product-copy">${sanitizeText(product.description)}</p>
                <div class="shop-price-stack">
                    <strong>${sanitizeText(formatShopCurrency(product.price))}</strong>
                    <span class="shop-original-price">${sanitizeText(formatShopCurrency(product.originalPrice))}</span>
                </div>
                <div class="shop-save-note">Save ${sanitizeText(formatShopCurrency(saveAmount))}</div>
                <div class="shop-product-meta">
                    <span>${sanitizeText(decision.quantity)}</span>
                    <span>${sanitizeText(product.delivery)}</span>
                    <span>${sanitizeText(decision.sellerRating)}</span>
                </div>
                <div class="shop-product-tags">
                    <span>${sanitizeText(decision.fit)}</span>
                    <span>${sanitizeText(stockText)}</span>
                    ${quantity ? `<span>${sanitizeText(`${quantity} in cart`)}</span>` : ""}
                </div>
                <div class="shop-product-callout">
                    <strong>Decision helper</strong>
                    <p>Cheaper: ${sanitizeText(decision.cheaper)}</p>
                    <p>Premium: ${sanitizeText(decision.premium)}</p>
                    <p>Risk if skipped: ${sanitizeText(decision.risk)}</p>
                </div>
                <div class="shop-size-row">
                    <span>Size</span>
                    <select class="shop-size-select" aria-label="Choose size for ${sanitizeText(product.name)}">
                        ${product.sizes.map((size) => `<option>${sanitizeText(size)}</option>`).join("")}
                    </select>
                </div>
                <div class="shop-seller-row">
                    <span>Seller: <strong>${sanitizeText(product.seller)}</strong></span>
                    <span> | ${sanitizeText(inventory?.price_source || decision.priceSource)}</span>
                </div>
                <div class="section-header shop-card-actions shop-card-actions-tight">
                    <button class="nav-btn" type="button" onclick="openShopProductModal('${product.id}')">View details</button>
                    <button class="primary-btn" type="button" onclick="addToShopCart('${product.id}')">${quantity ? `Add more (${quantity})` : "Add to cart"}</button>
                </div>
                <div class="shop-card-secondary-row">
                    <button class="nav-btn" type="button" onclick="toggleShopCompare('${product.id}')">${isCompared ? "Remove compare" : "Compare"}</button>
                    <button class="nav-btn" type="button" onclick="toggleShopWishlist('${product.id}')">${isWishlisted ? "Saved" : "Save"}</button>
                </div>
                ${quantity ? `
                    <div class="shop-card-edit-row">
                        <div class="shop-qty-stepper">
                            <button type="button" onclick="updateShopCartQty('${product.id}', -1)">-</button>
                            <span>${quantity}</span>
                            <button type="button" onclick="updateShopCartQty('${product.id}', 1)">+</button>
                        </div>
                        <button class="nav-btn" type="button" onclick="removeFromShopCart('${product.id}')">Remove</button>
                    </div>
                ` : ""}
            </article>
        `;
    }).join("") || `<div class="timeline-item"><p>No products match this filter right now.</p></div>`;

    if (paginationHost) {
        if (filteredProducts.length <= productsPerPage) {
            paginationHost.innerHTML = "";
        } else {
            const pageButtons = Array.from({ length: totalPages }, (_, index) => {
                const pageNumber = index + 1;
                return `
                    <button class="nav-btn ${pageNumber === currentPage ? "shop-page-btn-active" : "shop-page-btn"}" type="button" onclick="goToShopPage(${pageNumber})">${pageNumber}</button>
                `;
            }).join("");

            paginationHost.innerHTML = `
                <div class="shop-pagination-bar">
                    <button class="nav-btn shop-page-arrow" type="button" onclick="goToShopPage(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}>‹</button>
                    <span class="shop-page-label">Page ${currentPage} of ${totalPages}</span>
                    <div class="shop-page-number-row">${pageButtons}</div>
                    <button class="nav-btn shop-page-arrow" type="button" onclick="goToShopPage(${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""}>›</button>
                </div>
            `;
        }
    }
}

function renderShopRecommendations() {
    const recommendationList = document.getElementById("shopRecommendationList");
    const adviceList = document.getElementById("shopAdviceList");
    const adviceTitle = document.getElementById("shopAdviceTitle");
    const checklist = document.getElementById("shopChecklist");
    const primaryCrop = document.getElementById("shopPrimaryCrop");
    const landNeed = document.getElementById("shopLandNeed");
    const topSignal = document.getElementById("shopTopSignal");
    const bundlePreview = document.getElementById("shopBundlePreview");
    const flowHelp = document.getElementById("shopFlowHelp");
    const categoryGrid = document.getElementById("shopCategoryGrid");
    if (!recommendationList && !adviceList && !checklist) return;

    const profile = getFarmProfileSnapshot();
    const recommended = getRecommendedProducts(profile).slice(0, 4);
    const bundle = getRecommendedBundle(profile);
    const landLabel = profile.landText || "Add land size";

    if (primaryCrop) primaryCrop.innerText = profile.crop;
    if (landNeed) landNeed.innerText = landLabel;
    if (topSignal) topSignal.innerText = recommended[0]?.name || "Ready";
    if (adviceTitle) adviceTitle.innerText = `Buying plan for ${profile.crop}`;

    if (recommendationList) {
        recommendationList.innerHTML = recommended.map((product) => `
            <div class="timeline-item">
                <h4>${sanitizeText(product.name)}</h4>
                <p>${sanitizeText(product.recommendation.reasons.join(". "))}</p>
                <p>Suggested: <strong>${sanitizeText(getSuggestedQuantity(product, profile.area))}</strong></p>
            </div>
        `).join("");
    }

    if (adviceList) {
        adviceList.innerHTML = [
            `Start with ${recommended[0]?.name || "your top matched input"} because it best fits ${profile.crop} and the saved season/soil details.`,
            profile.area?.acres ? `Your saved area is about ${profile.area.acres.toFixed(2)} acres, so quantities are estimated from that land size.` : "Add exact land size in My Farm to improve quantity guidance.",
            profile.irrigation ? `Irrigation preference noted: ${profile.irrigation}. Equipment and input timing can now follow that setup.` : "Add irrigation type in My Farm for even better recommendations."
        ].map((text) => `<div class="timeline-item"><p>${sanitizeText(text)}</p></div>`).join("");
    }

    if (checklist) {
        checklist.innerHTML = [
            "Check crop stage before buying seed, fertilizer, or protection products.",
            "Compare required quantity with your field size before checkout.",
            "Review weather timing before ordering spray-related products.",
            "Use the assistant if you want a safer budget or organic alternative."
        ].map((text) => `<div class="timeline-item"><p>${sanitizeText(text)}</p></div>`).join("");
    }

    if (bundlePreview) {
        bundlePreview.innerHTML = `
            <div class="timeline-item">
                <h4>Recommended starter kit</h4>
                <p>${bundle.items.map((item) => sanitizeText(item.name)).join(", ")}</p>
                <p>Total if bought together: <strong>${sanitizeText(formatShopCurrency(bundle.total))}</strong></p>
                <p><button class="primary-btn" type="button" onclick="addRecommendedBundle()">Add full kit</button></p>
            </div>
        `;
    }

    if (flowHelp) {
        const { count } = getCartTotals();
        flowHelp.innerHTML = [
            "Step 1: Products are already visible on this page by default.",
            "Step 2: Use category or search only if you want to narrow products.",
            count ? `Step 3: You already have ${count} item(s) in cart. Open Cart next.` : "Step 3: Click Add to cart on any product you want.",
            "Step 4: Open Cart to review totals and quantity.",
            "Step 5: Go to Checkout for address and payment."
        ].map((text) => `<div class="timeline-item"><p>${sanitizeText(text)}</p></div>`).join("");
    }

    if (categoryGrid) {
        categoryGrid.innerHTML = getShopCategoryCards().map((item) => `
            <button class="shop-category-card" type="button" onclick="selectShopCategory('${item.key}')">
                <span class="shop-category-art" style="background-image:url('${item.image}')"></span>
                <span>${sanitizeText(item.label)}</span>
            </button>
        `).join("");
    }
}

function renderShopCart() {
    const cartBody = document.getElementById("shopCartBody");
    const cartTotal = document.getElementById("shopCartTotal");
    const cartItemCount = document.getElementById("shopCartItemCount");
    const cartHeroCount = document.getElementById("shopCartCount");
    const inlineCartCount = document.getElementById("shopInlineCartCount");
    const previewTitle = document.getElementById("shopPreviewTitle");
    const previewCart = document.getElementById("shopPreviewCart");
    const orderHistory = document.getElementById("shopOrderHistory");
    const topSignal = document.getElementById("shopTopSignal");
    const topSignalNote = document.getElementById("shopTopSignalNote");
    const priceStatus = document.getElementById("shopPriceStatus");
    const { items, count, total } = getCartTotals();
    const orders = getShopOrders();
    const customer = getShopCustomerProfile();
    const customerName = document.getElementById("shopCustomerName");
    const customerPhone = document.getElementById("shopCustomerPhone");
    const deliveryAddress = document.getElementById("shopDeliveryAddress");
    const paymentMethod = document.getElementById("shopPaymentMethod");

    if (customerName && customerName.value !== customer.name) customerName.value = customer.name;
    if (customerPhone && customerPhone.value !== customer.phone) customerPhone.value = customer.phone;
    if (deliveryAddress && deliveryAddress.value !== customer.address) deliveryAddress.value = customer.address;
    if (paymentMethod && paymentMethod.value !== customer.payment) paymentMethod.value = customer.payment;

    if (cartTotal) cartTotal.innerText = formatShopCurrency(total);
    if (cartItemCount) cartItemCount.innerText = String(count);
    if (cartHeroCount) cartHeroCount.innerText = String(count);
    if (inlineCartCount) inlineCartCount.innerText = `${count} item${count === 1 ? "" : "s"}`;
    if (topSignal) topSignal.innerText = count ? `${count} item${count === 1 ? "" : "s"} in cart` : "Cart is empty";
    if (topSignalNote) topSignalNote.innerText = count ? `Estimated total ${formatShopCurrency(total)}. You can now edit quantities from this page or continue to checkout.` : "Choose a category and visible products will appear below.";
    if (priceStatus) {
        const marketSource = remoteFeedStatus?.market?.source || readCachedJson("agroLiveFeedStatus", null)?.market?.source;
        priceStatus.innerText = marketSource
            ? `Weather and mandi feeds are synced from ${marketSource}. Product catalog prices still depend on shared inventory/admin updates.`
            : "Product catalog prices are using shared app inventory where available. Live external market feed is still being connected for product pricing.";
    }

    if (cartBody) {
        cartBody.innerHTML = items.map((item) => `
            <div class="shop-cart-item">
                <div>
                    <h4>${sanitizeText(item.name)}</h4>
                    <p>${sanitizeText(item.unit)} | ${sanitizeText(formatShopCurrency(item.price))} each</p>
                </div>
                <div class="shop-cart-actions">
                    <div class="shop-qty-stepper">
                        <button type="button" onclick="updateShopCartQty('${item.id}', -1)">-</button>
                        <span>${item.qty}</span>
                        <button type="button" onclick="updateShopCartQty('${item.id}', 1)">+</button>
                    </div>
                    <button class="nav-btn" type="button" onclick="removeFromShopCart('${item.id}')">Remove</button>
                    <strong>${sanitizeText(formatShopCurrency(item.total))}</strong>
                </div>
            </div>
        `).join("") || `<div class="timeline-item"><p>Your cart is empty. Add products from the catalog to start your farm order.</p></div>`;
    }

    if (previewTitle) {
        previewTitle.innerText = count ? `${count} items saved in cart` : "Your saved cart";
    }
    if (previewCart) {
        previewCart.innerHTML = items.slice(0, 3).map((item) => `
            <div class="timeline-item">
                <h4>${sanitizeText(item.name)}</h4>
                <p>${item.qty} x ${sanitizeText(item.unit)} | ${sanitizeText(formatShopCurrency(item.total))}</p>
            </div>
        `).join("") || `<div class="timeline-item"><p>No cart items yet. Open Smart Shop to start building your farm order.</p></div>`;
    }

    if (orderHistory) {
        orderHistory.innerHTML = orders.length
            ? orders.slice(0, 3).map((order) => `
                <div class="timeline-item">
                    <h4>Order ${sanitizeText(order.id)}</h4>
                    <p>${sanitizeText(order.items)} | ${sanitizeText(formatShopCurrency(order.total))} | ${sanitizeText(order.payment_method)}</p>
                    <p>${sanitizeText(order.customer_name)} | ${sanitizeText(order.delivery_address)}</p>
                    <p>${sanitizeText(order.status)}</p>
                    ${order.timeline?.length ? `<p>${sanitizeText(order.timeline[order.timeline.length - 1].note || "")}</p>` : ""}
                </div>
            `).join("")
            : `<div class="timeline-item"><p>No orders yet. Your completed checkouts will appear here.</p></div>`;
    }
}

function renderShopPreview() {
    const previewList = document.getElementById("shopPreviewList");
    if (!previewList) return;

    const profile = getFarmProfileSnapshot();
    const recommended = getRecommendedProducts(profile).slice(0, 3);
    previewList.innerHTML = recommended.map((product) => `
        <div class="timeline-item">
            <h4>${sanitizeText(product.name)}</h4>
            <p>${sanitizeText(product.recommendation.reasons.slice(0, 2).join(". "))}</p>
            <p>${sanitizeText(formatShopCurrency(product.price))} | Suggested ${sanitizeText(getSuggestedQuantity(product, profile.area))}</p>
        </div>
    `).join("");
}

function renderShopPage() {
    try {
        renderCompactShopProductGrid();
    } catch (error) {
        console.error("shop product render error", error);
        const productGrid = document.getElementById("shopProductGrid");
        const emptyState = document.getElementById("shopEmptyState");
        if (productGrid) productGrid.innerHTML = "";
        if (emptyState) {
            emptyState.innerHTML = `
                <div class="timeline-item shop-empty-card">
                    <h4>Products could not load</h4>
                    <p>The shop catalog hit an error. Refresh the page once and try again.</p>
                </div>
            `;
        }
    }

    try {
        renderShopRecommendations();
        renderShopCart();
        renderShopWishlistAndCompare();
    } catch (error) {
        console.error("shop side render error", error);
    }
}

function renderCartPage() {
    const itemsHost = document.getElementById("cartPageItems");
    const summaryHost = document.getElementById("cartSummaryBody");
    const heroTotal = document.getElementById("cartHeroTotal");
    const heroCount = document.getElementById("cartHeroCount");
    const { items, count, total } = getCartTotals();

    if (heroTotal) heroTotal.innerText = formatShopCurrency(total);
    if (heroCount) heroCount.innerText = `${count} item${count === 1 ? "" : "s"} selected`;

    if (itemsHost) {
        itemsHost.innerHTML = items.map((item) => `
            <article class="cart-page-item">
                <div class="cart-page-image" style="background-image: linear-gradient(180deg, rgba(15, 33, 18, 0.06), rgba(15, 33, 18, 0.22)), url('${item.image}')"></div>
                <div class="cart-page-copy">
                    <h4>${sanitizeText(item.name)}</h4>
                    <p>${sanitizeText(item.description)}</p>
                    <p>Seller: <strong>${sanitizeText(item.seller)}</strong></p>
                    <p>${sanitizeText(item.unit)} | ${sanitizeText(item.delivery)}</p>
                </div>
                <div class="cart-page-side">
                    <strong>${sanitizeText(formatShopCurrency(item.price))}</strong>
                    <div class="shop-qty-stepper">
                        <button type="button" onclick="updateShopCartQty('${item.id}', -1); renderCartPage();">-</button>
                        <span>${item.qty}</span>
                        <button type="button" onclick="updateShopCartQty('${item.id}', 1); renderCartPage();">+</button>
                    </div>
                    <div class="badge-chip active">${sanitizeText(formatShopCurrency(item.total))}</div>
                </div>
            </article>
        `).join("") || `<div class="timeline-item"><p>Your cart is empty. Go back to Smart Shop and add some products first.</p></div>`;
    }

    if (summaryHost) {
        summaryHost.innerHTML = `
            <div class="timeline-item"><h4>Items total</h4><p>${count} item${count === 1 ? "" : "s"}</p></div>
            <div class="timeline-item"><h4>Subtotal</h4><p>${sanitizeText(formatShopCurrency(total))}</p></div>
            <div class="timeline-item"><h4>Delivery</h4><p>${count ? "Free standard delivery" : "No items yet"}</p></div>
            <div class="timeline-item"><h4>Final total</h4><p><strong>${sanitizeText(formatShopCurrency(total))}</strong></p></div>
        `;
    }
}

function renderCheckoutPage() {
    const customer = getShopCustomerProfile();
    const { items, count, total } = getCartTotals();
    const heroTotal = document.getElementById("checkoutHeroTotal");
    const heroCount = document.getElementById("checkoutHeroCount");
    const orderItems = document.getElementById("checkoutOrderItems");
    const summaryBody = document.getElementById("checkoutSummaryBody");
    const deliveryNote = document.getElementById("checkoutDeliveryNote");
    const actionButton = document.getElementById("checkoutPlaceOrderButton");
    const trackingHost = document.getElementById("checkoutOrderTracking");

    if (heroTotal) heroTotal.innerText = formatShopCurrency(total);
    if (heroCount) heroCount.innerText = `${count} item${count === 1 ? "" : "s"}`;
    if (deliveryNote) deliveryNote.innerText = count ? "Standard delivery in 2 to 4 days for most products." : "Add products to start the checkout.";
    if (actionButton) actionButton.disabled = !count;

    const fill = (id, value) => {
        const element = document.getElementById(id);
        if (element && !element.value) element.value = value || "";
    };

    fill("checkoutCustomerName", customer.name);
    fill("checkoutCustomerPhone", customer.phone);
    fill("checkoutCustomerEmail", customer.email);
    fill("checkoutStreet", customer.street);
    fill("checkoutVillageCity", customer.villageCity);
    fill("checkoutState", customer.state);
    fill("checkoutPincode", customer.pincode);
    fill("checkoutInstructions", customer.instructions);
    renderCheckoutPaymentPanel(customer.payment || "COD");
    document.querySelectorAll("[data-payment-method]").forEach((item) => {
        item.classList.toggle("active", item.dataset.paymentMethod === (customer.payment || "COD"));
    });

    if (orderItems) {
        orderItems.innerHTML = items.map((item) => `
            <article class="checkout-order-item">
                <div class="checkout-order-image" style="background-image: linear-gradient(180deg, rgba(15, 33, 18, 0.08), rgba(15, 33, 18, 0.2)), url('${item.image}')"></div>
                <div class="checkout-order-copy">
                    <h4>${sanitizeText(item.name)}</h4>
                    <p>${item.qty} x ${sanitizeText(item.unit)}</p>
                    <p>Seller: <strong>${sanitizeText(item.seller)}</strong></p>
                </div>
                <strong>${sanitizeText(formatShopCurrency(item.total))}</strong>
            </article>
        `).join("") || `<div class="timeline-item"><p>Your cart is empty. Add products from Smart Shop before checkout.</p></div>`;
    }

    if (summaryBody) {
        summaryBody.innerHTML = `
            <div class="timeline-item"><h4>Subtotal</h4><p>${sanitizeText(formatShopCurrency(total))}</p></div>
            <div class="timeline-item"><h4>Shipping</h4><p>${count ? "Free standard delivery" : "No items"}</p></div>
            <div class="timeline-item"><h4>Payment mode</h4><p>${sanitizeText(customer.payment || "COD")}</p></div>
            <div class="timeline-item"><h4>Payable total</h4><p><strong>${sanitizeText(formatShopCurrency(total))}</strong></p></div>
        `;
    }

    if (trackingHost) {
        const latestOrder = getShopOrders()[0];
        trackingHost.innerHTML = latestOrder ? `
            <div class="timeline-item">
                <h4>Recent order: ${sanitizeText(latestOrder.id)}</h4>
                <p>${sanitizeText(latestOrder.status)}</p>
                <div class="order-tracking-row">
                    ${getOrderTrackingMilestones(latestOrder).map((step) => `<span class="badge-chip ${step.active ? "active" : ""}">${sanitizeText(step.label)}</span>`).join("")}
                </div>
            </div>
        ` : `<div class="timeline-item"><p>No recent order yet. Place one to see local tracking steps here.</p></div>`;
    }
}

function addToShopCart(productId) {
    const cart = getShopCart();
    const existing = cart.find((item) => item.id === productId);
    if (existing) existing.qty += 1;
    else cart.push({ id: productId, qty: 1 });
    saveShopCart(cart);
    renderShopPage();
    renderShopPreview();
    renderCartPage();
    renderCheckoutPage();
}

function addRecommendedBundle() {
    const bundle = getRecommendedBundle();
    const cart = getShopCart();
    bundle.items.forEach((product) => {
        const existing = cart.find((item) => item.id === product.id);
        if (existing) existing.qty += 1;
        else cart.push({ id: product.id, qty: 1 });
    });
    saveShopCart(cart);
    const message = document.getElementById("shopCheckoutMessage");
    if (message) message.innerText = "Recommended farm kit added to cart.";
    renderShopPage();
    renderShopPreview();
    renderCartPage();
    renderCheckoutPage();
}

function updateShopCartQty(productId, delta) {
    const nextCart = getShopCart()
        .map((item) => item.id === productId ? { ...item, qty: item.qty + delta } : item)
        .filter((item) => item.qty > 0);
    saveShopCart(nextCart);
    renderShopPage();
    renderShopPreview();
    renderCartPage();
    renderCheckoutPage();
}

function removeFromShopCart(productId) {
    const nextCart = getShopCart().filter((item) => item.id !== productId);
    saveShopCart(nextCart);
    const message = document.getElementById("shopCheckoutMessage");
    if (message) message.innerText = "Item removed from cart.";
    renderShopPage();
    renderShopPreview();
    renderCartPage();
    renderCheckoutPage();
}

function clearShopCart() {
    saveShopCart([]);
    const message = document.getElementById("shopCheckoutMessage");
    if (message) message.innerText = "Cart cleared. You can build a fresh farm order now.";
    renderShopPage();
    renderShopPreview();
    renderCartPage();
    renderCheckoutPage();
}

function openShopProductModal(productId) {
    const product = getShopCatalog().find((item) => item.id === productId);
    const modal = document.getElementById("shopProductModal");
    const title = document.getElementById("shopModalTitle");
    const image = document.getElementById("shopModalImage");
    const meta = document.getElementById("shopModalMeta");
    const description = document.getElementById("shopModalDescription");
    const advice = document.getElementById("shopModalAdvice");
    const addButton = document.getElementById("shopModalAddButton");
    const profile = getFarmProfileSnapshot();
    const inventory = remoteInventoryMap[productId];
    if (!product || !modal || !title || !image || !meta || !description || !advice || !addButton) return;
    const decision = buildProductDecisionSummary(product, profile);

    title.innerText = product.name;
    image.style.backgroundImage = `linear-gradient(180deg, rgba(15, 33, 18, 0.08), rgba(15, 33, 18, 0.22)), url('${product.image}')`;
    meta.innerHTML = [
        `<span>${sanitizeText(product.category)}</span>`,
        `<span>${sanitizeText(product.brand || product.seller || "AgroGyan Select")}</span>`,
        `<span>${sanitizeText(product.unit)}</span>`,
        `<span>${sanitizeText(product.delivery)}</span>`,
        `<span>${sanitizeText(formatShopCurrency(product.price))}</span>`
    ].join("");
    description.innerHTML = `
        <div class="timeline-item">
            <h4>What this product does</h4>
            <p>${sanitizeText(product.description)}</p>
        </div>
        <div class="timeline-item">
            <h4>Why AgroGyan recommends it</h4>
            <p>${sanitizeText(decision.fit)}</p>
            <p>Suggested quantity: <strong>${sanitizeText(decision.quantity)}</strong></p>
        </div>
        <div class="timeline-item">
            <h4>Seller</h4>
            <p>${sanitizeText(product.seller)} | ${sanitizeText(decision.sellerRating)}</p>
            <p>${sanitizeText(inventory ? `${inventory.stock_count} units currently available in shared inventory.` : "Shared stock count will appear after inventory sync.")}</p>
            <p>${sanitizeText(decision.farmerReview)}</p>
        </div>
    `;
    advice.innerHTML = `
        <div class="timeline-item">
            <h4>Decision shop view</h4>
            <p>Cheaper alternative: ${sanitizeText(decision.cheaper)}</p>
            <p>Premium alternative: ${sanitizeText(decision.premium)}</p>
            <p>Risk if skipped: ${sanitizeText(decision.risk)}</p>
        </div>
        <div class="timeline-item">
            <h4>Price source</h4>
            <p>${sanitizeText(inventory?.price_source || decision.priceSource)}.</p>
        </div>
    `;
    addButton.onclick = () => {
        addToShopCart(product.id);
        closeShopProductModal();
    };
    modal.classList.remove("hidden");
}

function closeShopProductModal() {
    const modal = document.getElementById("shopProductModal");
    if (modal) modal.classList.add("hidden");
}

async function simulateShopCheckout() {
    const message = document.getElementById("shopCheckoutMessage");
    const { items, count, total } = getCartTotals();
    const customer = {
        name: document.getElementById("shopCustomerName")?.value.trim() || "",
        phone: document.getElementById("shopCustomerPhone")?.value.trim() || "",
        address: document.getElementById("shopDeliveryAddress")?.value.trim() || "",
        payment: document.getElementById("shopPaymentMethod")?.value || "COD"
    };
    if (!count) {
        if (message) message.innerText = "Add products first, then checkout.";
        return;
    }

    if (!customer.name || !customer.phone || !customer.address) {
        if (message) message.innerText = "Please fill farmer name, mobile number, and delivery address before checkout.";
        return;
    }

    saveShopCustomerProfile(customer);

    let orderId = `AG-${Date.now().toString().slice(-6)}`;
    let remoteCreated = false;
    try {
        const payload = await fetchJsonSafe(`${AGRO_API_URL}/shop/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: getCurrentUserId(),
                customer_name: customer.name,
                customer_phone: customer.phone,
                delivery_address: customer.address,
                payment_method: customer.payment,
                items: items.map((item) => ({ product_id: item.id, name: item.name, qty: item.qty, price: item.price })),
                total
            })
        });
        orderId = payload.order?.order_code || orderId;
        remoteCreated = true;
        await loadRemoteOrders();
        await loadRemoteInventory();
    } catch (error) {
        const orders = getShopOrders();
        orders.unshift({
            id: orderId,
            items: items.map((item) => `${item.name} x${item.qty}`).join(", "),
            total,
            item_count: count,
            payment_method: customer.payment,
            customer_name: customer.name,
            customer_phone: customer.phone,
            delivery_address: customer.address,
            status: customer.payment === "COD" ? "COD order placed. Waiting for seller confirmation." : `${customer.payment} selected. Payment confirmation step can be connected next.`,
            created_at: new Date().toISOString()
        });
        saveShopOrders(orders.slice(0, 10));
    }
    saveShopCart([]);

    if (message) {
        message.innerText = remoteCreated
            ? `Order ${orderId} created and synced to shared order tracking for ${count} items worth ${formatShopCurrency(total)}.`
            : `Order ${orderId} created locally for ${count} items worth ${formatShopCurrency(total)}.`;
    }
    renderShopPage();
    renderShopPreview();
    renderCheckoutPage();
}

function filterShopProducts() {
    window.shopCurrentPage = 1;
    renderCompactShopProductGrid();
    renderShopCart();
    renderShopRecommendations();
}

function clearShopFilters() {
    const category = document.getElementById("shopCategoryFilter");
    const search = document.getElementById("shopSearchInput");
    if (category) category.value = "all";
    if (search) search.value = "";
    filterShopProducts();
}

function selectShopCategory(category) {
    const categoryInput = document.getElementById("shopCategoryFilter");
    const searchInput = document.getElementById("shopSearchInput");
    if (categoryInput) categoryInput.value = category;
    if (searchInput) searchInput.value = "";
    filterShopProducts();
    document.getElementById("shopProductGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goToShopPage(pageNumber) {
    const filteredProducts = getFilteredShopProducts();
    const productsPerPage = 20;
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
    const nextPage = Math.min(Math.max(pageNumber, 1), totalPages);
    window.shopCurrentPage = nextPage;
    renderCompactShopProductGrid();
    document.getElementById("shopProductGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCheckoutPaymentPanel(method) {
    const panel = document.getElementById("checkoutPaymentPanel");
    if (!panel) return;

    const customer = getShopCustomerProfile();
    const markup = {
        COD: `
            <div class="checkout-payment-card">
                <div>
                    <p class="eyebrow">Cash on Delivery</p>
                    <h3>Pay when your order arrives</h3>
                    <p class="subnote">Keep your phone reachable so the delivery call does not get missed.</p>
                </div>
                <div class="checkout-payment-points">
                    <div class="timeline-item"><p>No online payment needed right now.</p></div>
                    <div class="timeline-item"><p>Order confirmation happens after you place the order.</p></div>
                </div>
            </div>
        `,
        UPI: `
            <div class="checkout-payment-card">
                <div>
                    <p class="eyebrow">UPI Payment</p>
                    <h3>Use your UPI ID</h3>
                    <p class="subnote">This is structured like a real payment step and can later connect to a live gateway.</p>
                </div>
                <div class="decision-form-grid decision-form-grid-wide">
                    <label>
                        <span>UPI ID</span>
                        <input id="checkoutUpiId" type="text" placeholder="name@upi" value="${sanitizeText(localStorage.getItem("shop_checkout_upi_id") || "")}" oninput="saveCheckoutDraft()">
                    </label>
                    <label>
                        <span>Preferred app</span>
                        <input id="checkoutUpiApp" type="text" placeholder="PhonePe / GPay / Paytm" value="${sanitizeText(localStorage.getItem("shop_checkout_upi_app") || "")}" oninput="saveCheckoutDraft()">
                    </label>
                </div>
            </div>
        `,
        Card: `
            <div class="checkout-payment-card">
                <div>
                    <p class="eyebrow">Card Payment</p>
                    <h3>Enter card details</h3>
                    <p class="subnote">This keeps the checkout page systematic now, even before gateway integration.</p>
                </div>
                <div class="decision-form-grid decision-form-grid-wide">
                    <label>
                        <span>Name on card</span>
                        <input id="checkoutCardName" type="text" placeholder="Card holder name" value="${sanitizeText(localStorage.getItem("shop_checkout_card_name") || customer.name || "")}" oninput="saveCheckoutDraft()">
                    </label>
                    <label>
                        <span>Card number</span>
                        <input id="checkoutCardNumber" type="text" placeholder="1234 5678 9012 3456" value="${sanitizeText(localStorage.getItem("shop_checkout_card_number") || "")}" oninput="saveCheckoutDraft()">
                    </label>
                    <label>
                        <span>Expiry</span>
                        <input id="checkoutCardExpiry" type="text" placeholder="MM/YY" value="${sanitizeText(localStorage.getItem("shop_checkout_card_expiry") || "")}" oninput="saveCheckoutDraft()">
                    </label>
                    <label>
                        <span>CVV</span>
                        <input id="checkoutCardCvv" type="password" placeholder="123" value="${sanitizeText(localStorage.getItem("shop_checkout_card_cvv") || "")}" oninput="saveCheckoutDraft()">
                    </label>
                </div>
            </div>
        `
    };

    panel.innerHTML = markup[method] || markup.COD;
}

function selectPaymentMethod(method) {
    localStorage.setItem("shop_payment_method", method);
    document.querySelectorAll("[data-payment-method]").forEach((item) => {
        item.classList.toggle("active", item.dataset.paymentMethod === method);
    });
    renderCheckoutPaymentPanel(method);
}

function saveCheckoutDraft() {
    const payment = localStorage.getItem("shop_payment_method") || "COD";
    const customer = {
        name: document.getElementById("checkoutCustomerName")?.value.trim() || "",
        phone: document.getElementById("checkoutCustomerPhone")?.value.trim() || "",
        email: document.getElementById("checkoutCustomerEmail")?.value.trim() || "",
        street: document.getElementById("checkoutStreet")?.value.trim() || "",
        villageCity: document.getElementById("checkoutVillageCity")?.value.trim() || "",
        state: document.getElementById("checkoutState")?.value.trim() || "",
        pincode: document.getElementById("checkoutPincode")?.value.trim() || "",
        instructions: document.getElementById("checkoutInstructions")?.value.trim() || "",
        payment
    };
    customer.address = [customer.street, customer.villageCity, customer.state, customer.pincode].filter(Boolean).join(", ");
    saveShopCustomerProfile(customer);

    localStorage.setItem("shop_checkout_upi_id", document.getElementById("checkoutUpiId")?.value.trim() || "");
    localStorage.setItem("shop_checkout_upi_app", document.getElementById("checkoutUpiApp")?.value.trim() || "");
    localStorage.setItem("shop_checkout_card_name", document.getElementById("checkoutCardName")?.value.trim() || "");
    localStorage.setItem("shop_checkout_card_number", document.getElementById("checkoutCardNumber")?.value.trim() || "");
    localStorage.setItem("shop_checkout_card_expiry", document.getElementById("checkoutCardExpiry")?.value.trim() || "");
    localStorage.setItem("shop_checkout_card_cvv", document.getElementById("checkoutCardCvv")?.value.trim() || "");
}

function placeShopOrder() {
    const status = document.getElementById("checkoutStatusMessage");
    const { items, count, total } = getCartTotals();
    const payment = localStorage.getItem("shop_payment_method") || "COD";
    const customer = {
        name: document.getElementById("checkoutCustomerName")?.value.trim() || "",
        phone: document.getElementById("checkoutCustomerPhone")?.value.trim() || "",
        email: document.getElementById("checkoutCustomerEmail")?.value.trim() || "",
        street: document.getElementById("checkoutStreet")?.value.trim() || "",
        villageCity: document.getElementById("checkoutVillageCity")?.value.trim() || "",
        state: document.getElementById("checkoutState")?.value.trim() || "",
        pincode: document.getElementById("checkoutPincode")?.value.trim() || "",
        instructions: document.getElementById("checkoutInstructions")?.value.trim() || "",
        payment
    };
    customer.address = [customer.street, customer.villageCity, customer.state, customer.pincode].filter(Boolean).join(", ");

    if (!count) {
        if (status) status.innerText = "Your cart is empty. Please add products before placing the order.";
        return;
    }
    if (!customer.name || !customer.phone || !customer.address) {
        if (status) status.innerText = "Please complete name, mobile number, and address before placing the order.";
        return;
    }

    if (payment === "UPI" && !(document.getElementById("checkoutUpiId")?.value.trim())) {
        if (status) status.innerText = "Please enter your UPI ID before placing the order.";
        return;
    }

    if (payment === "Card") {
        const cardName = document.getElementById("checkoutCardName")?.value.trim() || "";
        const cardNumber = document.getElementById("checkoutCardNumber")?.value.trim() || "";
        const cardExpiry = document.getElementById("checkoutCardExpiry")?.value.trim() || "";
        const cardCvv = document.getElementById("checkoutCardCvv")?.value.trim() || "";
        if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
            if (status) status.innerText = "Please complete all card details before placing the order.";
            return;
        }
    }

    saveCheckoutDraft();
    saveShopCustomerProfile(customer);
    const orders = getShopOrders();
    const orderId = `AG-${Date.now().toString().slice(-6)}`;
    orders.unshift({
        id: orderId,
        items: items.map((item) => `${item.name} x${item.qty}`).join(", "),
        total,
        item_count: count,
        payment_method: payment,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        delivery_address: customer.address,
        instructions: customer.instructions,
        payment_reference: payment === "UPI"
            ? document.getElementById("checkoutUpiId")?.value.trim() || ""
            : payment === "Card"
                ? `Card ending ${String(document.getElementById("checkoutCardNumber")?.value || "").replace(/\s+/g, "").slice(-4)}`
                : "Pay on delivery",
        status: payment === "COD" ? "COD order placed. Waiting for seller confirmation." : `${payment} order created. Payment verification can be connected next.`,
        created_at: new Date().toISOString()
    });
    saveShopOrders(orders.slice(0, 10));
    saveShopCart([]);

    if (status) status.innerText = `Order ${orderId} placed successfully for ${formatShopCurrency(total)}. You can review it in Admin Panel or local order history.`;
    renderCartPage();
    renderCheckoutPage();
}

function initWeatherSlideshow() {
    const slideHost = document.getElementById("weatherSlides");
    const dotHost = document.getElementById("weatherSlideDots");
    if (!slideHost || !dotHost) return;

    if (!slideHost.dataset.ready) {
        slideHost.innerHTML = WEATHER_SLIDES.map((slide, index) => `
            <div class="weather-slide ${index === 0 ? "active" : ""}" style="background-image: linear-gradient(180deg, rgba(8, 20, 11, 0.1), rgba(8, 20, 11, 0.32)), linear-gradient(135deg, rgba(10, 22, 12, 0.3), rgba(10, 22, 12, 0.08)), url('${slide.image}')"></div>
        `).join("");
        dotHost.innerHTML = WEATHER_SLIDES.map((_, index) => `<span class="weather-slide-dot ${index === 0 ? "active" : ""}"></span>`).join("");
        slideHost.dataset.ready = "true";
    }

    const slides = Array.from(slideHost.querySelectorAll(".weather-slide"));
    const dots = Array.from(dotHost.querySelectorAll(".weather-slide-dot"));
    let currentIndex = Number.parseInt(slideHost.dataset.index || "0", 10) || 0;

    const renderSlide = (index) => {
        const safeIndex = (index + WEATHER_SLIDES.length) % WEATHER_SLIDES.length;
        slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === safeIndex));
        dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === safeIndex));
        slideHost.dataset.index = String(safeIndex);
        currentIndex = safeIndex;
    };

    renderSlide(currentIndex);
    if (weatherSlideshowTimer) window.clearInterval(weatherSlideshowTimer);
    weatherSlideshowTimer = window.setInterval(() => {
        renderSlide(currentIndex + 1);
    }, 3000);
}

function getFarmAddressFields() {
    const fieldIds = [
        "farmStreetAddress",
        "farmCity",
        "farmVillage",
        "farmTaluka",
        "farmState",
        "farmPincode"
    ];

    return fieldIds.map((id) => document.getElementById(id)?.value.trim() || "");
}

function buildFarmLocationQuery() {
    return getFarmAddressFields().filter(Boolean).join(", ");
}

function parseFarmArea(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return null;

    const amount = Number.parseFloat(raw.replace(/,/g, "").match(/[\d.]+/)?.[0] || "");
    if (!Number.isFinite(amount) || amount <= 0) return null;

    let acres = amount;
    if (raw.includes("hect")) acres = amount * 2.47105;
    else if (/\bbigha\b/.test(raw)) acres = amount * 0.6198;
    else if (/\bguntha\b/.test(raw)) acres = amount * 0.025;
    else if (/\bsq\b|\bsquare\b|\bsft\b|\bft\b/.test(raw)) acres = amount / 43560;

    const squareMeters = acres * 4046.8564224;
    const sideMeters = Math.sqrt(squareMeters);

    return {
        raw,
        acres,
        squareMeters,
        sideMeters
    };
}

function formatFarmBoundaryText(area) {
    if (!area) return "Add farm size to estimate the boundary.";
    const acres = area.acres >= 10 ? area.acres.toFixed(1) : area.acres.toFixed(2);
    const side = area.sideMeters >= 100 ? area.sideMeters.toFixed(0) : area.sideMeters.toFixed(1);
    return `Estimated square boundary for ${acres} acres, about ${side} m x ${side} m.`;
}

function renderFarmBoundaryOverlay(area) {
    const overlay = document.getElementById("farmBoundaryOverlay");
    const note = document.getElementById("farmBoundaryNote");
    if (!overlay || !note) return;

    if (!area) {
        overlay.innerHTML = `<rect x="16" y="20" width="68" height="46" rx="2"></rect>`;
        note.innerText = "Estimated boundary will appear here after you enter address and farm size.";
        return;
    }

    const sizeFactor = Math.max(28, Math.min(76, 28 + Math.log10(area.squareMeters + 10) * 14));
    const width = Math.min(76, sizeFactor);
    const height = Math.max(28, Math.min(58, width * 0.68));
    const x = (100 - width) / 2;
    const y = (86 - height) / 2;

    overlay.innerHTML = `
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="2"></rect>
        <line x1="${x.toFixed(2)}" y1="${(y + height / 2).toFixed(2)}" x2="${(x + width).toFixed(2)}" y2="${(y + height / 2).toFixed(2)}"></line>
        <line x1="${(x + width / 2).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + width / 2).toFixed(2)}" y2="${(y + height).toFixed(2)}"></line>
    `;
    note.innerText = formatFarmBoundaryText(area);
}

function renderFarmMapPreview() {
    const frame = document.getElementById("farmMapFrame");
    const openLink = document.getElementById("farmMapOpenLink");
    const summary = document.getElementById("farmMapSummary");
    if (!frame || !openLink || !summary) return;

    const locationQuery = buildFarmLocationQuery();
    const landValue = document.getElementById("farmLand")?.value.trim() || "";
    const area = parseFarmArea(landValue);

    if (!locationQuery) {
        frame.src = "https://www.google.com/maps?q=India&output=embed";
        openLink.href = "https://www.google.com/maps";
        summary.innerHTML = `<div class="timeline-item"><p>Add your farm address and size, then click <strong>View Your Farm</strong>.</p></div>`;
        renderFarmBoundaryOverlay(area);
        return;
    }

    const encodedQuery = encodeURIComponent(locationQuery);
    frame.src = `https://www.google.com/maps?q=${encodedQuery}&output=embed`;
    openLink.href = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
    renderFarmBoundaryOverlay(area);

    const street = document.getElementById("farmStreetAddress")?.value.trim() || "";
    const city = document.getElementById("farmCity")?.value.trim() || "";
    const village = document.getElementById("farmVillage")?.value.trim() || "";
    const taluka = document.getElementById("farmTaluka")?.value.trim() || "";
    const state = document.getElementById("farmState")?.value.trim() || "";

    summary.innerHTML = `
        <div class="timeline-item">
            <h4>Map center</h4>
            <p>${sanitizeText(locationQuery)}</p>
        </div>
        <div class="timeline-item">
            <h4>Estimated farm boundary</h4>
            <p>${sanitizeText(formatFarmBoundaryText(area))}</p>
        </div>
        <div class="timeline-item">
            <h4>Address details used</h4>
            <p>${sanitizeText([street, city, village, taluka, state].filter(Boolean).join(" | ") || "Basic location only")}</p>
        </div>
    `;
}

function attachFarmMapListeners() {
    const fieldIds = [
        "farmLand",
        "farmVillage",
        "farmTaluka",
        "farmStreetAddress",
        "farmCity",
        "farmState",
        "farmPincode"
    ];

    fieldIds.forEach((id) => {
        const element = document.getElementById(id);
        if (!element || element.dataset.mapLinked === "true") return;
        element.addEventListener("input", () => {
            if (buildFarmLocationQuery()) renderFarmMapPreview();
        });
        element.dataset.mapLinked = "true";
    });
}

function attachMyFarmActionButtons() {
    const saveButton = document.getElementById("saveFarmButton");
    const viewButton = document.getElementById("viewFarmButton");

    if (saveButton && saveButton.dataset.actionLinked !== "true" && !saveButton.getAttribute("onclick")) {
        saveButton.addEventListener("click", (event) => {
            event.preventDefault();
            saveMyFarmSetup();
        });
        saveButton.dataset.actionLinked = "true";
    }

    if (viewButton && viewButton.dataset.actionLinked !== "true" && !viewButton.getAttribute("onclick")) {
        viewButton.addEventListener("click", (event) => {
            event.preventDefault();
            viewFarmOnMap();
        });
        viewButton.dataset.actionLinked = "true";
    }
}

function showFarmSetupMessage(message, type = "info") {
    const saveMessage = document.getElementById("farmSaveMessage");
    if (!saveMessage) return;

    saveMessage.innerText = message;
    saveMessage.classList.remove("farm-save-message-success", "farm-save-message-error", "farm-save-message-info");
    saveMessage.classList.add(`farm-save-message-${type}`);
}

function getMyFarmFormValues() {
    return {
        crop: document.getElementById("farmCrop")?.value || "",
        land: document.getElementById("farmLand")?.value.trim() || "",
        soil: document.getElementById("farmSoil")?.value || "",
        season: document.getElementById("farmSeason")?.value || "",
        village: document.getElementById("farmVillage")?.value.trim() || "",
        language: document.getElementById("farmLanguage")?.value || "English",
        irrigation: document.getElementById("farmIrrigation")?.value.trim() || "",
        budget: document.getElementById("farmBudget")?.value.trim() || "",
        taluka: document.getElementById("farmTaluka")?.value.trim() || "",
        farmName: document.getElementById("farmName")?.value.trim() || "",
        streetAddress: document.getElementById("farmStreetAddress")?.value.trim() || "",
        city: document.getElementById("farmCity")?.value.trim() || "",
        state: document.getElementById("farmState")?.value.trim() || "",
        pincode: document.getElementById("farmPincode")?.value.trim() || ""
    };
}

function persistMyFarmFormValues(values) {
    if (typeof window.saveAgroFarmSnapshot === "function") {
        window.saveAgroFarmSnapshot(values);
        return;
    }

    const pairs = {
        crop_name: values.crop,
        land_size: values.land,
        soil_type: values.soil,
        season: values.season,
        village: values.village,
        preferred_language: values.language,
        farm_name: values.farmName,
        farm_irrigation: values.irrigation,
        farm_budget: values.budget,
        farm_taluka: values.taluka,
        farm_street_address: values.streetAddress,
        farm_city: values.city,
        farm_state: values.state,
        farm_pincode: values.pincode
    };
    Object.entries(pairs).forEach(([key, value]) => localStorage.setItem(key, value || ""));
}

function refreshMyFarmSavedView(values = getMyFarmFormValues()) {
    const primaryCropBadge = document.getElementById("farmPrimaryCropBadge");
    const landBadge = document.getElementById("farmLandBadge");
    const districtBadge = document.getElementById("farmDistrictBadge");
    const farmProfileBody = document.getElementById("farmProfileBody");
    const status = document.getElementById("farmSetupStatus");

    if (primaryCropBadge) primaryCropBadge.innerText = values.crop || "-";
    if (landBadge) landBadge.innerText = values.land || "-";
    if (districtBadge) districtBadge.innerText = values.city || values.village || "-";

    const profileItems = [
        values.farmName ? `Farm: ${values.farmName}` : null,
        values.crop ? `Primary crop: ${values.crop}` : null,
        values.irrigation ? `Irrigation: ${values.irrigation}` : null,
        values.taluka ? `Taluka: ${values.taluka}` : null,
        values.soil ? `Soil: ${values.soil}` : null,
        values.season ? `Season: ${values.season}` : null,
        values.budget ? `Budget: ${formatShopCurrency(values.budget)}` : null,
        buildFarmLocationQuery() ? `Location: ${buildFarmLocationQuery()}` : null
    ].filter(Boolean);

    if (farmProfileBody) farmProfileBody.innerHTML = createTimelineItems(profileItems, fc("completeFarmSetup"));
    if (status) status.innerText = profileItems.length >= 4 ? fc("complete") : fc("inProgress");
}

function applyFarmSetupToCurrentData(values, remoteFarmProfile = null) {
    if (!latestFarmerPageData) return;

    latestFarmerPageData.profile = {
        ...(latestFarmerPageData.profile || {}),
        crop_name: values.crop,
        land_size: values.land,
        soil_type: values.soil,
        season: values.season,
        state: values.state,
        district: values.city,
        village: values.village,
        preferred_language: values.language
    };

    latestFarmerPageData.farm_profile = {
        ...(latestFarmerPageData.farm_profile || {}),
        ...(remoteFarmProfile || {}),
        farm_name: values.farmName,
        primary_crop: values.crop,
        irrigation_type: values.irrigation,
        taluka: values.taluka,
        pin_code: values.pincode
    };
}

function getCurrentTheme() {
    return localStorage.getItem("theme") || "light";
}

function setTheme(theme) {
    document.body.classList.toggle("dark-mode", theme === "dark");
    localStorage.setItem("theme", theme);
    const themeButton = document.getElementById("themeButton");
    if (themeButton) themeButton.innerText = theme === "dark"
        ? (typeof t === "function" ? t("light") : "Light")
        : (typeof t === "function" ? t("dark") : "Dark");
}

function toggleTheme() {
    setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
}

function updateAuthState() {
    const user = localStorage.getItem("user");
    const authButton = document.getElementById("authButton");
    const welcomeUser = document.getElementById("welcomeUser");
    if (welcomeUser && user) {
        if (typeof window.renderUserWelcome === "function") {
            window.renderUserWelcome(welcomeUser, user);
        } else {
            const firstName = String(user).trim().split(/\s+/)[0] || "Farmer";
            welcomeUser.innerText = `${firstName}'s live farm desk`;
        }
    }
    if (!authButton) return;

    if (user) {
        authButton.innerText = typeof t === "function" ? t("logout") : "Logout";
        authButton.onclick = () => {
            if (typeof window.logout === "function") {
                window.logout();
                return;
            }
            localStorage.removeItem("user");
            localStorage.removeItem("userId");
            window.location.href = "login.html";
        };
    } else {
        authButton.innerText = typeof t === "function" ? t("logout") : "Logout";
        authButton.onclick = () => {
            window.location.href = "login.html";
        };
    }
}

function applySavedLanguage() {
    const preferred = typeof getUILanguage === "function"
        ? getUILanguage()
        : (localStorage.getItem("preferred_language") || "English");
    const uiLanguage = document.getElementById("uiLanguage");
    const answerLanguage = document.getElementById("language");
    if (uiLanguage) uiLanguage.value = preferred;
    if (answerLanguage) answerLanguage.value = preferred;
}

function getLocationLabel() {
    const district = localStorage.getItem("userDistrict") || "Pune";
    const state = localStorage.getItem("userState") || "Maharashtra";
    return `${district}, ${state}`;
}

function setWeatherMonitorStatus(text, active = true) {
    const status = document.getElementById("weatherMonitorStatus");
    const card = document.getElementById("heroWeatherCard");
    if (status) status.innerText = text;
    if (card) card.classList.toggle("weather-monitor-active", active);
}

function formatLiveTemperature(value) {
    const temp = Number(value);
    if (!Number.isFinite(temp)) return "28&deg;C";
    return `${Math.round(temp)}&deg;C`;
}

function describeWeatherCode(code) {
    const numeric = Number(code);
    if ([0].includes(numeric)) return "Clear sky";
    if ([1, 2].includes(numeric)) return "Partly cloudy";
    if ([3].includes(numeric)) return "Cloudy";
    if ([45, 48].includes(numeric)) return "Foggy";
    if ([51, 53, 55, 56, 57].includes(numeric)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numeric)) return "Rain watch";
    if ([71, 73, 75, 77, 85, 86].includes(numeric)) return "Cold precipitation";
    if ([95, 96, 99].includes(numeric)) return "Thunderstorm risk";
    return "Live weather";
}

function buildLiveWeatherAdvice(current = {}) {
    const wind = Number(current.windspeed);
    const humidity = Number(current.relativehumidity_2m);
    const rain = Number(current.precipitation);
    if (Number.isFinite(rain) && rain > 0) return "Rain is active nearby. Delay spraying and protect harvested produce.";
    if (Number.isFinite(wind) && wind > 18) return "Wind is high now. Avoid spray drift and secure light farm materials.";
    if (Number.isFinite(humidity) && humidity > 78) return "Humidity is high. Monitor leaves for fungal pressure before evening.";
    return "Live conditions look suitable for inspection and careful field work.";
}

async function fetchLiveWeatherForCoordinates(latitude, longitude) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current_weather=true&hourly=relative_humidity_2m,precipitation&forecast_days=1&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`live weather failed: ${response.status}`);
    const payload = await response.json();
    const current = payload.current_weather || {};
    const hourly = payload.hourly || {};
    const observedTime = current.time || new Date().toISOString();
    const nearestIndex = Array.isArray(hourly.time)
        ? Math.max(0, hourly.time.findIndex((item) => String(item) >= String(observedTime)))
        : 0;
    const humidityValues = hourly.relative_humidity_2m || hourly.relativehumidity_2m || [];
    const precipitationValues = hourly.precipitation || [];
    const humidity = humidityValues[nearestIndex] ?? humidityValues[0] ?? 0;
    const precipitation = precipitationValues[nearestIndex] ?? precipitationValues[0] ?? 0;
    return {
        temp: formatLiveTemperature(current.temperature),
        condition: describeWeatherCode(current.weathercode),
        advice: buildLiveWeatherAdvice({
            windspeed: current.windspeed,
            relativehumidity_2m: humidity,
            precipitation
        }),
        humidity: `Humidity ${Math.round(Number(humidity) || 0)}%`,
        wind: `Wind ${Math.round(Number(current.windspeed) || 0)} km/h`,
        source: "Live location weather",
        observed_at: observedTime
    };
}

function requestLiveWeatherByLocation() {
    if (document.body.dataset.page !== "home") return;
    if (!("geolocation" in navigator)) {
        setWeatherMonitorStatus("Live monitor uses saved farm location. Browser location is unavailable.", false);
        return;
    }

    setWeatherMonitorStatus("Requesting your location for live farm weather...");
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        localStorage.setItem("farm_lat", String(latitude));
        localStorage.setItem("farm_lng", String(longitude));
        try {
            const liveWeather = await fetchLiveWeatherForCoordinates(latitude, longitude);
            renderWeatherBlock(liveWeather);
            const time = new Date(liveWeather.observed_at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit"
            });
            setWeatherMonitorStatus(`Live from your location | updated ${time}`);
        } catch (error) {
            console.error("live weather location error", error);
            setWeatherMonitorStatus("Live monitor is on, but weather feed could not refresh.", false);
        }
    }, () => {
        setWeatherMonitorStatus("Allow location to show exact real-time farm weather.", false);
    }, {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 10 * 60 * 1000
    });
}

function startLiveWeatherMonitoring() {
    if (document.body.dataset.page !== "home") return;
    if (liveWeatherRefreshTimer) window.clearInterval(liveWeatherRefreshTimer);
    requestLiveWeatherByLocation();
    liveWeatherRefreshTimer = window.setInterval(requestLiveWeatherByLocation, 10 * 60 * 1000);
}

function setHeaderMeta() {
    const locationLabel = getLocationLabel();
    const heroLocation = document.getElementById("heroLocationLabel");
    const weatherLocation = document.getElementById("weatherLocationLabel");
    const liveDate = document.getElementById("liveDateTicker");
    if (heroLocation) heroLocation.innerText = locationLabel;
    if (weatherLocation) weatherLocation.innerText = locationLabel;
    if (liveDate) {
        liveDate.innerText = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }
}

function createTimelineItems(items, emptyText = "No information available yet.") {
    if (!Array.isArray(items) || !items.length) {
        return `<div class="timeline-item"><p>${emptyText}</p></div>`;
    }
    return items.map((item) => {
        if (typeof item === "string") {
            return `<div class="timeline-item"><p>${item}</p></div>`;
        }
        return `<div class="timeline-item"><h4>${item.title || item.name || "Update"}</h4><p>${item.body || item.reason || item.task || item.insight || ""}</p></div>`;
    }).join("");
}

function getTodayActionItems(data) {
    const tasks = [];
    if ((data.live_alerts || []).length) {
        tasks.push(data.live_alerts[0].body || data.live_alerts[0].title);
    }
    tasks.push(fc("reminderWeather"));
    tasks.push(fc("reminderMarket"));
    tasks.push(fc("reminderCrop"));
    return tasks.slice(0, 3);
}

function buildCropCalendar(crop, season) {
    const normalizedCrop = String(crop || "Wheat");
    const normalizedSeason = String(season || "Rabi");
    const lang = typeof getUILanguage === "function" ? getUILanguage() : "English";
    const bodies = {
        English: [
            `${normalizedSeason}: land preparation, seed choice, and input planning.`,
            "Use the first safe weather window for sowing and keep seed spacing uniform.",
            "Track water, nutrient demand, and leaf color changes during active growth.",
            "Inspect the crop twice a week for pests, weeds, and disease spread.",
            "Watch maturity, market movement, and drying/storage readiness before harvest."
        ],
        Hindi: [
            `${normalizedSeason}: खेत की तैयारी, बीज चयन और इनपुट योजना बनाइए।`,
            "पहले सुरक्षित मौसम विंडो में बुवाई करें और बीज दूरी समान रखें।",
            "विकास अवस्था में पानी, पोषण और पत्तियों के रंग पर नज़र रखें।",
            "कीट, खरपतवार और रोग फैलाव के लिए सप्ताह में दो बार निरीक्षण करें।",
            "कटाई से पहले पकाव, बाज़ार और सुखाने/भंडारण की तैयारी देखें।"
        ],
        Marathi: [
            `${normalizedSeason}: जमीन तयारी, बियाणे निवड आणि इनपुट योजना करा.`,
            "सुरक्षित हवामान विंडो मिळताच पेरणी करा आणि अंतर समान ठेवा.",
            "वाढीच्या टप्प्यात पाणी, पोषण आणि पानांच्या रंगावर लक्ष ठेवा.",
            "आठवड्यातून दोनदा कीड, तण आणि रोगासाठी तपासणी करा.",
            "कापणीपूर्वी पक्वता, बाजार आणि वाळवण/साठवण तयारी पाहा."
        ]
    };
    const selectedBodies = bodies[lang] || bodies.English;
    return [
        { title: `${fc("stagePrep")} - ${normalizedCrop}`, body: selectedBodies[0] },
        { title: fc("stageSowing"), body: selectedBodies[1] },
        { title: fc("stageGrowth"), body: selectedBodies[2] },
        { title: fc("stageProtection"), body: selectedBodies[3] },
        { title: fc("stageHarvest"), body: selectedBodies[4] }
    ];
}

function buildReminderItems(data) {
    const reminders = [fc("reminderWeather"), fc("reminderCrop"), fc("reminderMarket")];
    if (data.weather?.condition) {
        reminders.unshift(`${data.weather.condition}: ${data.weather.advice || fc("weatherGuidance")}`);
    }
    return reminders.slice(0, 4);
}

function buildMarketTrend(data) {
    const markets = data.markets || [];
    const top = markets[0];
    if (!top) {
        return {
            label: fc("trendFlat"),
            series: [62, 64, 63, 65, 64, 64, 65],
            suggestion: fc("sellMixed"),
            note: fc("predictionSoon")
        };
    }

    const numericPrice = Number(String(top.price || "").replace(/[^\d]/g, "")) || 2400;
    const trendUp = /up|positive|stable|steady/i.test(top.trend || "");
    const series = trendUp
        ? [0.94, 0.95, 0.97, 0.99, 1.0, 1.03, 1.04].map((item) => Math.round((numericPrice / 100) * item))
        : [1.04, 1.02, 1.0, 0.99, 0.98, 0.97, 0.96].map((item) => Math.round((numericPrice / 100) * item));
    const weatherRisk = /rain|humid/i.test(data.weather?.condition || "");
    return {
        label: trendUp ? fc("trendUp") : fc("trendDown"),
        series,
        suggestion: trendUp && !weatherRisk ? fc("sellNow") : weatherRisk ? fc("sellMixed") : fc("sellWait"),
        note: top.trend
    };
}

function buildSchemeEligibility(profile) {
    const items = [];
    if (profile.crop_name) items.push(`PM-KISAN: ${fc("eligible")}`);
    if (profile.land_size) items.push(`Kisan Credit Card: ${fc("eligible")}`);
    if (profile.crop_name && profile.season) items.push(`PM Fasal Bima Yojana: ${fc("eligible")}`);
    if (!items.length) items.push(fc("notEnoughProfile"));
    return items;
}

function buildDocumentChecklist() {
    return [fc("docAadhaar"), fc("docBank"), fc("docLand"), fc("docMobile"), fc("docCrop")];
}

function buildDashboardFallback() {
    const savedFarm = typeof window.getAgroFarmSnapshot === "function" ? window.getAgroFarmSnapshot() : {};
    return {
        weather: { temp: "28&deg;C", condition: "Partly sunny", advice: "Good conditions for normal field work in the first half of the day.", humidity: "Humidity 68%", wind: "Wind 10 km/h" },
        markets: [
            { crop: savedFarm.crop || "Wheat", price: "Rs 2425", trend: "Stable arrivals and steady buyer interest" },
            { crop: "Paddy", price: "Rs 2180", trend: "Moisture quality affecting premium lots" },
            { crop: "Cotton", price: "Rs 6940", trend: "Mild upside support from mill demand" }
        ],
        daily_briefing: {
            headline: "Today, focus on field inspection, weather timing, and mandi movement.",
            top_tasks: ["Check leaves for early pest signals before irrigation.", "Use the chatbot for crop-specific questions before spending on input."]
        },
        farm_plan: { title: "This week's planner", tasks: [{ stage: "Field", task: "Inspect crop health and remove damaged foliage." }, { stage: "Water", task: "Align irrigation with weather outlook." }] },
        scheme_matches: [{ name: "PM-KISAN", reason: "Income support often relevant for active farmers." }],
        market_prediction: { sell_window: "Watch the next 3-5 days", trend: "Stable to slightly positive", insight: "Keep watching local mandi rates before making a bulk sale." },
        pest_risk: { risk: "Medium", likely_issue: "Leaf spot monitoring", reason: "Humidity and local conditions can trigger spread if ignored." },
        chat_memory: { summary: "Building your farm memory", preferences: ["Language and crop choices will appear here as you use the app."] },
        map_context: { title: "Nearby agri context", nearby_layers: ["Mandis, fertilizer shops, and farm support points can be explored here."] },
        live_alerts: [{ title: "Weather signal", body: "Watch for afternoon wind before spraying." }],
        farm_profile: {
            farm_name: savedFarm.farmName || localStorage.getItem("farm_name") || "",
            primary_crop: savedFarm.crop || localStorage.getItem("crop_name") || "Wheat",
            irrigation_type: savedFarm.irrigation || localStorage.getItem("farm_irrigation") || "",
            livestock: savedFarm.livestock || localStorage.getItem("farm_livestock") || "",
            taluka: savedFarm.taluka || localStorage.getItem("farm_taluka") || "",
            pin_code: savedFarm.pincode || localStorage.getItem("farm_pincode") || ""
        }
    };
}

async function fetchDashboardOverview() {
    const userId = localStorage.getItem("userId");
    const url = userId ? `${AGRO_API_URL}/dashboard-overview?user_id=${userId}` : `${AGRO_API_URL}/dashboard-overview`;
    const cached = readCachedJson("agroDashboardCache", null);
    const fallback = buildDashboardFallback();

    try {
        const response = await fetch(url);
        if (!response.ok) return cached || fallback;
        const data = await response.json();
        if (typeof window.mergeRemoteAgroProfile === "function") {
            window.mergeRemoteAgroProfile(data);
        }
        remoteFeedStatus = data.data_status || remoteFeedStatus;
        if (remoteFeedStatus) {
            localStorage.setItem("agroLiveFeedStatus", JSON.stringify(remoteFeedStatus));
        }
        localStorage.setItem("agroDashboardCache", JSON.stringify({
            ...data,
            cached_at: new Date().toISOString()
        }));
        return data;
    } catch (error) {
        console.error("dashboard overview error", error);
        return cached || fallback;
    }
}

async function saveMarketAlert() {
    const crop = document.getElementById("marketAlertCrop")?.value || "";
    const targetPrice = document.getElementById("marketAlertPrice")?.value.trim() || "";
    if (!crop || !targetPrice) return;

    const alerts = getMarketAlerts();
    alerts.unshift({
        id: `alert-${Date.now()}`,
        crop,
        targetPrice,
        created_at: new Date().toISOString()
    });
    saveMarketAlerts(alerts.slice(0, 8));
    try {
        await fetchJsonSafe(`${AGRO_API_URL}/market-alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: getCurrentUserId(),
                crop,
                target_price: targetPrice,
                district: localStorage.getItem("userDistrict") || localStorage.getItem("farm_city") || "Pune",
                state: localStorage.getItem("userState") || localStorage.getItem("farm_state") || "Maharashtra",
                channel: "in_app"
            })
        });
        await syncMarketAlertsFromServer();
    } catch (error) {
        console.error("market alert sync error", error);
    }
    renderMarketAlertBoard();
}

function renderMarketAlertBoard() {
    const host = document.getElementById("marketAlertList");
    if (!host) return;

    const alerts = getMarketAlerts();
    const notificationCards = remoteMarketNotifications.map((item) => `
        <div class="timeline-item">
            <h4>${sanitizeText(item.title || "Market alert")}</h4>
            <p>${sanitizeText(item.body || "")}</p>
        </div>
    `).join("");
    host.innerHTML = (alerts.length || notificationCards) ? `
        ${notificationCards}
        ${alerts.map((item) => `
        <div class="timeline-item">
            <h4>${sanitizeText(item.crop)} alert</h4>
            <p>Target: ${sanitizeText(item.targetPrice || item.price)} / qtl</p>
            <p>${item.remote ? "Saved on shared backend alerts." : "Saved locally for mandi watch and sell timing."}</p>
        </div>
    `).join("")}
    ` : `<div class="timeline-item"><p>No mandi alerts yet. Save a crop and target price to track it.</p></div>`;
}

function renderOfflineStatusBoard() {
    const host = document.getElementById("offlineStatusBoard");
    if (!host) return;

    const dashboardCache = readCachedJson("agroDashboardCache", null);
    const productCache = getShopProductCache();
    const liveStatus = remoteFeedStatus || readCachedJson("agroLiveFeedStatus", null);
    host.innerHTML = [
        `Farm profile cache: ${localStorage.getItem("crop_name") ? "Ready" : "Needs setup"}`,
        `Dashboard cache: ${dashboardCache?.cached_at ? new Date(dashboardCache.cached_at).toLocaleString() : "No cached sync yet"}`,
        `Shop cache: ${productCache.length ? `${productCache.length} products saved locally` : "No cached products yet"}`,
        `Live weather feed: ${liveStatus?.weather?.source || "Not synced yet"}`,
        `Live market feed: ${liveStatus?.market?.source || "Not synced yet"}`,
        `Offline action mode: cart, wishlist, compare, alerts, and orders work in local mode`
    ].map((text) => `<div class="timeline-item"><p>${sanitizeText(text)}</p></div>`).join("");
}

async function runCropDoctor() {
    const input = document.getElementById("cropDoctorInput");
    const result = document.getElementById("cropDoctorResult");
    const shopLink = document.getElementById("cropDoctorShopLink");
    const file = input?.files?.[0];
    const profile = getFarmProfileSnapshot();
    const likelyIssue = /spot|leaf|blight/i.test(file?.name || "")
        ? "Leaf spot / fungal pressure"
        : /yellow|chlorosis/i.test(file?.name || "")
            ? "Possible nutrient deficiency"
            : "Early pest or disease signal";
    const recommendations = getRecommendedProducts(profile)
        .filter((item) => ["protection", "nutrition"].includes(item.category))
        .slice(0, 2);

    localStorage.setItem("cropDoctorUsed", "yes");
    let remoteDiagnosis = null;
    if (file) {
        try {
            const formData = new FormData();
            formData.append("file", file);
            remoteDiagnosis = await fetchJsonSafe(`${AGRO_API_URL}/ai/crop-doctor`, {
                method: "POST",
                body: formData
            });
        } catch (error) {
            remoteDiagnosis = null;
        }
    }

    if (result) {
        result.innerHTML = `
            <div class="timeline-item">
                <h4>Crop doctor result</h4>
                <p>${file ? `Image checked: ${sanitizeText(file.name)}` : "No image uploaded, so this is a guided quick check."}</p>
                <p>Likely issue: <strong>${sanitizeText(remoteDiagnosis?.disease || likelyIssue)}</strong></p>
                <p>${sanitizeText(remoteDiagnosis?.next_step_treatment || "Next step: inspect affected leaves, avoid spraying in strong wind, and compare products before buying.")}</p>
            </div>
        `;
    }

    if (shopLink) {
        shopLink.innerHTML = recommendations.map((item) => `
            <div class="timeline-item">
                <h4>${sanitizeText(item.name)}</h4>
                <p>${sanitizeText(item.category)} | ${sanitizeText(formatShopCurrency(item.price))}</p>
                <p><a href="shop.html">Open Smart Shop</a> to review this recommendation.</p>
            </div>
        `).join("");
    }
}

function renderWeatherBlock(weather = {}) {
    const temp = weather.temp || "28&deg;C";
    const condition = weather.condition || "Partly sunny";
    const advice = weather.advice || fc("weatherGuidance");
    const humidity = weather.humidity || "Humidity 68%";
    const wind = weather.wind || "Wind 10 km/h";
    const badge = /rain|humid/i.test(condition) ? fc("rainWatch") : fc("spraySafe");
    const weatherState = /rain|humid/i.test(condition) ? "rain" : /cloud/i.test(condition) ? "cloudy" : "sunny";

    const ids = {
        weatherTemp: temp,
        weatherCondition: condition,
        weatherAdvice: advice,
        weatherHumidity: humidity,
        weatherWind: wind,
        weatherTempCard: temp,
        weatherConditionCard: condition,
        weatherHumidityCard: humidity.replace("Humidity ", ""),
        weatherWindCard: wind.replace("Wind ", "")
    };

    Object.entries(ids).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (!element) return;
        if (String(value).includes("&deg;")) element.innerHTML = value;
        else element.innerText = value;
    });

    const badgeElement = document.getElementById("weatherBadge");
    if (badgeElement) badgeElement.innerText = badge;
    const detailPills = document.querySelectorAll(".weather-detail-pill");
    if (detailPills[0]) detailPills[0].innerText = /rain|storm|thunder/i.test(condition) ? "Best spray window: Wait" : "Best spray window: Morning";
    if (detailPills[1]) detailPills[1].innerText = `Crop risk: ${/rain|humid|storm|thunder/i.test(`${condition} ${advice}`) ? "Watch" : "Low"}`;
    const heroWeatherCard = document.getElementById("heroWeatherCard");
    if (heroWeatherCard) heroWeatherCard.dataset.weatherState = weatherState;
    initWeatherSlideshow();
}

function renderMarketBoard(markets = []) {
    const marketGrid = document.getElementById("marketGrid");
    if (marketGrid) {
        marketGrid.innerHTML = markets.map((item) => `
            <div class="market-row">
                <div><div class="market-crop">${item.crop}</div><div class="market-trend">${item.trend}</div></div>
                <div class="market-price-compact">${item.price}${String(item.price).includes("/qtl") ? "" : "/qtl"}</div>
            </div>
        `).join("") || `<div class="timeline-item"><p>${fc("marketPricesSoon")}</p></div>`;
    }

    const firstCrop = markets[0]?.crop || localStorage.getItem("crop_name") || "Wheat";
    ["topCropValue", "topCropCard", "farmPrimaryCropBadge"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.innerText = firstCrop;
    });
    ["marketMoodValue", "marketMoodCard"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.innerText = markets.length >= 3 ? fc("active") : fc("stable");
    });
}

function renderGamification() {
    const visits = readCachedJson("agroVisitLog", []);
    const today = new Date().toISOString().slice(0, 10);
    const updatedVisits = visits.includes(today) ? visits : [today, ...visits].slice(0, 30);
    localStorage.setItem("agroVisitLog", JSON.stringify(updatedVisits));

    let streak = 0;
    const dateCursor = new Date();
    for (let i = 0; i < 30; i += 1) {
        const key = dateCursor.toISOString().slice(0, 10);
        if (updatedVisits.includes(key)) {
            streak += 1;
            dateCursor.setDate(dateCursor.getDate() - 1);
        } else {
            break;
        }
    }

    const historyCount = typeof window.getPersonalHistory === "function"
        ? window.getPersonalHistory().length
        : 0;
    const percent = Math.min(100, 20 + streak * 16 + Math.min(historyCount, 10) * 4);
    const streakDays = document.getElementById("streakDays");
    const streakRing = document.getElementById("streakRing");
    const streakMessage = document.getElementById("streakMessage");
    const badgeRow = document.getElementById("badgeRow");

    if (streakDays) streakDays.innerText = `${streak}`;
    if (streakRing) streakRing.style.setProperty("--ring-progress", `${percent}%`);
    if (streakMessage) {
        streakMessage.innerText = streak >= 4
            ? fc("strongStreak")
            : fc("buildStreak");
    }

    if (badgeRow) {
        const badges = [
            { label: "Starter", active: historyCount >= 1 },
            { label: "Voice", active: localStorage.getItem("voiceUsed") === "yes" },
            { label: "Crop Doctor", active: localStorage.getItem("cropDoctorUsed") === "yes" },
            { label: "Planner", active: !!localStorage.getItem("crop_name") }
        ];
        badgeRow.innerHTML = badges.map((item) => `<span class="badge-chip ${item.active ? "active" : ""}">${item.label}</span>`).join("");
    }
}

function renderHomePage(data) {
    const profile = getFarmProfileSnapshot();
    const commandCenter = buildFarmCommandCenter(data, profile);
    renderWeatherBlock(data.weather);
    renderMarketBoard(data.markets || []);
    const alertsList = document.getElementById("weatherAlertsList");
    if (alertsList) alertsList.innerHTML = createTimelineItems((data.live_alerts || []).map((item) => `${item.title}: ${item.body}`), fc("noWeatherAlerts"));
    const headline = document.getElementById("briefingHeadline");
    if (headline) headline.innerText = data.daily_briefing?.headline || "Daily AI briefing";
    const briefingTasks = document.getElementById("briefingTasks");
    if (briefingTasks) briefingTasks.innerHTML = createTimelineItems(data.daily_briefing?.top_tasks, fc("todayTasksFallback"));
    const todayActionBody = document.getElementById("todayActionBody");
    if (todayActionBody) todayActionBody.innerHTML = createTimelineItems(getTodayActionItems(data), fc("todayTasksFallback"));
    const voicePromptList = document.getElementById("voicePromptList");
    if (voicePromptList) voicePromptList.innerHTML = createTimelineItems([fc("voicePromptOne"), fc("voicePromptTwo"), fc("voicePromptThree")], fc("voiceHelp"));
    const voiceLeadText = document.getElementById("voiceLeadText");
    if (voiceLeadText) voiceLeadText.innerText = fc("voiceHelp");
    const voiceHeroButton = document.getElementById("voiceHeroButton");
    if (voiceHeroButton) voiceHeroButton.innerText = fc("startVoiceMode");
    const voicePill = document.getElementById("voicePill");
    if (voicePill) voicePill.innerText = fc("voiceReady");
    const farmIdentityList = document.getElementById("farmIdentityList");
    if (farmIdentityList) farmIdentityList.innerHTML = createTimelineItems(commandCenter.identity);
    const todayDecisionBoard = document.getElementById("todayDecisionBoard");
    if (todayDecisionBoard) todayDecisionBoard.innerHTML = createTimelineItems(commandCenter.decisions);
    const commerceStatusBoard = document.getElementById("commerceStatusBoard");
    if (commerceStatusBoard) commerceStatusBoard.innerHTML = createTimelineItems(commandCenter.commerce);
    const farmPlanBoard = document.getElementById("farmPlanBoard");
    if (farmPlanBoard) farmPlanBoard.innerHTML = createTimelineItems(commandCenter.plan);
    const retentionAlertBoard = document.getElementById("retentionAlertBoard");
    if (retentionAlertBoard) retentionAlertBoard.innerHTML = createTimelineItems(commandCenter.retention);
    const heroLocationLabel = document.getElementById("heroLocationLabel");
    if (heroLocationLabel) heroLocationLabel.innerText = profile.village || localStorage.getItem("userDistrict") || "Your farm location";
    if (typeof window.renderGamification === "function") window.renderGamification();
    if (typeof window.renderHistory === "function") window.renderHistory();
}

function fillMyFarmForm(data) {
    const farmProfile = data.farm_profile || {};
    const formValues = {
        farmCrop: localStorage.getItem("crop_name") || farmProfile.primary_crop || "Wheat",
        farmLand: localStorage.getItem("land_size") || "",
        farmSoil: localStorage.getItem("soil_type") || "Loamy",
        farmSeason: localStorage.getItem("season") || "Rabi",
        farmVillage: localStorage.getItem("village") || "",
        farmLanguage: localStorage.getItem("preferred_language") || "English",
        farmIrrigation: localStorage.getItem("farm_irrigation") || farmProfile.irrigation_type || "",
        farmBudget: localStorage.getItem("farm_budget") || "",
        farmTaluka: localStorage.getItem("farm_taluka") || farmProfile.taluka || "",
        farmName: localStorage.getItem("farm_name") || farmProfile.farm_name || "",
        farmStreetAddress: localStorage.getItem("farm_street_address") || "",
        farmCity: localStorage.getItem("farm_city") || localStorage.getItem("userDistrict") || "",
        farmState: localStorage.getItem("farm_state") || localStorage.getItem("userState") || "",
        farmPincode: localStorage.getItem("farm_pincode") || ""
    };

    Object.entries(formValues).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });

    const landBadge = document.getElementById("farmLandBadge");
    const primaryCropBadge = document.getElementById("farmPrimaryCropBadge");
    const districtBadge = document.getElementById("farmDistrictBadge");
    if (primaryCropBadge) primaryCropBadge.innerText = formValues.farmCrop || "-";
    if (landBadge) landBadge.innerText = formValues.farmLand || "-";
    if (districtBadge) districtBadge.innerText = formValues.farmCity || formValues.farmVillage || localStorage.getItem("userDistrict") || "-";
}

function renderMyFarmPage(data) {
    fillMyFarmForm(data);
    attachFarmMapListeners();
    const currentValues = getMyFarmFormValues();
    const farmProfileBody = document.getElementById("farmProfileBody");
    const profileItems = [
        currentValues.farmName ? `Farm: ${currentValues.farmName}` : null,
        currentValues.crop ? `Primary crop: ${currentValues.crop}` : `Primary crop: ${localStorage.getItem("crop_name") || "Wheat"}`,
        currentValues.irrigation ? `Irrigation: ${currentValues.irrigation}` : null,
        currentValues.taluka ? `Taluka: ${currentValues.taluka}` : null,
        currentValues.soil ? `Soil: ${currentValues.soil}` : null,
        currentValues.season ? `Season: ${currentValues.season}` : null,
        currentValues.budget ? `Budget: ${formatShopCurrency(currentValues.budget)}` : null,
        buildFarmLocationQuery() ? `Location: ${buildFarmLocationQuery()}` : null
    ].filter(Boolean);
    if (farmProfileBody) farmProfileBody.innerHTML = createTimelineItems(profileItems, fc("completeFarmSetup"));

    const plannerTitle = document.getElementById("plannerTitle");
    if (plannerTitle) plannerTitle.innerText = data.farm_plan?.title || fc("weekPlanner");
    const plannerTasks = document.getElementById("plannerTasks");
    if (plannerTasks) plannerTasks.innerHTML = (data.farm_plan?.tasks || []).map((item) => `<div class="timeline-item"><h4>${item.stage}</h4><p>${item.task}</p></div>`).join("") || `<div class="timeline-item"><p>${fc("plannerWillAppear")}</p></div>`;
    const schemeMatches = document.getElementById("schemeMatches");
    if (schemeMatches) schemeMatches.innerHTML = (data.scheme_matches || []).map((item) => `<div class="timeline-item"><h4>${item.name}</h4><p>${item.reason}</p></div>`).join("") || `<div class="timeline-item"><p>${fc("relevantSchemes")}</p></div>`;
    const liveAlertsBody = document.getElementById("liveAlertsBody");
    if (liveAlertsBody) liveAlertsBody.innerHTML = createTimelineItems(data.live_alerts, fc("noLiveFieldAlerts"));
    const mapTitle = document.getElementById("mapTitle");
    if (mapTitle) mapTitle.innerText = data.map_context?.title || fc("nearbyContext");
    const mapLayers = document.getElementById("mapLayers");
    if (mapLayers) mapLayers.innerHTML = createTimelineItems(data.map_context?.nearby_layers, fc("nearbyContextSoon"));
    const status = document.getElementById("farmSetupStatus");
    if (status) status.innerText = profileItems.length >= 4 ? fc("complete") : fc("inProgress");
    const cropCalendarList = document.getElementById("cropCalendarList");
    if (cropCalendarList) cropCalendarList.innerHTML = createTimelineItems(buildCropCalendar(localStorage.getItem("crop_name"), localStorage.getItem("season")));
    const reminderList = document.getElementById("reminderList");
    if (reminderList) reminderList.innerHTML = createTimelineItems(buildReminderItems(data));
    renderFarmMapPreview();
}

function renderCropCarePage(data) {
    const pestRiskTitle = document.getElementById("pestRiskTitle");
    if (pestRiskTitle) pestRiskTitle.innerText = `${data.pest_risk?.risk || "Medium"} risk`;
    const pestRiskBody = document.getElementById("pestRiskBody");
    if (pestRiskBody) pestRiskBody.innerHTML = createTimelineItems([{ title: data.pest_risk?.likely_issue || "Crop watch", body: data.pest_risk?.reason || "Risk reasons will appear here." }]);
    const memoryTitle = document.getElementById("memoryTitle");
    if (memoryTitle) memoryTitle.innerText = data.chat_memory?.summary || "Learning";
    const memoryBody = document.getElementById("memoryBody");
    if (memoryBody) memoryBody.innerHTML = createTimelineItems(data.chat_memory?.preferences, fc("useMoreForMemory"));
    const liveAlertsBody = document.getElementById("liveAlertsBody");
    if (liveAlertsBody) liveAlertsBody.innerHTML = createTimelineItems(data.live_alerts, fc("noUrgentAlerts"));
    if (typeof window.runDecisionEngine === "function") window.runDecisionEngine();
    if (typeof window.runCompareDecisions === "function") window.runCompareDecisions();
}

function renderMarketPage(data) {
    renderMarketBoard(data.markets || []);
    const predictionTitle = document.getElementById("marketPredictionTitle");
    if (predictionTitle) predictionTitle.innerText = data.market_prediction?.sell_window || fc("watchThisWeek");
    const predictionBody = document.getElementById("marketPredictionBody");
    if (predictionBody) predictionBody.innerHTML = createTimelineItems([{ title: data.market_prediction?.trend || fc("stable"), body: data.market_prediction?.insight || fc("predictionSoon") }]);
    const alertsList = document.getElementById("weatherAlertsList");
    if (alertsList) alertsList.innerHTML = createTimelineItems((data.live_alerts || []).map((item) => `${item.title}: ${item.body}`), fc("noMarketAlerts"));
    if (typeof populateIndiaLocationSelectors === "function") populateIndiaLocationSelectors("mapState", "mapDistrict");
    if (typeof window.runProfitCalculator === "function") window.runProfitCalculator();
    const marketTrend = buildMarketTrend(data);
    const marketTrendBody = document.getElementById("marketTrendBody");
    const sellDecisionBody = document.getElementById("sellDecisionBody");
    if (marketTrendBody) {
        marketTrendBody.innerHTML = createTimelineItems([
            { title: marketTrend.label, body: `${marketTrend.series.join(" → ")}` },
            { title: fc("marketTrendTitle"), body: marketTrend.note }
        ]);
    }
    if (sellDecisionBody) {
        sellDecisionBody.innerHTML = createTimelineItems([
            { title: marketTrend.suggestion, body: `${marketTrend.label}. ${marketTrend.note}` }
        ]);
    }
    renderShopPreview();
    renderShopCart();
    renderMarketAlertBoard();
    renderOfflineStatusBoard();
}

async function submitProduceListing() {
    const sellerName = document.getElementById("produceSellerName")?.value.trim() || localStorage.getItem("user") || "";
    const sellerPhone = document.getElementById("produceSellerPhone")?.value.trim() || localStorage.getItem("userMobile") || "";
    const sellerLocation = document.getElementById("produceSellerLocation")?.value.trim() || getLocationLabel();
    const cropName = document.getElementById("produceCropName")?.value.trim() || "";
    const category = document.getElementById("produceCategory")?.value || "vegetable";
    const quantity = parseInt(document.getElementById("produceQuantity")?.value || "0", 10);
    const unit = document.getElementById("produceUnit")?.value || "kg";
    const pricePerUnit = document.getElementById("producePrice")?.value.trim() || "";
    const harvestDate = document.getElementById("produceHarvestDate")?.value || "";
    const description = document.getElementById("produceDescription")?.value.trim() || "";
    const imageUrl = document.getElementById("produceImageUrl")?.value.trim() || "";
    const message = document.getElementById("produceSellerMessage");

    if (!sellerName || !cropName || !quantity || !pricePerUnit) {
        if (message) message.innerText = "Add seller name, crop name, quantity, and price to create the listing.";
        return;
    }

    try {
        await fetchJsonSafe(`${AGRO_API_URL}/produce/listings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: getCurrentUserId(),
                seller_name: sellerName,
                seller_phone: sellerPhone,
                seller_location: sellerLocation,
                crop_name: cropName,
                category,
                quantity,
                unit,
                price_per_unit: pricePerUnit,
                harvest_date: harvestDate,
                description,
                image_url: imageUrl
            })
        });
        await loadProduceListings();
        if (message) message.innerText = `${cropName} is now live in the farmer produce market.`;
        ["produceCropName", "produceQuantity", "producePrice", "produceHarvestDate", "produceDescription", "produceImageUrl"].forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.value = "";
        });
        renderProduceMarketplacePage();
    } catch (error) {
        console.error("produce listing error", error);
        if (message) message.innerText = "Could not publish the produce listing right now. Check backend connection and try again.";
    }
}

async function placeProduceOrder() {
    const { items, count, total } = getProduceCartTotals();
    const buyerName = document.getElementById("produceBuyerName")?.value.trim() || localStorage.getItem("user") || "";
    const buyerPhone = document.getElementById("produceBuyerPhone")?.value.trim() || localStorage.getItem("userMobile") || "";
    const buyerAddress = document.getElementById("produceBuyerAddress")?.value.trim() || buildFarmLocationQuery() || "";
    const paymentMethod = document.getElementById("producePaymentMethod")?.value || "COD";
    const message = document.getElementById("produceBuyerMessage");

    if (!count) {
        if (message) message.innerText = "Add produce items to the cart first.";
        return;
    }
    if (!buyerName || !buyerAddress) {
        if (message) message.innerText = "Enter buyer name and delivery address before placing the order.";
        return;
    }

    try {
        for (const item of items) {
            await fetchJsonSafe(`${AGRO_API_URL}/produce/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: getCurrentUserId(),
                    buyer_name: buyerName,
                    buyer_phone: buyerPhone,
                    delivery_address: buyerAddress,
                    payment_method: paymentMethod,
                    listing_code: item.listing_code,
                    quantity: item.qty
                })
            });
        }
        saveProduceCart([]);
        await loadProduceListings();
        if (message) message.innerText = `Produce order placed for ${count} unit(s), estimated total ${formatShopCurrency(total)}.`;
        renderProduceMarketplacePage();
    } catch (error) {
        console.error("produce order error", error);
        if (message) message.innerText = "Could not place the produce order right now.";
    }
}

function renderProduceMarketplacePage() {
    const sellerName = document.getElementById("produceSellerName");
    const sellerPhone = document.getElementById("produceSellerPhone");
    const sellerLocation = document.getElementById("produceSellerLocation");
    if (sellerName && !sellerName.value) sellerName.value = localStorage.getItem("user") || "";
    if (sellerPhone && !sellerPhone.value) sellerPhone.value = localStorage.getItem("userMobile") || "";
    if (sellerLocation && !sellerLocation.value) sellerLocation.value = getLocationLabel();

    const grid = document.getElementById("produceMarketplaceGrid");
    const heroCount = document.getElementById("produceListingCount");
    const liveNote = document.getElementById("produceMarketplaceNote");
    const cartBody = document.getElementById("produceCartBody");
    const cartTotal = document.getElementById("produceCartTotal");
    const cartCount = document.getElementById("produceCartCount");
    const filterCategory = document.getElementById("produceFilterCategory")?.value || "all";
    const search = (document.getElementById("produceSearchInput")?.value || "").trim().toLowerCase();
    const filtered = remoteProduceListings.filter((item) => {
        const categoryMatch = filterCategory === "all" || item.category === filterCategory;
        const searchMatch = !search || `${item.crop_name} ${item.seller_location} ${item.seller_name}`.toLowerCase().includes(search);
        return categoryMatch && searchMatch;
    });

    if (heroCount) heroCount.innerText = `${filtered.length} live farmer listings`;
    if (liveNote) liveNote.innerText = "Listings below are created by farmers from the sell form on this page and can be bought directly.";

    if (grid) {
        grid.innerHTML = filtered.map((item) => `
            <article class="shop-product-card produce-market-card">
                <div class="shop-product-image" style="background-image: linear-gradient(180deg, rgba(15, 33, 18, 0.08), rgba(15, 33, 18, 0.22)), url('${item.image_url || "https://images.pexels.com/photos/1595104/pexels-photo-1595104.jpeg?auto=compress&cs=tinysrgb&w=900"}')"></div>
                <div class="shop-product-head">
                    <div>
                        <span class="shop-category-pill">${sanitizeText(item.category || "produce")}</span>
                        <h4>${sanitizeText(item.crop_name)}</h4>
                    </div>
                </div>
                <p class="shop-product-brand">${sanitizeText(item.seller_name)} | ${sanitizeText(item.seller_location || "Local farm")}</p>
                <p class="shop-product-copy">${sanitizeText(item.description || "Fresh farmer listing ready for direct buying.")}</p>
                <div class="shop-price-stack">
                    <strong>${sanitizeText(formatShopCurrency(Number(item.price_per_unit) || 0))}</strong>
                    <span>per ${sanitizeText(item.unit)}</span>
                </div>
                <div class="shop-product-tags">
                    <span>${sanitizeText(`${item.available_quantity} ${item.unit} available`)}</span>
                    <span>${sanitizeText(item.harvest_date || "Harvest timing not added")}</span>
                </div>
                <div class="shop-seller-row">
                    <span>Farmer contact: <strong>${sanitizeText(item.seller_phone || "Phone on request")}</strong></span>
                </div>
                <div class="section-header shop-card-actions shop-card-actions-tight">
                    <button class="primary-btn" type="button" onclick="addProduceToCart('${item.listing_code}')">Add to produce cart</button>
                    <span class="badge-chip active">${sanitizeText(item.listing_code)}</span>
                </div>
            </article>
        `).join("") || `<div class="timeline-item"><p>No produce listings match this search yet.</p></div>`;
    }

    const { items, count, total } = getProduceCartTotals();
    if (cartCount) cartCount.innerText = `${count} unit${count === 1 ? "" : "s"} selected`;
    if (cartTotal) cartTotal.innerText = formatShopCurrency(total);
    if (cartBody) {
        cartBody.innerHTML = items.map((item) => `
            <div class="shop-cart-item">
                <div>
                    <h4>${sanitizeText(item.crop_name)}</h4>
                    <p>${sanitizeText(item.seller_name)} | ${sanitizeText(item.seller_location || "Local farm")}</p>
                    <p>${sanitizeText(formatShopCurrency(Number(item.price_per_unit) || 0))} per ${sanitizeText(item.unit)}</p>
                </div>
                <div class="shop-cart-actions">
                    <div class="shop-qty-stepper">
                        <button type="button" onclick="updateProduceCartQty('${item.listing_code}', -1)">-</button>
                        <span>${item.qty}</span>
                        <button type="button" onclick="updateProduceCartQty('${item.listing_code}', 1)">+</button>
                    </div>
                    <button class="nav-btn" type="button" onclick="removeProduceCartItem('${item.listing_code}')">Remove</button>
                    <strong>${sanitizeText(formatShopCurrency(item.total))}</strong>
                </div>
            </div>
        `).join("") || `<div class="timeline-item"><p>Your produce cart is empty. Add farmer listings from the marketplace grid.</p></div>`;
    }
}

function renderShopWorkspace() {
    renderShopPage();
}

function renderProduceWorkspace() {
    renderProduceMarketplacePage();
}

function renderCartWorkspace() {
    renderCartPage();
}

function renderCheckoutWorkspace() {
    renderCheckoutPage();
}

async function saveMyFarmSetup() {
    const saveButton = document.getElementById("saveFarmButton");
    const userId = parseInt(localStorage.getItem("userId") || "0", 10);
    const values = getMyFarmFormValues();
    const preferencePayload = {
        user_id: userId,
        crop_name: values.crop,
        land_size: values.land,
        soil_type: values.soil,
        season: values.season,
        state: values.state,
        district: values.city,
        village: values.village,
        preferred_language: values.language
    };

    persistMyFarmFormValues(values);
    applyFarmSetupToCurrentData(values);
    refreshMyFarmSavedView(values);
    renderFarmMapPreview();
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerText = "Saving...";
    }
    showFarmSetupMessage("Saving your farm setup...", "info");

    try {
        if (userId) {
            const preferenceResponse = await fetch(`${AGRO_API_URL}/profile/preferences`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(preferencePayload)
            });
            if (!preferenceResponse.ok) throw new Error(`Preferences save failed: ${preferenceResponse.status}`);

            const farmResponse = await fetch(`${AGRO_API_URL}/farm-profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    farm_name: values.farmName,
                    primary_crop: values.crop,
                    irrigation_type: values.irrigation,
                    taluka: values.taluka,
                    pin_code: values.pincode
                })
            });
            if (!farmResponse.ok) throw new Error(`Farm profile save failed: ${farmResponse.status}`);

            const farmPayload = await farmResponse.json();
            if (!farmPayload.farm_profile) {
                throw new Error(farmPayload.message || "Farm profile was not returned by the backend");
            }

            applyFarmSetupToCurrentData(values, farmPayload.farm_profile);
            if (typeof window.mergeRemoteAgroProfile === "function") {
                window.mergeRemoteAgroProfile({ profile: preferencePayload, farm_profile: farmPayload.farm_profile });
            }
            await syncLiveFeeds(true);
            await loadFeedStatus();
            showFarmSetupMessage("Farm setup saved. Your website suggestions now use this farm.", "success");
        } else {
            showFarmSetupMessage("Farm setup saved on this browser. Log in to sync it with the backend.", "success");
        }
    } catch (error) {
        console.error("save farm setup error", error);
        showFarmSetupMessage(`${fc("saveFarmSuccess")} ${fc("saveFarmFallback")}`, "success");
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerText = "Saved";
            window.setTimeout(() => {
                saveButton.innerText = typeof t === "function" ? t("saveMyFarmSetup") : "Save My Farm Setup";
            }, 1800);
        }
    }
}

function viewFarmOnMap() {
    const viewButton = document.getElementById("viewFarmButton");
    const values = getMyFarmFormValues();
    persistMyFarmFormValues(values);
    applyFarmSetupToCurrentData(values);
    refreshMyFarmSavedView(values);
    renderFarmMapPreview();
    if (viewButton) {
        viewButton.innerText = "Map Updated";
        window.setTimeout(() => {
            viewButton.innerText = "View Your Farm";
        }, 1800);
    }
    document.querySelector(".farm-map-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showFarmSetupMessage(
        buildFarmLocationQuery()
            ? "Farm map preview updated below. Your address has also been saved locally."
            : "Please enter at least your farm address, village, city, taluka, or state to view the map.",
        buildFarmLocationQuery() ? "success" : "error"
    );
}

async function initFarmerPage() {
    try {
        if (typeof initI18n === "function") initI18n();
    } catch (error) {
        console.error("i18n init error", error);
    }

    try {
        setTheme(getCurrentTheme());
    } catch (error) {
        console.error("theme init error", error);
    }

    try {
        applySavedLanguage();
    } catch (error) {
        console.error("language init error", error);
    }

    try {
        updateAuthState();
    } catch (error) {
        console.error("auth init error", error);
    }

    try {
        setHeaderMeta();
    } catch (error) {
        console.error("header init error", error);
    }

    try {
        attachMyFarmActionButtons();
        latestFarmerPageData = readCachedJson("agroDashboardCache", null) || buildDashboardFallback();
        rerenderCurrentPage();
    } catch (error) {
        console.error("local page init error", error);
    }

    Promise.allSettled([
            syncLiveFeeds(false),
            loadFeedStatus(),
            loadRemoteInventory(),
            loadRemoteOrders(),
            syncMarketAlertsFromServer(),
            loadProduceListings()
    ]).catch((error) => {
        console.error("live sync init error", error);
    });

    try {
        if (["shop", "cart", "checkout", "sell-produce"].includes(document.body.dataset.page)) {
            if (document.body.dataset.page === "shop") renderShopWorkspace();
            if (document.body.dataset.page === "cart") renderCartWorkspace();
            if (document.body.dataset.page === "checkout") renderCheckoutWorkspace();
            if (document.body.dataset.page === "sell-produce") renderProduceWorkspace();
        }
    } catch (error) {
        console.error("initial workspace render error", error);
    }

    fetchDashboardOverview().then((data) => {
        latestFarmerPageData = data;
        rerenderCurrentPage();
        startLiveWeatherMonitoring();
    }).catch((error) => {
        console.error("dashboard init error", error);
        startLiveWeatherMonitoring();
    });
}

function rerenderCurrentPage() {
    if (!latestFarmerPageData) return;
    const page = document.body.dataset.page;
    if (page === "home") renderHomePage(latestFarmerPageData);
    if (page === "my-farm") renderMyFarmPage(latestFarmerPageData);
    if (page === "crop-care") renderCropCarePage(latestFarmerPageData);
    if (page === "market") renderMarketPage(latestFarmerPageData);
    if (page === "sell-produce") renderProduceWorkspace();
    if (page === "shop") renderShopWorkspace();
    if (page === "cart") renderCartWorkspace();
    if (page === "checkout") renderCheckoutWorkspace();
}

window.toggleTheme = toggleTheme;
window.setTheme = setTheme;
window.saveMyFarmSetup = saveMyFarmSetup;
window.viewFarmOnMap = viewFarmOnMap;
window.addToShopCart = addToShopCart;
window.addRecommendedBundle = addRecommendedBundle;
window.updateShopCartQty = updateShopCartQty;
window.removeFromShopCart = removeFromShopCart;
window.clearShopCart = clearShopCart;
window.openShopProductModal = openShopProductModal;
window.closeShopProductModal = closeShopProductModal;
window.simulateShopCheckout = simulateShopCheckout;
window.filterShopProducts = filterShopProducts;
window.clearShopFilters = clearShopFilters;
window.selectShopCategory = selectShopCategory;
window.goToShopPage = goToShopPage;
window.toggleShopWishlist = toggleShopWishlist;
window.toggleShopCompare = toggleShopCompare;
window.removeFromWishlist = removeFromWishlist;
window.removeFromCompare = removeFromCompare;
window.setExperienceLanguage = setExperienceLanguage;
window.launchVoiceWorkflow = launchVoiceWorkflow;
window.selectPaymentMethod = selectPaymentMethod;
window.saveCheckoutDraft = saveCheckoutDraft;
window.placeShopOrder = placeShopOrder;
window.saveMarketAlert = saveMarketAlert;
window.renderProduceWorkspace = renderProduceWorkspace;
window.submitProduceListing = submitProduceListing;
window.addProduceToCart = addProduceToCart;
window.updateProduceCartQty = updateProduceCartQty;
window.removeProduceCartItem = removeProduceCartItem;
window.clearProduceCart = clearProduceCart;
window.placeProduceOrder = placeProduceOrder;
window.runCropDoctor = runCropDoctor;
window.renderGamification = renderGamification;
window.fc = fc;

document.addEventListener("DOMContentLoaded", initFarmerPage);
window.addEventListener("ui-language-changed", () => {
    setTheme(getCurrentTheme());
    updateAuthState();
    setHeaderMeta();
    rerenderCurrentPage();
});
