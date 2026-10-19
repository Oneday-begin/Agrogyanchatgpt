# Knowledge Base Workflow

This folder stores state-wise HTML knowledge pages used by the chatbot.

## Current structure

- `states/gujarat.html`
- `states/punjab.html`
- `states/maharashtra_research_units.html`

## How to add more state files later

1. Put new PDFs or source documents inside a state folder under `backend/knowledge_imports/`.
2. Re-run:

```powershell
python backend\build_knowledge_base.py
```

3. Restart the backend so `load_documents()` reloads the updated HTML pages.

## Notes

- The chatbot now reads these generated HTML pages first, then falls back to legacy CSV Q&A rows.
- Each HTML file is meant to group one state's imported source material so future scaling stays simple.
