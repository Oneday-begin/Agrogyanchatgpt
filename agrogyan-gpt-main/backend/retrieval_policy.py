"""Question intent checks and topic matching, independent of model confidence."""
import re

from backend.multilingual import normalize_digits, search_plan
from backend.retriever import Retriever, tokenize

GENERAL = set('scheme schemes gr government resolution resolutions subsidy support required documents '
              'procedure apply application eligibility conditions benefits benefit farmers farmer '
              'agriculture agricultural programme program promote promoting provided provides provide '
              'under about needed papers'.split())


def intent(question):
    plan = search_plan(question)
    text = plan['semantic'].lower()
    if re.search(r'\b(?:documents|paperwork|papers|certificates)\b|कागदपत्र|दस्तावेज|દસ્તાવેજ', question, re.I):
        return 'documents', None
    if re.search(r'\b(?:dose|dosage|how much.*(?:spray|apply))\b|डोस|मात्रा|માત્રા', question, re.I):
        return 'dose', None
    if re.search(r'\b(?:eligib\w*|qualify|who can apply)\b|पात्रता|પાત્રતા', question, re.I):
        return 'eligibility', None
    target = plan['definition'] or Retriever._definition_target(text)
    if target and len(target.split()) <= 5:
        return 'definition', target
    return 'general', None


def answers_intent(text, question):
    kind, target = intent(question)
    if kind == 'definition':
        return bool(re.match(r'\s*(?:(?:a|an|the)\s+)?' + re.escape(target) + r'\s+(?:is|are|means|refers to|stands for)\b', text, re.I))
    if kind == 'documents':
        # Amounts in a tractor subsidy paragraph do not answer a paperwork query.
        return bool(re.search(r'\b(?:documents?|certificates?|aadhaar|aadhar|7/12|8a|land records?|quotation)\b|कागदपत्र|दस्तावेज|દસ્તાવેજ', text, re.I))
    if kind == 'dose':
        return bool(re.search(r'\d[\d.,]*\s*(?:ml|mg|kg|grams?|litres?|liters?|g/l|%)\b', text, re.I))
    if kind == 'eligibility':
        return bool(re.search(r'\beligib\w*|\b(?:must|should) (?:be|have)|\bonly\b.*\bfarmers?\b|पात्र|પાત્ર', text, re.I))
    return True


def subject_terms(question):
    plan = search_plan(question)
    terms = set(tokenize(plan['semantic'])) - GENERAL
    return {t for t in terms if not t.isdecimal() and t not in {'maharashtra', 'gujarat'}}


def topic_coverage(question, document):
    terms = subject_terms(question)
    text = ' '.join(str(document.get(k, '')) for k in ('title', 'content', 'retrieval_aliases'))
    content = set(tokenize(text + ' ' + ' '.join(search_plan(text)['hints'])))
    return len(terms & content) / max(1, len(terms))


def requested_years_match(question, text):
    years = set(re.findall(r'\b(?:19|20)\d{2}\b', normalize_digits(question)))
    return years <= set(re.findall(r'\b(?:19|20)\d{2}\b', normalize_digits(text)))


def policy_request(question):
    return bool(re.search(r'\b(?:gr|resolutions?|schemes?|subsid\w*|eligib\w*)\b', search_plan(question)['semantic'], re.I))


def source_fits_request(question, document):
    # General educational references may explain the concept, but cannot answer
    # what a particular state's scheme or government resolution says.
    if not policy_request(question):
        return True
    if document.get('doc_type') == 'reviewed_reference':
        return 'published application checklist' in document.get('scope', '')
    return document.get('doc_type') != 'state_knowledge'
