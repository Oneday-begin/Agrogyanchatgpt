"""Run with: python -m unittest discover -s tests -v (no live services needed)."""
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

# Integration checks never write to the farmer database.
_database = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_database.name, "test.db")
os.environ["SESSION_DB_PATH"] = os.path.join(_database.name, "sessions.db")
os.environ["RAG_ENABLED"] = "false"  # Unit/API tests must not require live models.

from fastapi.testclient import TestClient
from backend import main
from backend.database import SessionLocal, engine
from backend.models import QueryMemory, User
from backend.retriever import Retriever
from backend.translation import translate_cached


def tearDownModule():
    engine.dispose()
    _database.cleanup()


class NoModelCalls:
    model = "disabled"
    _available = None

    def is_available(self):
        raise AssertionError("Chat must not probe the model")

    def generate_json(self, prompt):
        raise AssertionError("Chat must not generate unsupported claims")


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.docs = [
            {"id": "one", "title": "Wheat guide", "state": "Punjab",
             "content": "Punjab wheat sowing is described for November in this farming guide."},
            {"id": "two", "title": "Cotton guide", "state": "Gujarat",
             "content": "Gujarat cotton harvesting is described for October in this farming guide."},
        ]
        self.r = Retriever(self.docs, NoModelCalls())

    def test_answer_is_source_text_with_matching_citations(self):
        result = self.r.answer("Punjab wheat sowing November")
        self.assertEqual(result["source_type"], "documents")
        self.assertIsNone(result["model"])
        refs = {ref["index"] for ref in result["references"]}
        for item in result["evidence"]:
            self.assertIn(item["text"], self.docs[0]["content"])
            self.assertIn(item["index"], refs)
            self.assertIn(f"[{item['index']}]", result["answer"])

    def test_unsupported_doses_and_numbers_abstain(self):
        for q in ("cotton pesticide dosage", "Punjab wheat sowing November 2099", "quantum computer"):
            with self.subTest(q=q):
                result = self.r.answer(q)
                self.assertEqual(result["source_type"], "none")
                self.assertEqual(result["references"], [])

    def test_wrong_state_is_not_supported(self):
        self.assertEqual(self.r.answer("Gujarat wheat sowing November")["source_type"], "none")
        self.assertEqual(self.r.answer("Bihar wheat sowing November")["source_type"], "none")

    def test_live_information_abstains(self):
        for q in ("latest wheat price", "Punjab wheat sowing today", "current weather"):
            self.assertEqual(self.r.answer(q)["source_type"], "none")

    def test_unrelated_chunks_cannot_pool_query_coverage(self):
        self.assertEqual(self.r.answer("wheat cotton November October")["source_type"], "none")

    def test_cache_is_isolated_bounded_and_thread_safe(self):
        first = self.r.answer("Punjab wheat sowing November")
        first["references"].clear()
        second = self.r.answer("Punjab wheat sowing November")
        self.assertTrue(second["cache_hit"])
        self.assertTrue(second["references"])
        with ThreadPoolExecutor(max_workers=8) as pool:
            answers = list(pool.map(self.r.answer, ["Punjab wheat sowing November"] * 40))
        self.assertTrue(all(a["source_type"] == "documents" for a in answers))
        for i in range(300):
            self.r.answer(f"unknown {i}")
        self.assertLessEqual(len(self.r._cache), 256)

    def test_empty_index_abstains(self):
        self.assertEqual(Retriever([], NoModelCalls()).answer("wheat")["source_type"], "none")

    def test_greeting_is_not_a_failed_document_search(self):
        for greeting in ("hii", "Hi!", "hello", "namaste"):
            with self.subTest(greeting=greeting):
                result = self.r.answer(greeting)
                self.assertEqual(result["source_type"], "conversation")
                self.assertEqual(result["answer_mode"], "conversation")
                self.assertFalse(result["references"])

    def test_ambiguous_land_record_question_asks_for_specifics(self):
        result = self.r.answer("cts no of aarey")
        self.assertEqual(result["source_type"], "clarification")
        self.assertIn("specific plot", result["answer"])
        self.assertIn("Aarey", result["answer"])
        self.assertFalse(result["references"])
        self.assertNotIn("Aarey", self.r.answer("cts no of pune")["answer"])

    def test_definition_question_rejects_incidental_mentions(self):
        r = Retriever([{"title": "University", "content":
                        "VNMKV focuses on crop improvement, soil health management, and sustainable agricultural practices."}], NoModelCalls())
        result = r.answer("what is soil")
        self.assertEqual(result["source_type"], "none")
        self.assertFalse(result["references"])

    def test_real_corpus_soil_definition_and_exclusion_of_project_notes(self):
        soil = main.retriever.answer("what is soil")
        self.assertTrue(soil["answer"].startswith("Soil is"))
        self.assertNotIn("VNMKV", soil["answer"])
        self.assertEqual(soil["references"][0]["source_url"],
                         "https://www.nrcs.usda.gov/resources/education-and-teaching-materials/what-is-soil")
        vnmkv = main.retriever.answer("what is vnmkv")
        # A sourced university reference replaces the excluded project notes.
        self.assertEqual(vnmkv["answer_mode"], "reviewed_reference")
        self.assertEqual(vnmkv["references"][0]["source_url"], "https://www.vnmkv.ac.in/")
        self.assertIn("Vasantrao Naik", vnmkv["answer"])
        self.assertFalse(any(d.get("source_file", "").startswith("farming units/") for d in main.documents))

    def test_overlapping_passages_are_not_repeated(self):
        text = "Wheat sowing needs planning. Punjab wheat sowing is described for November in this farming guide."
        r = Retriever([{"title": "Wheat", "content": text},
                       {"title": "Duplicate", "content": text}], NoModelCalls())
        result = r.answer("wheat sowing")
        evidence = [e["text"] for e in result["evidence"]]
        self.assertTrue(evidence)
        for i, a in enumerate(evidence):
            for b in evidence[i + 1:]:
                self.assertFalse(r._overlaps(a, b))


class ApiTests(unittest.TestCase):
    def setUp(self):
        from backend.security import _limits
        _limits.clear()
        self.client = TestClient(main.app)

    def test_health_and_frontend(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["chatbot_ready"])
        self.assertFalse(health.json()["llm_required"])
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/script.js").status_code, 200)

    def test_degraded_readiness(self):
        with patch.object(main, "check_database", return_value=False):
            self.assertEqual(self.client.get("/health").status_code, 503)
        with patch.object(main, "documents", []):
            self.assertEqual(self.client.get("/health").status_code, 503)
        with patch.object(main.retriever, "enabled", True), \
             patch.object(main.retriever, "status", return_value={"ready": True}), \
             patch.object(main.retriever.llm, "_available", False):
            self.assertEqual(self.client.get("/health").status_code, 200)

    def test_validation(self):
        for payload in ({"question": " "}, {"question": "a" * 2001},
                        {"question": "wheat", "language": "invalid"}):
            self.assertEqual(self.client.post("/ask", json=payload).status_code, 422)
        self.assertEqual(self.client.post("/ask", json={"question": "wheat", "user_id": 999}).status_code, 401)

    def test_anonymous_chat_has_no_invented_farm_profile(self):
        with patch.object(main.retriever, "answer", wraps=main.retriever.answer) as answer:
            response = self.client.post("/ask", json={"question": "latest wheat price"})
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(answer.call_args.args[1])
            self.assertEqual(response.json()["source_type"], "none")

    def test_regional_retrieval_preserves_original_without_external_translation(self):
        with patch.object(main, "translate_cached", return_value="latest wheat price") as translation:
            response = self.client.post("/ask", json={"question": "\u0917\u0947\u0939\u0942\u0902 \u0915\u0940 \u0906\u091c \u0915\u0940 \u0915\u0940\u092e\u0924"})
            self.assertEqual(response.status_code, 200)
            translation.assert_not_called()
            self.assertEqual(response.json()["source_type"], "none")

    def test_failed_translation_is_visible(self):
        with patch.object(main, "translate_cached", side_effect=TimeoutError):
            response = self.client.post("/ask", json={"question": "latest wheat price", "language": "Hindi"})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["warnings"])

    def test_gujarati_source_answer_does_not_require_retranslation(self):
        result={'answer':'ગુજરાતમાં સેન્દ્રિય ખેતી યોજના [1]','confidence':.8,'source_type':'documents',
                'references':[{'index':1,'page':1}],'evidence':[],'warnings':[]}
        with patch.object(main.retriever,'answer',return_value=result), patch.object(main,'translate_cached') as translate:
            response=self.client.post('/ask',json={'question':'સેન્દ્રિય ખેતી યોજના','language':'Gujarati'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['translation_status'],'not_required')
        self.assertFalse(response.json()['warnings'])
        translate.assert_not_called()

    def test_chat_memory_persists(self):
        with SessionLocal() as db:
            user = User(name="Test farmer", email="test@example.invalid", password=main.hash_password("TestPassword123"))
            db.add(user)
            db.commit()
            user_id = user.id
        self.client.post("/login", json={"email":"test@example.invalid","password":"TestPassword123"})
        response = self.client.post("/ask", json={"question": "latest wheat price", "user_id": user_id})
        self.assertEqual(response.status_code, 200)
        with SessionLocal() as db:
            memory = db.query(QueryMemory).filter_by(user_id=user_id).one()
            self.assertEqual(memory.answer, response.json()["answer"])
        login = self.client.post("/login", json={"email": "test@example.invalid", "password": "TestPassword123"})
        self.assertEqual(login.status_code, 200)

    def test_explanation_preserves_doses_and_qualifiers(self):
        text = "Do not apply more than 5 ml. Only use when recommended by a qualified expert."
        response = self.client.post("/ai/explain-simply", json={"text": text})
        self.assertEqual(response.json()["answer"], text)

    def test_source_inspection_only_serves_indexed_files(self):
        response = self.client.get("/knowledge/sources/soil_basics.html")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/plain"))
        self.assertEqual(self.client.get("/knowledge/sources/main.py").status_code, 404)

    def test_pdf_citation_opens_registered_original_file(self):
        doc = next(d for d in main.documents if d.get("doc_type") == "pdf")
        response = self.client.get(f"/knowledge/pdf/{doc['source_id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertEqual(self.client.get("/knowledge/pdf/unknown").status_code, 404)

    def test_comments_persist_in_database_and_reject_empty_text(self):
        from backend.models import Comment
        with SessionLocal() as db:
            user = User(name="Comment test",email="comment@example.invalid",password=main.hash_password("testpass"))
            db.add(user); db.commit(); uid=user.id
        self.client.post("/login",json={"email":"comment@example.invalid","password":"testpass"})
        pid = self.client.post("/community/create-post",json={"user_id":uid,"content":"Test discussion"}).json()["post"]["id"]
        self.assertEqual(self.client.post("/community/comment",json={"post_id":pid,"user_id":uid,"text":"Saved reply"}).status_code,200)
        with SessionLocal() as db:
            self.assertEqual(db.query(Comment).filter_by(post_id=pid).one().text,"Saved reply")
        self.assertEqual(TestClient(main.app).get(f"/community/comments/{pid}").json()[0]["text"],"Saved reply")
        self.assertEqual(self.client.post("/community/comment",json={"post_id":pid,"user_id":uid,"text":" "}).status_code,422)

    def test_image_answer_retains_citations_and_language(self):
        with patch.object(main,"image_text",return_value="What is soil?"), \
             patch.object(main,"ask_question",return_value={"answer":"Soil answer [1]","references":[{"index":1,"page":2}],"warnings":["test warning"]}) as answer:
            response=self.client.post("/upload-image/",files={"file":("test.png",b"test","image/png")},data={"language":"Marathi"})
            self.assertEqual(response.status_code,200)
            self.assertEqual(answer.call_args.args[0].language,"Marathi")
            self.assertEqual(response.json()["references"][0]["page"],2)
            self.assertEqual(response.json()["warnings"],["test warning"])

    def test_unreadable_upload_reports_ocr_failure(self):
        from backend.document_processing import DocumentError
        with patch.object(main,"image_text",side_effect=DocumentError("No readable text")):
            response=self.client.post("/upload-image/",files={"file":("test.png",b"test","image/png")})
            self.assertEqual(response.status_code,422)
            self.assertIn("No readable text",response.json()["detail"])

    def test_blank_pdf_is_not_decoded_as_document_text(self):
        import io
        from pypdf import PdfWriter
        writer=PdfWriter();writer.add_blank_page(width=300,height=300)
        buffer=io.BytesIO();writer.write(buffer)
        response=self.client.post("/ai/document-insights",files={"file":("blank.pdf",buffer.getvalue(),"application/pdf")})
        self.assertEqual(response.status_code,422)
        self.assertIn("no readable text",response.json()["detail"])

    def test_registration_hashes_pending_password_and_clears_payload(self):
        from backend.models import OtpSession
        payload={"name":"OTP test","email":"otp-test@example.invalid","password":"Secret123!",
                 "mobile_number":"9000000017","date_of_birth":"2000-01-01","state":"Maharashtra","district":"Pune","otp_channel":"sms","role":"admin"}
        with patch.object(main,"generate_otp",return_value="123456"), patch.object(main,"send_otp_via_provider",return_value={"status":"sent"}):
            response=self.client.post("/auth/send-registration-otp",json=payload)
        self.assertEqual(response.status_code,200)
        self.assertNotIn("development_otp", response.json())
        with SessionLocal() as db:
            pending=db.query(OtpSession).filter_by(email=payload["email"]).one()
            self.assertNotIn('"password":',pending.pending_payload)
            self.assertNotIn(payload["password"],pending.pending_payload)
        response=self.client.post("/auth/verify-registration-otp",json={"phone_number":payload["mobile_number"],"email":payload["email"],"otp":"123456"})
        self.assertEqual(response.json()["role"],"farmer")
        with SessionLocal() as db:
            self.assertIsNone(db.query(OtpSession).filter_by(email=payload["email"]).one().pending_payload)


class TranslationTests(unittest.TestCase):
    def setUp(self):
        import backend.translation as translation
        translation._retry_after = 0.0
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        cache = patch.object(translation, "CACHE_PATH", os.path.join(self.tmp.name, "cache.db"))
        cache.start(); self.addCleanup(cache.stop)
        env = patch.dict(os.environ, {"GOOGLE_TRANSLATE_API_KEY":"test-only"})
        env.start(); self.addCleanup(env.stop)
        translate_cached.cache_clear()

    def test_network_timeout_and_success_cache(self):
        translate_cached.cache_clear()
        with patch("backend.translation.requests.post") as request:
            response = request.return_value
            response.json.return_value = {'data':{'translations':[{'translatedText':'Translated answer'}]}}
            self.assertEqual(translate_cached("answer", "hi"), "Translated answer")
            self.assertEqual(translate_cached("answer", "hi"), "Translated answer")
            self.assertEqual(request.call_count, 1)
            self.assertEqual(request.call_args.kwargs["timeout"], (2, 4))
        translate_cached.cache_clear()

    def test_failure_cooldown_avoids_repeated_network_waits(self):
        import requests
        with patch("backend.translation.requests.post", side_effect=requests.Timeout) as request:
            with self.assertRaises(RuntimeError):
                translate_cached("first", "hi")
            with self.assertRaises(RuntimeError):
                translate_cached("second", "hi")
            self.assertEqual(request.call_count, 2)


if __name__ == "__main__":
    unittest.main()

"""Integration checks use the temporary database configured by test_chatbot."""
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.models import User, QueryMemory, OrderRecord
from backend.security import _limits
from datetime import timedelta

class SecurityTests(unittest.TestCase):
    def setUp(self):
        _limits.clear()
        self.client = TestClient(main.app)
        with SessionLocal() as db:
            for n in (1, 2):
                email = f'security{n}@example.invalid'
                user = db.query(User).filter_by(email=email).first()
                if not user:
                    user = User(name=f'Farmer {n}', email=email, password=main.hash_password('Password123!'), role='farmer', state='Maharashtra', district='Pune')
                    db.add(user); db.commit()
                setattr(self, f'uid{n}', user.id)

    def login(self):
        result = self.client.post('/login', json={'email':'security1@example.invalid','password':'Password123!'})
        self.assertEqual(result.status_code, 200)
        self.assertIn('HttpOnly', result.headers['set-cookie'])

    def test_guest_and_forged_identity_rejected(self):
        for path in ['/admin/analytics?user_email=admin@example.invalid', '/questions/feed', f'/profile/{self.uid1}', '/shop/orders']:
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.post('/community/like/1').status_code, 401)
        self.login()
        self.assertEqual(self.client.get(f'/profile/{self.uid2}').status_code,403)
        self.assertEqual(self.client.post('/community/create-post',json={'user_id':self.uid2,'content':'spoof'}).status_code,403)
        self.assertEqual(self.client.get('/admin/analytics?user_email=anything').status_code,403)
        self.assertEqual(self.client.get('/shop/orders').status_code,422)

    def test_history_is_private_and_logout_revokes(self):
        with SessionLocal() as db:
            db.add(QueryMemory(user_id=self.uid2,question='Private secret',answer='Private reply',language='English'))
            db.commit()
        self.login()
        self.assertNotIn('Private secret', self.client.get('/questions/feed').text)
        token = self.client.cookies.get('agro_session')
        self.assertEqual(self.client.post('/auth/logout').status_code,200)
        self.assertEqual(self.client.get('/auth/me',headers={'Authorization':'Bearer '+token}).status_code,401)

    def test_login_rate_limit_and_bad_password_status(self):
        for _ in range(6):
            self.assertEqual(self.client.post('/login',json={'email':'missing@example.invalid','password':'wrongpass'}).status_code,401)
        self.assertEqual(self.client.post('/login',json={'email':'missing@example.invalid','password':'wrongpass'}).status_code,429)

    def test_manual_otp_is_not_a_verification_bypass(self):
        response = self.client.post('/auth/send-registration-otp',json={'name':'Test','email':'manual@example.invalid','password':'Password123!', 'mobile_number':'9000000027','date_of_birth':'2000-01-01','state':'Maharashtra','district':'Pune','otp_channel':'manual'})
        self.assertEqual(response.status_code,503)
        self.assertNotIn('development_otp',response.text)

    def test_old_order_does_not_auto_deliver(self):
        order = OrderRecord(order_code='security-order',user_id=self.uid1,status='Order placed',created_at=main.now_utc()-timedelta(days=2))
        with SessionLocal() as db:
            main.sync_order_timeline(db,order)
            self.assertEqual(order.status,'Order placed')
            db.rollback()

    def test_produce_listing_uses_authenticated_owner(self):
        self.login()
        response = self.client.post('/produce/listings',json={'user_id':self.uid1,'seller_name':'Test farmer','seller_phone':'9000000028','seller_location':'Pune','crop_name':'Wheat','quantity':10,'price_per_unit':'20'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['listing_code'])


class GujaratiPresentationTests(unittest.TestCase):
    def setUp(self):
        from backend.security import _limits
        _limits.clear()
        self.client = TestClient(main.app)

    def test_selected_gujarati_localizes_greeting_and_sent_question(self):
        response = self.client.post('/ask', json={'question':'hi','language':'Gujarati'})
        self.assertEqual(response.status_code,200)
        data=response.json()
        self.assertEqual(data['display_question'],'નમસ્તે')
        self.assertEqual(data['original_question'],'hi')
        self.assertIn('નમસ્તે',data['answer'])
        self.assertEqual(data['answer_language'],'Gujarati')
        self.assertEqual(data['translation_status'],'translated')

    def test_auto_detects_gujarati_and_preserves_source(self):
        response=self.client.post('/ask',json={'question':'માટી શું છે?','language':'Auto'})
        data=response.json()
        self.assertEqual(response.status_code,200)
        self.assertEqual(data['answer_language'],'Gujarati')
        self.assertTrue(data['references'])
        self.assertIn('માટી',data['answer'])
        self.assertIn('Soil',data['original_answer'])

    def test_unsupported_languages_removed(self):
        for language in ('Punjabi','Tamil','Telugu','Kannada','Bengali'):
            self.assertEqual(self.client.post('/ask',json={'question':'hi','language':language}).status_code,422)

    def test_translation_failure_is_not_english_answer_disguised_as_gujarati(self):
        with patch.object(main,'translate_cached',side_effect=RuntimeError):
            response=self.client.post('/ask',json={'question':'What is soil?','language':'Gujarati'})
        data=response.json()
        self.assertEqual(data['translation_status'],'unavailable')
        self.assertIn('ગુજરાતી',data['answer'])
        self.assertIn('Soil',data['original_answer'])
        self.assertEqual(data['display_question'],'What is soil?')


class BasicRegistrationTests(unittest.TestCase):
    def setUp(self):
        from backend.security import _limits
        _limits.clear()
        self.client = TestClient(main.app)

    def test_password_registration_login_and_no_phone_claim(self):
        import uuid
        payload = {'name': 'Demo Tester', 'email': f'{uuid.uuid4().hex}@example.test', 'password': 'Test-only-password-42'}
        with patch.dict(os.environ, {'BASIC_REGISTRATION': 'true'}):
            response = self.client.post('/auth/register-basic', json={**payload, 'role': 'admin'})
            self.assertEqual(response.status_code, 201)
            self.assertFalse(response.json()['phone_verified'])
            with SessionLocal() as db:
                user = db.query(User).filter(User.email == payload['email']).one()
                self.assertEqual(user.role, 'farmer')
                self.assertNotEqual(user.password, payload['password'])
            self.assertEqual(self.client.post('/auth/register-basic', json=payload).status_code, 409)
            login = self.client.post('/login', json={'email': payload['email'], 'password': payload['password']})
            self.assertEqual(login.status_code, 200)
            self.assertIn('agro_session', self.client.cookies)

    def test_basic_registration_disabled(self):
        with patch.dict(os.environ, {'BASIC_REGISTRATION': 'false'}):
            self.assertFalse(self.client.get('/auth/config').json()['basic_registration'])
            response = self.client.post('/auth/register-basic', json={'name': 'Demo', 'email': 'disabled@example.test', 'password': 'Test-only-password'})
            self.assertEqual(response.status_code, 404)

    def test_invalid_registration_and_rate_limit(self):
        with patch.dict(os.environ, {'BASIC_REGISTRATION': 'true'}):
            for _ in range(6):
                response = self.client.post('/auth/register-basic', json={'name': ' ', 'email': 'invalid', 'password': 'short'})
                self.assertEqual(response.status_code, 422)
            self.assertEqual(self.client.post('/auth/register-basic', json={}).status_code, 429)
