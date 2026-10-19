"""Offline search vocabulary, not an answer or a general-purpose translator.

Original questions remain intact for answerability decisions. These audited
aliases only bridge agricultural search terms to English indexed GR text.
"""
import re
import unicodedata

CONCEPTS = {
    'organic farming': ('सेंद्रिय', 'सेंद्रीय', 'जैविक', 'સેન્દ્રિય', 'સેંદ્રિય', 'સજીવ', 'જૈવિક'),
    'natural farming': ('नैसर्गिक', 'प्राकृतिक', 'કુદરતી', 'પ્રાકૃતિક'),
    'micro irrigation': ('सूक्ष्म सिंचन', 'सूक्ष्मसिंचन', 'सूक्ष्म सिंचाई', 'સૂક્ષ્મ સિંચાઈ'),
    'drip irrigation': ('ठिबक', 'टपक', 'ટપક'),
    'irrigation': ('सिंचन', 'सिंचाई', 'સિંચાઈ', 'સિંચાઇ'),
    'crop insurance': ('पीक विमा', 'पीकविमा', 'फसल बीमा', 'पिक विमा', 'પાક વીમા', 'પાકવીમા'),
    'soil health': ('मृदा आरोग्य', 'मृदा स्वास्थ्य', 'जमीन स्वास्थ्य', 'जमिनीचे आरोग्य', 'જમીન આરોગ્ય'),
    'soil': ('माती', 'मातीचे', 'मिट्टी', 'मृदा', 'માટી', 'મૃદા'),
    'seed': ('बियाण', 'बीज', 'બિયારણ', 'બીજ'),
    'fertilizer': ('खत', 'खते', 'खतांचा', 'उर्वरक', 'खाद', 'ખાતર'),
    'pesticide': ('कीटकनाशक', 'कीटनाशक', 'જંતુનાશક'),
    'pest disease': ('कीड', 'रोग', 'कीट', 'જીવાત', 'રોગ'),
    'cotton': ('कापूस', 'कपास', 'કપાસ'),
    'soybean': ('सोयाबीन', 'સોયાબીન'),
    'wheat': ('गहू', 'गेहूं', 'गेहूँ', 'ઘઉં'),
    'rice': ('तांदूळ', 'भात', 'धान', 'चावल', 'ચોખા', 'ડાંગર'),
    'sugarcane': ('ऊस', 'गन्ना', 'શેરડી'),
    'onion': ('कांदा', 'प्याज', 'ડુંગળી'),
    'fodder': ('चारा', 'ચારો', 'ઘાસચારો'),
    'livestock': ('पशुधन', 'पशुपालन', 'पशुसंवर्धन', 'પશુપાલન', 'પશુધન'),
    'horticulture orchard': ('फलोत्पादन', 'फळबाग', 'बागवानी', 'બાગાયત', 'ફળબાગ'),
    'mechanization machinery': ('यांत्रिकीकरण', 'मशीनीकरण', 'यंत्र', 'યાંત્રિકીકરણ', 'યંત્ર'),
    'group farming': ('गट शेती', 'सामूहिक खेती', 'સમૂહ ખેતી'),
    'scheme': ('योजना', 'યોજના'),
    'farmer': ('शेतकरी', 'शेतकऱ', 'किसान', 'ખેડૂત'),
    'farming': ('शेती', 'खेती', 'કૃષિ', 'ખેતી'),
    'subsidy support': ('अनुदान', 'सब्सिडी', 'सहायता', 'सहाय्य', 'સહાય', 'સબસિડી'),
    'eligibility conditions': ('पात्रता', 'पात्र', 'शर्त', 'अटी', 'પાત્રતા', 'શરત'),
    'dose amount': ('मात्रा', 'डोस', 'कितना', 'किती', 'કેટલ', 'માત્રા'),
    'apply procedure': ('अर्ज', 'आवेदन', 'अर्जप्रक्रिया', 'અરજી'),
    'documents required': ('कागदपत्र', 'दस्तावेज', 'દસ્તાવેજ'),
    'region': ('प्रदेश', 'भाग', 'क्षेत्र', 'વિસ્તાર', 'પ્રદેશ'),
    'Maharashtra': ('महाराष्ट्र', 'મહારાષ્ટ્ર'),
    'Gujarat': ('गुजरात', 'ગુજરાત'),
    'Marathwada': ('मराठवाड', 'मराठवाड़', 'મરાઠવાડા'),
    'government resolution GR': ('शासन निर्णय', 'शासकीय निर्णय', 'सरकारी निर्णय', 'शासनादेश', 'ઠરાવ', 'સરકારી ઠરાવ'),
    'latest current': ('आज', 'आजचा', 'सध्या', 'नवीनतम', 'वर्तमान', 'હાલ', 'આજ', 'નવીનતમ'),
}

# Search equivalents only: the original question is always retained for checking
# what the user actually asked. These do not supply any answer facts.
SEARCH_EQUIVALENTS = {
    'tractor': ('tractors', 'ट्रॅक्टर', 'ट्रैक्टर', 'ટ્રેક્ટર'),
    'MahaDBT': ('maha dbt', 'महाडीबीटी', 'महाडीबिटी', 'મહાડીબીટી'),
    'organic farming': ('organic agriculture', 'sendriya sheti', 'jaivik kheti', 'sendriya kheti'),
    'natural farming': ('naisargik sheti', 'prakritik kheti'),
    'crop rotation': ('पीक फेरपालट', 'फसल चक्र', 'પાક ફેરબદલી', 'પાક ફેરવણી'),
    'drip irrigation': ('drip system', 'thibak sinchan', 'tapak sinchai', 'tapak sinchai'),
    'micro irrigation': ('micro-irrigation', 'microirrigation'),
    'subsidy': ('subsidies', 'anudan', 'sabsidi'),
    'required documents': ('paperwork', 'papers needed', 'documents needed', 'कागदपत्रे', 'દસ્તાવેજો'),
    'eligibility': ('eligible', 'qualify', 'who can apply'),
    'soil': ('mati', 'mitti'),
    'fertilizer': ('fertiliser', 'fertilizers', 'fertilisers'),
    'seed': ('seeds',),
}

# Core search terms for Punjabi, Tamil, Telugu, Kannada and Bengali.
_EXTRA = {
 'soil': ('ਮਿੱਟੀ','மண்','నేల','మట్టి','ಮಣ್ಣು','মাটি'),
 'organic farming': ('ਜੈਵਿਕ','இயற்கை விவசாயம்','సేంద్రియ','ಸಾವಯವ','জৈব'),
 'irrigation': ('ਸਿੰਚਾਈ','பாசனம்','నీటిపారుదల','ನೀರಾವರಿ','সেচ'),
 'seed': ('ਬੀਜ','விதை','విత్తనాలు','ಬೀಜ','বীজ'),
 'farmer': ('ਕਿਸਾਨ','விவசாயி','రైతు','ರೈತ','কৃষক'),
 'scheme': ('ਯੋਜਨਾ','திட்டம்','పథకం','ಯೋಜನೆ','প্রকল্প'),
 'fertilizer': ('ਖਾਦ','உரம்','ఎరువులు','ಗೊಬ್ಬರ','সার'),
 'crop insurance': ('ਫਸਲ ਬੀਮਾ','பயிர் காப்பீடு','పంట బీమా','ಬೆಳೆ ವಿಮೆ','ফসল বীমা'),
 'latest current': ('ਅੱਜ','இன்று','నేడు','ಇಂದು','আজ'),
}
for _english, _aliases in _EXTRA.items():
    CONCEPTS[_english] += _aliases


def normalize_digits(text):
    return ''.join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in text)


def alias_present(alias, text):
    text = text.replace('\u200d', '').replace('\u200c', '')
    for match in re.finditer(re.escape(alias), text):
        before = text[match.start()-1] if match.start() else ' '
        after = text[match.end()] if match.end() < len(text) else ' '
        if unicodedata.category(before)[0] in {'L', 'M'}:
            continue
        # Short roots such as खत must not match unrelated words like खतरा.
        if len(alias) <= 4 and unicodedata.category(after)[0] in {'L', 'M'}:
            continue
        return True
    return False


def topic_anchors(question):
    # Broad state/farmer/scheme terms must not make a generic budget paragraph
    # look like evidence for a specific crop, soil or organic-farming question.
    anchors = []
    for english in list(CONCEPTS)[:23]:
        aliases = CONCEPTS[english]
        if any(alias_present(a, question) for a in aliases) or english in question.lower():
            anchors.append((english, aliases))
    return anchors


def has_topic(text, anchors):
    return not anchors or any(english in text.lower() or any(alias_present(a, text) for a in aliases)
                              for english, aliases in anchors)


def search_plan(question):
    original = unicodedata.normalize('NFC', normalize_digits(question or ''))
    indic = bool(re.search(r'[\u0900-\u0dff]', original))
    hints = [english for english, aliases in CONCEPTS.items() if any(alias_present(a, original) for a in aliases)] if indic else []
    equivalents = [english for english, aliases in SEARCH_EQUIVALENTS.items()
                   if any(alias_present(a, original.casefold()) for a in aliases)]
    hints = list(dict.fromkeys(hints + equivalents))
    ascii_text = ' '.join(re.findall(r'[A-Za-z0-9][A-Za-z0-9./%-]*', original))
    semantic = ' '.join([ascii_text, *hints]).strip() if hints else original
    definition = None
    if re.search(r'क्या है|काय आहे|म्हणजे काय|શું છે|એટલે શું|ਕੀ ਹੈ|என்றால் என்ன|అంటే ఏమిటి|ಎಂದರೇನು|কি|কী', original):
        subjects = [h for h in hints if h in {'soil', 'organic farming', 'natural farming', 'irrigation', 'crop insurance'}]
        if len(subjects) == 1:
            definition = subjects[0]
            semantic = 'What is ' + definition + '?'
    return {'original': original, 'semantic': semantic, 'hints': hints,
            'lexical': original + ' ' + ' '.join(hints), 'definition': definition,
            'indic': indic, 'greeting': bool(re.fullmatch(r'\s*(?:नमस्ते|नमस्कार|नमस्कारम्|નમસ્તે|નમસ્કાર)[!.।\s]*', original))}
