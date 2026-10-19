# Deploy AgroGyanGPT

## What changed

- The frontend now talks to the same public host as the backend instead of hardcoded `127.0.0.1`.
- FastAPI now serves the `frontend` folder directly, so one deployed URL can open the full website.
- The main page shell now stretches across the full desktop width instead of stopping around `1240px`.

## Quick deploy on Render

1. Push this project to GitHub.
2. Create a new Render Web Service from that GitHub repo.
3. Render should detect `render.yaml` automatically.
4. Add these environment variables in Render before testing OTP signup:

```text
OTP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_SMS_FROM=your_twilio_sms_number
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

5. After deploy finishes, open your Render URL. It should load `login.html` from the same server.

## Real OTP delivery

- Registration OTP is no longer meant to appear in the UI panel.
- The backend now sends the OTP through Twilio based on the user’s selected channel:
  `sms` uses `TWILIO_SMS_FROM`
  `whatsapp` uses `TWILIO_WHATSAPP_FROM`
- The message includes a short closing line from AgroGyanGPT.
- If Twilio credentials are missing, the API now returns a configuration error instead of showing a demo OTP.

## Local run

Use:

```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## Important note

This project currently uses the local SQLite file `agrogyan.db`. That is fine for testing and basic demos, but for a serious public deployment you should move to a hosted database like PostgreSQL so user data is not tied to one server disk.
