# Updating AgroGyanGPT: PC to GitHub to website and phone

Updated 24 October 2026. These instructions describe the existing Render demo,
not a new paid deployment. No new hosting account or domain is needed.

## 1. Know which folder and repository to use

Always edit this retained project folder:

```text
C:\Users\HP\Desktop\Divyansh\Agrogyanchatgpt
```

The app is inside its `agrogyan-gpt-main` subfolder. The Git repository is the
outer folder. Its destination must be:

```text
https://github.com/Oneday-begin/Agrogyanchatgpt.git
```

The deployed service is `agrogyan-demo`, using branch `main`:

- Public landing page: https://agrogyan-demo.onrender.com/
- Sign in / register: https://agrogyan-demo.onrender.com/login.html
- Farm dashboard: https://agrogyan-demo.onrender.com/index.html
- Chatbot: https://agrogyan-demo.onrender.com/chat.html
- Health: https://agrogyan-demo.onrender.com/health

## 2. Recommended method: GitHub Desktop

1. Open GitHub Desktop. In its account settings, check that you are using
   `Oneday-begin`.
2. Select the existing `Agrogyanchatgpt` repository. If it is missing, select
   **File > Add local repository**, choose the outer folder above, then
   **Add repository**. Do not create another repository inside the app folder.
3. Open **Repository > Repository settings > Remote**. Check that the primary
   remote is the Oneday-begin URL above. Avoid the old Desterhub destination.
4. Select branch **main**. Click **Fetch origin**. If **Pull origin** appears,
   click it before editing. If you already have local edits, save/commit them
   first and resolve any conflicts carefully; do not discard them to pull.
5. Open the project in VS Code and make your change. Save the files.
6. Test locally as explained below.
7. Return to GitHub Desktop. Review the **Changes** list and the actual diff.
   Include the source files needed for this change. Do not include passwords,
   `.env`, real user databases, session data, model files, temporary previews
   or private uploads. A prepared public GR bundle is different from user data.
8. Enter a clear summary such as `Improve scheme cards on mobile`.
9. Click **Commit to main**.
10. Click **Push origin**. A commit alone only saves the change locally;
    **Push origin** sends it to GitHub. Wait for it to complete.
11. Open GitHub and check that your new commit appears on the repository's
    **main** branch. If the upload is rejected because the remote is newer,
    fetch/pull and merge the newer work. Do not force-push over it.

## 3. Test before publishing

Open a terminal in VS Code. From the outer repository folder:

```powershell
Set-Location 'C:\Users\HP\Desktop\Divyansh\Agrogyanchatgpt\agrogyan-gpt-main'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Use the project's Python environment with requirements already installed.
If you use a virtual environment, activate it first. A port-in-use message
means an existing server already owns port 8000: stop the known server with
Ctrl+C in its terminal before starting another.

Open http://127.0.0.1:8000/. The local `.env` determines whether models and
password registration are enabled. It is independent from Render Environment.
The local default uses Ollama; the hosted demo uses Groq. Test configuration
differences deliberately, and do not overwrite the local database URL with
the hosted one just to preview a visual change.

Check the pages affected by your change, plus login and a cited chat answer.
Use browser developer tools' responsive view at 320px and 390px and a desktop
width. Check menus, links, forms, long text and scrolling. A responsive preview
does not replace checking Safari/Chrome on a physical phone.

For backend/auth/retrieval changes, run the regression suite:

```powershell
python -m unittest discover -s tests -v
```

The suite uses temporary user/session databases and mocks external providers.
It still loads the real local corpus during discovery. Check relevant JS syntax
with `node --check frontend/ui.js` or the edited JavaScript file. UI-only edits
need browser verification; passing Python tests does not prove the layout works.

## 4. Wait for Render to publish the pushed commit

1. Open https://dashboard.render.com/ and select **agrogyan-demo**.
2. Open **Deploys**. With **Auto-Deploy > On Commit**, the pushed `main` commit
   starts a build automatically. Match its short commit ID to the GitHub commit.
3. Wait for that specific deployment to show **Deploy succeeded / Live**.
   A previous Live deployment does not prove the newest commit is live.
4. If no deployment starts, check **Settings > Auto-Deploy** and the linked
   repository/branch. Use **Manual Deploy > Deploy latest commit** if needed.
5. If it fails, read the newest deployment's logs. Fix the actual error and
   push another commit; repeated retries do not fix invalid credentials/code.
6. Check `/health`: expected basic readiness is `status: ok`,
   `database: connected` and `chatbot_ready: true`. Model configuration is not
   a successful live model call, so test an answer and each required language.

Do not click Upgrade to fix a code problem. Leave the service instance Free.
Do not configure scheduled keep-alive traffic to defeat free-plan sleeping.

## 5. See the update on the website and phone

1. Open the public HTTPS website on your PC. It is not a `localhost` link.
2. On desktop, use **Ctrl+Shift+R** to reload HTML and assets.
3. On your phone, reload the same public URL. If an old page remains, close
   that tab and open the link again. A fresh private tab can help distinguish
   cached content from a deployment problem.
4. Do not clear all site data casually: chat threads are browser-local and
   clearing site data deletes those local conversations and signs you out.
5. Recheck the menu, chat, sources and sign-in on the phone. No app reinstall,
   second deployment or separate mobile upload is needed.
6. Your PC can be off. Both devices load Render's deployed version, while
   account records use Supabase. Browser conversation sidebars do not sync.

The publication chain is:

```text
Edit and save locally -> test -> commit -> Push origin -> Render build succeeds
-> refresh the same public website on desktop and phone
```

Saving a file on your PC alone does not update the public website.

## 6. Which files control which parts?

| Change | Location under agrogyan-gpt-main |
| --- | --- |
| Public landing content | frontend/landing.html |
| Public landing design | frontend/landing.css |
| Farm dashboard | frontend/index.html and frontend/farmer-pages.js |
| Shared mobile layout | frontend/mobile.css |
| Shared app navigation | frontend/ui.js |
| Chat layout and sidebar | frontend/chat.html, chat-workspace.css and chat-workspace.js |
| Chat request/rendering | frontend/script.js |
| Login and registration | frontend/login.html and frontend/auth.js |
| API behavior | backend/main.py |
| Retrieval policy | backend/rag.py, retriever.py and retrieval_policy.py |
| Translation | backend/translation.py |
| Hosted configuration | render.yaml at the outer repository root |
| Placement report source | docs/placement/AgroGyanGPT_Placement_Report.md |

When changing shared CSS/JS that existing HTML references, update its version
query string where needed (for example `?v=mobile-20261024`). The backend also
sends `Cache-Control: no-store`; versioning is additional cache hygiene.

## 7. Updating GR knowledge is a separate preparation step

New files do not automatically become indexed because you pushed them.

1. Add only agricultural/farming sources through the existing importer or
   supported local PDF import folders. Preserve original source links.
2. Preview the importer and review scope/quality results before applying.
   See `python -m backend.import_maharashtra_grs --help` for current arguments.
3. Load/rebuild the local corpus. For local semantic search, run:

```powershell
python -m backend.build_vector_index
```

4. Run `python -m backend.deployment_knowledge pack` from the app folder. This
   rebuilds the allowlisted public GR/OCR database bundles and manifest hashes.
5. Test citations and farming-only filtering. Commit the changed public bundle,
   its manifest, and necessary public reference/PDF source files, then push.
6. Render restores the bundle during its build and reloads the corpus.

The hosted free demo has `SEMANTIC_ENABLED=false`: it uses BM25 and native query
aliases, with Groq selecting evidence. It does not run the local EmbeddingGemma
vector index. Never copy `agrogyan.db`, sessions, API keys or user-uploaded
documents into the public knowledge package.

## 8. Changing secrets or repairing a failed deployment

- Change `GROQ_API_KEY` or `DATABASE_URL` privately in Render **Environment**.
  Save and redeploy. Never commit their values to GitHub or the report.
- Supabase uses the **Session pooler** on port 5432, with the exact supplied
  project-qualified username and `sslmode=require`. Direct IPv6 is not reachable
  from this service. Percent-encode special characters in the password only.
- If the database password changes, update Render too. A healthy Supabase
  instance does not make an incorrect password valid.
- `password authentication failed`: check the database password and username.
- `Network is unreachable` for `db.*.supabase.co`: check the session-pooler host.
- Groq 401: key is invalid; Groq 429: free quota/rate limit reached. Wait or fix
  configuration; no paid fallback is enabled by this app.
- If Supabase pauses, resume it in its dashboard. If Render sleeps, the next
  visit wakes it. Open the site before a demonstration.

For an urgent regression, Render may offer rollback to a recent successful
deployment. Also fix/revert the bad source commit through an ordinary new Git
commit, so a later auto-deploy does not bring the defect back. Avoid hard resets
and force-pushes for routine updates. Database changes need their own migration
and rollback plan; reverting code does not reverse a schema/data migration.

## 9. Keep the placement report current

Edit `docs/placement/AgroGyanGPT_Placement_Report.md` after a meaningful feature
or deployment change. Record what actually works, configuration differences,
validation evidence and remaining limits. Do not add private credentials or
claim measured accuracy/latency without an evaluation.

The PDF has a repeatable renderer. From the app directory, use a Python
environment with ReportLab installed (`python -m pip install reportlab` if needed):

```powershell
python docs/placement/build_report.py
```

The renderer uses Windows Arial/Consolas fonts. Check the regenerated PDF's
layout, tables and contents before committing both MD and PDF. The source
inventories and report-validation.json are dated evidence snapshots: update
them deliberately after verification; rendering alone does not refresh test
results or prove a feature works.

## Official references

- GitHub Desktop local repository: https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop
- Render automatic/manual deploys: https://render.com/docs/deploys
- Render free limits: https://render.com/docs/free
- Supabase PostgreSQL connections: https://supabase.com/docs/guides/database/connecting-to-postgres
