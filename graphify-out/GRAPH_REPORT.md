# Graph Report - Agrogyanchatgpt  (2026-10-17)

## Corpus Check
- 65 files · ~68,095 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 3, .css 2, .bat 2)

## Summary
- 874 nodes · 2006 edges · 73 communities (67 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Script
- Farmer-Pages
- Main / 
-  / Pdf Ingestion
- Main / Models
- Farmer-Pages
- Retriever / Test Rag
- Ui
- Intelligence / 
- Main / 
- Auth
- Farmer-Pages
- Farmer-Pages
- Data Loader / Build Knowledge Base
- Farmer-Pages
- Vector Store / 
- Test Chatbot / Retriever
- Database / 
- Main / Models
- Main / Models
- Test Rag / Vector Store
- Models / Main
- Retriever / 
- Farmer-Pages
- Test Chatbot / 
- Main
- Test Chatbot
- Backend Report / Readme
- Farmer-Pages
- I18N
-  / Main
- Prob Statement 2
- 10
- 5
- Farming Research Units Maharashtra
- 9
- Msp
- Shop-Catalog
- Requirements
- 1
- 2
- 6
- 7
- 8
- Maharashtra Research Units
- Main / 
- Index
- Market
- Shop
- 3
- 4
- Readme
- Punjab
- Checkout
- Community
- Crop-Care
- Login
- My-Farm
- Profile
- Schemes
- Sell-Crops
- Main / 
- Deployment
- Admin
- Cart
- Dashboard
- Instruction To Start
- Render
- Readme
- Gujarat
- Soil Basics
- Requirements-Dev

## God Nodes (most connected - your core abstractions)
1. `initFarmerPage()` - 22 edges
2. `User` - 21 edges
3. `Retriever` - 20 edges
4. `formatShopCurrency()` - 19 edges
5. `VectorStore` - 17 edges
6. `readCachedJson()` - 17 edges
7. `dashboard_overview()` - 16 edges
8. `fc()` - 16 edges
9. `sanitizeText()` - 16 edges
10. `renderShopPage()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `build_admin_analytics()` --uses--> `Post`  [INFERRED]
  agrogyan-gpt-main/backend/main.py → agrogyan-gpt-main/backend/models.py
- `build_admin_analytics()` --uses--> `QueryMemory`  [INFERRED]
  agrogyan-gpt-main/backend/main.py → agrogyan-gpt-main/backend/models.py
- `build_admin_analytics()` --uses--> `User`  [INFERRED]
  agrogyan-gpt-main/backend/main.py → agrogyan-gpt-main/backend/models.py
- `resolve_profile_coordinates()` --uses--> `FarmProfile`  [INFERRED]
  agrogyan-gpt-main/backend/main.py → agrogyan-gpt-main/backend/models.py
- `fetch_live_weather_snapshot()` --uses--> `FarmProfile`  [INFERRED]
  agrogyan-gpt-main/backend/main.py → agrogyan-gpt-main/backend/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Proposed research-document chatbot integration workflow** — agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_collect_official_research_documents, agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_ocr_extraction, agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_english_hindi_marathi_translation, agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_faiss_chroma_or_pinecone_vector_database_proposal, agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_langchain_rag_contextual_answering_proposal, agrogyan_gpt_main_backend_knowledge_imports_farming_units_prob_statement_2_multilingual_chatbot_testing [EXTRACTED 1.00]

## Communities (73 total, 6 thin omitted)

### Community 0 - "Script"
Cohesion: 0.08
Nodes (49): _appendMsg(), askFollowUp(), askQuestion(), _buildBotHtml(), calculateDecisionMetrics(), _chatMessages(), _chatTyping(), clearGoogleMapMarkers() (+41 more)

### Community 1 - "Farmer-Pages"
Cohesion: 0.08
Nodes (41): buildLiveWeatherAdvice(), buildMarketplaceCatalog(), clearShopFilters(), decorateShopProduct(), describeWeatherCode(), fetchLiveWeatherForCoordinates(), filterShopProducts(), formatLiveTemperature() (+33 more)

### Community 2 - "Main / "
Cohesion: 0.09
Nodes (23): CommentCreate, decrement_inventory_for_order(), delete_post(), DemandSignalRequest, edit_post(), explain_simply(), ExplainRequest, FarmProfileRequest (+15 more)

### Community 3 - " / Pdf Ingestion"
Cohesion: 0.14
Nodes (5): load_pdf_documents(), ocr_page(), overlapping_chunks(), main(), IngestionTests

### Community 4 - "Main / Models"
Cohesion: 0.16
Nodes (27): merge_profile(), build_seed_alerts(), build_seed_markets(), build_seed_weather(), dashboard_overview(), ensure_scheme_snapshots(), ensure_seed_operating_data(), get_farm_profile() (+19 more)

### Community 5 - "Farmer-Pages"
Cohesion: 0.15
Nodes (27): addProduceToCart(), clearProduceCart(), fetchJsonSafe(), getCurrentUserId(), getLocationLabel(), getMarketAlerts(), getProduceCart(), getProduceCartDetailedItems() (+19 more)

### Community 6 - "Retriever / Test Rag"
Cohesion: 0.18
Nodes (4): RAGRetriever, Retriever, tokenize(), RAGTests

### Community 7 - "Ui"
Cohesion: 0.12
Nodes (17): AGRO_FARM_STORAGE_KEYS, applyAmbientTheme(), escapeAgroText(), getAgroFarmSnapshot(), getDayPhase(), getHeaderSubtitle(), getPageKey(), getSeasonTheme() (+9 more)

### Community 8 - "Intelligence / "
Cohesion: 0.18
Nodes (19): analyze_document_text(), analyze_leaf_image(), build_chat_context(), build_dashboard_payload(), build_market_prices(), build_weather_overview(), community_insights(), daily_briefing() (+11 more)

### Community 9 - "Main / "
Cohesion: 0.22
Nodes (22): add_comment(), ai_daily_briefing(), ai_farm_planner(), ai_loan_insurance_assistant(), ai_map_context(), ai_market_prediction(), ai_pest_risk(), ai_scheme_eligibility() (+14 more)

### Community 10 - "Auth"
Cohesion: 0.24
Nodes (23): clearPendingRegistrationState(), clearRegisterForm(), collectRegistrationPayload(), fillRegistrationForm(), getUserStorageKey(), goToRegisterStep(), hideRegisterModal(), hydrateRecentRegistration() (+15 more)

### Community 11 - "Farmer-Pages"
Cohesion: 0.26
Nodes (22): addRecommendedBundle(), addToShopCart(), clearShopCart(), getCartDetailedItems(), getCartTotals(), getShopCart(), getShopCustomerProfile(), getShopOrders() (+14 more)

### Community 12 - "Farmer-Pages"
Cohesion: 0.19
Nodes (22): buildProductDecisionSummary(), buildProductRecommendation(), closeShopProductModal(), formatShopCurrency(), getCartQuantityForProduct(), getFarmProfileSnapshot(), getFilteredShopProducts(), getProductSkipRisk() (+14 more)

### Community 13 - "Data Loader / Build Knowledge Base"
Cohesion: 0.23
Nodes (13): build_html_page(), main(), normalize_text(), pdf_to_text(), text_to_sections(), chunk_text(), extract_html_sections(), load_corpus() (+5 more)

### Community 14 - "Farmer-Pages"
Cohesion: 0.18
Nodes (19): applyFarmSetupToCurrentData(), attachFarmMapListeners(), attachMyFarmActionButtons(), buildCropCalendar(), buildFarmLocationQuery(), buildReminderItems(), fillMyFarmForm(), formatFarmBoundaryText() (+11 more)

### Community 17 - "Database / "
Cohesion: 0.12
Nodes (6): check_database(), ensure_legacy_columns(), get_session(), _sqlite_pragmas(), health_check(), translation_status()

### Community 18 - "Main / Models"
Cohesion: 0.17
Nodes (15): ai_chat_memory(), ensure_inventory_seed(), get_admin_analytics(), get_comments(), get_commerce_overview(), get_platform_modules(), get_question_feed(), get_shop_inventory() (+7 more)

### Community 19 - "Main / Models"
Cohesion: 0.23
Nodes (15): coerce_price_number(), create_produce_order(), create_shop_order(), fetch_json(), fetch_live_market_prices(), fetch_live_weather_snapshot(), list_shop_orders(), normalize_market_rows() (+7 more)

### Community 20 - "Test Rag / Vector Store"
Cohesion: 0.21
Nodes (3): VectorStore, FakeEmbeddings, VectorTests

### Community 21 - "Models / Main"
Cohesion: 0.23
Nodes (12): create_market_alert(), create_market_alert_notifications(), ensure_produce_listing_seed(), list_farmer_produce_listings(), list_market_alerts(), AlertRecord, DemandSignal, FarmerProduceListing (+4 more)

### Community 22 - "Retriever / "
Cohesion: 0.19
Nodes (4): _clean(), _is_clean_sentence(), OllamaClient, sentence_split()

### Community 23 - "Farmer-Pages"
Cohesion: 0.22
Nodes (15): buildDocumentChecklist(), buildFarmCommandCenter(), buildMarketTrend(), buildSchemeEligibility(), createTimelineItems(), fc(), getStoredFarmBudget(), getTodayActionItems() (+7 more)

### Community 25 - "Main"
Cohesion: 0.23
Nodes (13): build_otp_message(), generate_otp(), hash_otp(), normalize_email(), normalize_indian_phone_number(), OtpSendRequest, OtpVerifyRequest, phone_lookup_values() (+5 more)

### Community 27 - "Backend Report / Readme"
Cohesion: 0.18
Nodes (11): EmbeddingGemma, Evidence quote validation, Gujarati generation timeout, Hybrid semantic and BM25 retrieval, PDF retrieval and LLM pipeline, Persistent SQLite vector store, Qwen3 1.7B, Local PDF retrieval application (+3 more)

### Community 28 - "Farmer-Pages"
Cohesion: 0.27
Nodes (11): applySavedLanguage(), buildDashboardFallback(), fetchDashboardOverview(), getCurrentTheme(), initFarmerPage(), renderCartWorkspace(), renderCheckoutWorkspace(), renderProduceWorkspace() (+3 more)

### Community 29 - "I18N"
Cohesion: 0.33
Nodes (10): applyExactTextTranslations(), applyTranslations(), EXACT_TEXT_TRANSLATIONS, EXTRA_UI_TRANSLATIONS, getUILanguage(), initI18n(), registerTranslations(), setUILanguage() (+2 more)

### Community 30 - " / Main"
Cohesion: 0.24
Nodes (4): database_error_handler(), log_requests(), unhandled_error_handler(), validation_error_handler()

### Community 31 - "Prob Statement 2"
Cohesion: 0.22
Nodes (9): Collect official research documents, Cotton and Konkan research notes and proposed chatbot workflow, DBSKKV Konkan rice research, English Hindi Marathi translation, FAISS Chroma or Pinecone vector database proposal, ICAR CIRCOT Mumbai, LangChain RAG contextual answering proposal, Multilingual chatbot testing (+1 more)

### Community 32 - "10"
Cohesion: 0.22
Nodes (9): Assistant Director agriculture posts at three soil laboratories, Chhota Udepur, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Laboratory staffing creation, OCR ambiguity in numeric metadata, Soil Health Card programme, Surendranagar (+1 more)

### Community 33 - "5"
Cohesion: 0.22
Nodes (9): Fermented Organic Manure, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Gujarat Organic Farming Policy 2015, i-Khedut application and claim verification, Liquid Fermented Organic Manure, OCR ambiguity in numeric metadata, Organic farming promotion assistance (+1 more)

### Community 34 - "Farming Research Units Maharashtra"
Cohesion: 0.29
Nodes (7): DBSKKV Dapoli, ICAR Central Citrus Research Institute Nagpur, Maharashtra farming research unit source-discovery project notes, Multilingual RAG source discovery, Nimbkar Agricultural Research Institute Phaltan, PDKV Akola, VNMKV Parbhani

### Community 35 - "9"
Cohesion: 0.29
Nodes (7): Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Junagadh chemical fertilizer testing laboratory, Laboratory building renovation, OCR ambiguity in numeric metadata, Printed page 5 missing from local PDF, Renovation of Junagadh chemical fertilizer testing laboratory building

### Community 36 - "Msp"
Cohesion: 0.29
Nodes (7): Agricultural Mechanization 2022 guidelines title, Paddy ban and DSR incentive news summaries, Punjab acts and orders index, Punjab agricultural acts services and GR summary compilation, Punjab agriculture departmental services directory, Punjab Department of Agriculture website reference, Punjab Preservation of Subsoil Water Act 2009 title

### Community 37 - "Shop-Catalog"
Cohesion: 0.38
Nodes (4): initShopFallbackCatalog(), renderProducts(), renderRecommendations(), renderStats()

### Community 38 - "Requirements"
Cohesion: 0.29
Nodes (7): deep-translator, FastAPI, PyMuPDF, pypdf, pytesseract, Runtime dependency specification, SQLAlchemy

### Community 39 - "1"
Cohesion: 0.33
Nodes (6): Bio-fertilizer and organic fertilizer quality-control laboratory staffing continuation, Bio-fertilizer quality control, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Laboratory staffing continuation, Organic fertilizer quality control

### Community 40 - "2"
Cohesion: 0.33
Nodes (6): Borsad, Borsad and Sabarmati soil-testing laboratory staffing continuation, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Sabarmati, Soil testing laboratories

### Community 41 - "6"
Cohesion: 0.33
Nodes (6): Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, HPLC equipment, Kjeldahl distillation unit, Nadiad fertilizer testing laboratory, New equipment purchase for Nadiad fertilizer testing laboratory

### Community 42 - "7"
Cohesion: 0.33
Nodes (6): Bank payment of assistance, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, i-Khedut application and claim verification, Incentive scheme for adoption of smart and precision farming, Smart and precision farming

### Community 43 - "8"
Cohesion: 0.33
Nodes (6): Chhota Udepur soil testing laboratory, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Laboratory construction, New building for Chhota Udepur soil testing laboratory, Soil Health Card programme

### Community 44 - "Maharashtra Research Units"
Cohesion: 0.33
Nodes (6): CIRCOT Mumbai, DBSKKV Dapoli, Maharashtra farming research units, PDKV Akola, Project integration notes, VNMKV Parbhani

### Community 45 - "Main / "
Cohesion: 0.53
Nodes (5): build_admin_analytics(), extract_crop_mentions(), get_timeframe_start(), is_recent(), now_utc()

### Community 46 - "Index"
Cohesion: 0.33
Nodes (6): Agricultural chatbot, District weather, Farmer profile personalization, Home farming dashboard, Mandi price board, Voice input

### Community 47 - "Market"
Cohesion: 0.33
Nodes (6): Local price alerts, Mandi prices, Market Desk, Nearby agriculture ecosystem, Profit calculator, Sell timing prediction

### Community 48 - "Shop"
Cohesion: 0.33
Nodes (6): Farm input catalog, Farm kit, Inline cart, Product comparison, Smart Farm Shop, Wishlist

### Community 49 - "3"
Cohesion: 0.40
Nodes (5): Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department, Organic Cell, Organic Cell regular and outsourced staffing continuation, Regular and outsourced staffing

### Community 50 - "4"
Cohesion: 0.40
Nodes (5): AGR-35 agricultural development and Dang training-and-visit staffing continuation, Agricultural development administration, Dang training and visit scheme, Financial year 2025-26, Gujarat Agriculture Farmers Welfare and Cooperation Department

### Community 51 - "Readme"
Cohesion: 0.40
Nodes (5): Fingerprint-based embedding reuse, Knowledge base ingestion, OCR page cache, PDF page citations, PDF page extraction

### Community 52 - "Punjab"
Cohesion: 0.40
Nodes (5): Agricultural mechanization guidelines, Compiled news citations, Direct Seeding of Rice incentive, Punjab government document directory, Punjab Knowledge Base

### Community 53 - "Checkout"
Cohesion: 0.40
Nodes (5): Card payment selection, Cash on Delivery, Checkout, Locally saved delivery draft, UPI

### Community 54 - "Community"
Cohesion: 0.40
Nodes (5): AI thread summaries, Community posts, Farmer Community, Solved posts, Voice and translation controls

### Community 55 - "Crop-Care"
Cohesion: 0.40
Nodes (5): AI crop doctor, Crop Care, Crop comparison, Crop decision engine, Pest outbreak risk

### Community 56 - "Login"
Cohesion: 0.40
Nodes (5): Login and registration, Preferred language, SMS OTP, Temporary code fallback, WhatsApp OTP

### Community 57 - "My-Farm"
Cohesion: 0.40
Nodes (5): Crop calendar, Estimated farm boundary, Farm operating profile, My Farm, Scheme matching

### Community 58 - "Profile"
Cohesion: 0.40
Nodes (5): Account identity, Farmer Profile, Question history, Saved posts, Saved schemes

### Community 59 - "Schemes"
Cohesion: 0.40
Nodes (5): Document checklist, Eligibility hints, Favorite schemes, Government Schemes, Scheme category filters

### Community 60 - "Sell-Crops"
Cohesion: 0.40
Nodes (5): Buyer cart, Farmer Produce Market, Produce listings, Produce order, Seller contact

### Community 62 - "Deployment"
Cohesion: 0.50
Nodes (4): Render deployment, Same-host FastAPI frontend, SQLite storage, Twilio OTP

### Community 63 - "Admin"
Cohesion: 0.50
Nodes (4): Admin analytics panel, Inventory visibility, Shop order queue, User and question analytics

### Community 64 - "Cart"
Cohesion: 0.50
Nodes (4): Editable quantities, Farm input cart, Order summary, Separate checkout

### Community 65 - "Dashboard"
Cohesion: 0.50
Nodes (4): Dashboard frame, Embedded main application, Login session, Logout control

### Community 66 - "Instruction To Start"
Cohesion: 0.50
Nodes (4): Ollama, Python 3.10+, Tesseract, Windows startup prerequisites

### Community 67 - "Render"
Cohesion: 0.50
Nodes (4): Free Python service, Render web service, Twilio environment variables, Uvicorn start command

### Community 68 - "Readme"
Cohesion: 0.50
Nodes (4): AgroGyanGPT, Farmer community, Multilingual agricultural assistance, OCR query system

### Community 69 - "Gujarat"
Cohesion: 0.67
Nodes (3): Bio-fertilizer and organic fertilizer quality laboratory, Gujarat government agricultural resolutions, Gujarat Knowledge Base

### Community 70 - "Soil Basics"
Cohesion: 0.67
Nodes (3): Soil basics, Soil formation, USDA NRCS educational definition

### Community 71 - "Requirements-Dev"
Cohesion: 0.67
Nodes (3): Development dependency specification, HTTPX 0.28.1, Runtime requirements

## Ambiguous Edges - Review These
- `Assistant Director agriculture posts at three soil laboratories` → `OCR ambiguity in numeric metadata`  [AMBIGUOUS]
  agrogyan-gpt-main/backend/knowledge_imports/GR (guju)/10.pdf · relation: references
- `Organic farming promotion assistance under Gujarat Organic Farming Policy 2015` → `OCR ambiguity in numeric metadata`  [AMBIGUOUS]
  agrogyan-gpt-main/backend/knowledge_imports/GR (guju)/5.pdf · relation: references
- `Renovation of Junagadh chemical fertilizer testing laboratory building` → `OCR ambiguity in numeric metadata`  [AMBIGUOUS]
  agrogyan-gpt-main/backend/knowledge_imports/GR (guju)/9.pdf · relation: references
- `Renovation of Junagadh chemical fertilizer testing laboratory building` → `Printed page 5 missing from local PDF`  [AMBIGUOUS]
  agrogyan-gpt-main/backend/knowledge_imports/GR (guju)/9.pdf · relation: references

## Knowledge Gaps
- **177 isolated node(s):** `Multilingual agricultural assistance`, `Farmer community`, `OCR query system`, `EmbeddingGemma`, `Persistent SQLite vector store` (+172 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 277 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RAGRetriever` connect `Retriever / Test Rag` to `Main / `, ` / Pdf Ingestion`, `Test Rag / Vector Store`, `Vector Store / `?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `User` (e.g. with `add_comment()` and `build_admin_analytics()`) actually correct?**
  _`User` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Multilingual agricultural assistance`, `Farmer community`, `OCR query system` to the rest of the system?**
  _177 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Script` be split into smaller, more focused modules?**
  _Cohesion score 0.08176100628930817 - nodes in this community are weakly interconnected._
- **Why does `Retriever` connect `Retriever / Test Rag` to `Test Chatbot / Retriever`, `Test Chatbot / `, `Retriever / `, `Vector Store / `?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Assistant Director agriculture posts at three soil laboratories` and `OCR ambiguity in numeric metadata`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Organic farming promotion assistance under Gujarat Organic Farming Policy 2015` and `OCR ambiguity in numeric metadata`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._

Audit note: graphify-out/ is generated in the working tree. Agent tool token usage was unavailable; zero token fields are placeholders, not measured usage. PDF nodes use project pypdf/extracted OCR cache because graphify environment lacks its PDF extra.

## Integrity warnings

Raw extraction diagnostics reported 134 dangling-endpoint edges and 60 potential same-endpoint collapses. The graph includes unresolved external/type references and is a navigation aid only. Audit findings were independently checked against source and runtime.
