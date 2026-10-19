"""Conservative, inspectable farming scope gate; department names are not approval."""
import re

NON_FARMING = re.compile(
    r"\b(?:temporary posts?|appointment|recruitment|retirement|disciplinary|"
    r"service road|crematorium|municipal corporation|staff salaries|pay scale|"
    r"house rent|government employees?|officers?|cadre|printing|mechanized boats|mechanised boats|"
    r"office address|defen[cs]e wall|boundary wall|protection wall|protective wall|capital campus|"
    r"appointed|new posts?|non-teaching staff|service assured|in-service|"
    r"promotion of (?:officers|employees|staff))\b", re.I)
NON_FARMING_CONTEXT = re.compile(
    r"(?:construction.{0,80}(?:office|campus|wall)|(?:lease|transfer).{0,100}(?:land|area)|"
    r"(?:land|area).{0,100}(?:lease|transfer)|"
    r"fishermen.{0,160}(?:arrested|pakistan|marine security)|"
    r"(?:government|subordinate).{0,60}construction|minor repair work|"
    r"(?:college|university).{0,60}(?:construction|admission|tuition|hostel maintenance)|"
    r"(?:construction|admission|tuition).{0,60}(?:college|university)|"
    r"(?:marine fish|fishing nets|project affected fishermen|project-affected fishermen))", re.I)
FARMING = re.compile(
    r"\b(?:farmers?|cultivators?|farming|crop(?:s| insurance| damage)?|sowing|harvest(?:ing)?|"
    r"seeds?|fertili[sz]ers?|pesticides?|insecticides?|horticulture|orchards?|"
    r"irrigation|soil health|soil testing|organic (?:agriculture|cultivation)|"
    r"agricultural (?:mechanization|mechanisation|equipment|machinery|production|marketing)|"
    r"minimum support price|MSP|crop procurement|dairy farming|livestock|aquaculture|"
    r"poultry(?: farming| village)?|fish farmers?|fish farming|fish seeds?|farm produce|farm ponds?|"
    r"fodder|milch (?:cows?|buffaloes)|milk production|milk procurement|milk price|"
    r"animal (?:feed|disease|health)|veterinary (?:services?|treatment|facilities)|"
    r"(?:goat|sheep|pig) (?:rearing|breeding|farming|development)|"
    r"agricultur(?:al|e) (?:mechanization|mechanisation|extension)|"
    r"national agricultur(?:al|e) development (?:scheme|programme|plan)|"
    r"(?:rashtriya|paramparagat) krishi vikas|national mission on (?:oilseeds|edible oils|natural farming)|"
    r"krishi (?:sanjeevani|swavalamban|sinchai|sinchayee)|"
    r"pradhan mantri fasal bima|PoCRA|ATMA|PMFBY|farm landscaping)\b", re.I)
ADMIN_INDIC = re.compile(r"મહેકમ|કચેરીના.*બિલ્ડીંગ|મદદનીશ.*વર્ગ|નિમણૂક|પગાર|नियुक्ती|वेतन|सेवा रस्ता|महानगरपालिका|तात्पुरती पदे")
FARMING_INDIC = re.compile(r"ખેડૂત|ખેતી|ખાતર|સિંચાઈ|ફાર્મીંગ|શાકભાજી|बियाणे|शेतकरी|शेती|पीक|पिके|सिंचन|सेंद्रिय|फळबाग|पशुधन")


def farming_scope(title):
    title = " ".join(str(title or "").split())
    if NON_FARMING.search(title) or NON_FARMING_CONTEXT.search(title) or ADMIN_INDIC.search(title):
        return False, "Administrative, staffing, road or other non-farming subject"
    if FARMING.search(title) or FARMING_INDIC.search(title):
        return True, "Explicit agriculture/farming subject"
    return False, "Farming relevance is uncertain; requires subject review"
