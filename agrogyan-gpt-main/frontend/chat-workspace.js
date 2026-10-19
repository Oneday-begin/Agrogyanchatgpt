/* Isolated conversations; no account data is shared between browser users. */
(() => {
    let chats = [], activeId = null, restoring = false, busy = false;
    const owner = getCurrentUserId() || 'guest';
    const key = () => `agroConversations_v1_${owner}`;
    const uid = () => crypto.randomUUID();
    const messages = () => document.getElementById('agroChatMessages');
    const current = () => chats.find(chat => chat.id === activeId);
    const clean = html => {
        const template = document.createElement('template');
        template.innerHTML = String(html || '');
        const allowed = new Set(['P','BR','STRONG','EM','UL','OL','LI','DETAILS','SUMMARY','A','SPAN','DIV','BUTTON']);
        for (const el of [...template.content.querySelectorAll('*')]) {
            if (!allowed.has(el.tagName)) { el.replaceWith(document.createTextNode(el.textContent)); continue; }
            for (const attr of [...el.attributes]) {
                if (!['class','href','rel','target','type','data-question','lang'].includes(attr.name)) el.removeAttribute(attr.name);
            }
            if (el.hasAttribute('href')) {
                try { const url = new URL(el.getAttribute('href'), location.href); if (!['http:','https:'].includes(url.protocol)) el.removeAttribute('href'); } catch { el.removeAttribute('href'); }
                el.setAttribute('rel','noopener noreferrer');
            }
        }
        return template.innerHTML;
    };
    function save() {
        try { localStorage.setItem(key(), JSON.stringify({chats, activeId})); }
        catch { document.getElementById('chatStorageNote').textContent = 'Browser storage is full. This chat may not survive a reload.'; }
    }
    function sidebar() {
        const list = document.getElementById('conversationList');
        list.replaceChildren();
        for (const chat of chats) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'conversation-item';
            button.textContent = chat.title; button.title = chat.title;
            button.setAttribute('aria-current', String(chat.id === activeId));
            button.disabled = busy;
            button.addEventListener('click', () => open(chat.id));
            list.append(button);
        }
    }
    function capture() {
        if (restoring || !current()) return;
        current().messages = [...messages().querySelectorAll('.agro-msg')].map(el => ({role: el.classList.contains('agro-msg--user') ? 'user' : 'bot', html: el.querySelector('.agro-msg-bubble')?.innerHTML || ''}));
        const first = messages().querySelector('.agro-msg--user p');
        if (first) current().title = first.textContent.trim().slice(0, 70) || 'New chat';
        current().language = document.getElementById('language').value;
        current().draft = document.getElementById('question').value;
        current().latest = latestChatAnswer;
        document.getElementById('conversationTitle').textContent = current().title;
        save(); sidebar();
    }
    function toggleSidebar(show) {
        document.body.classList.toggle('history-open', show);
        document.getElementById('historyToggle').setAttribute('aria-expanded', String(show));
    }
    function open(id) {
        if (busy) return;
        capture(); activeId = id;
        window.speechSynthesis?.cancel();
        const chat = current(); if (!chat) return;
        restoring = true; messages().replaceChildren();
        for (const item of chat.messages || []) _appendMsg(item.role, clean(item.html));
        if (!chat.messages?.length) messages().innerHTML = '<div id="chatEmptyState" class="chat-empty-state"><span class="empty-mark" aria-hidden="true">🌱</span><h2>What would you like to grow?</h2><p>Ask about crops, soil or farming schemes.<br>Get answers linked to their sources.</p><div class="starter-prompts"><button type="button" class="agro-followup-chip" data-question="What is soil?">What is soil?</button><button type="button" class="agro-followup-chip" data-question="Which documents are required for tractor subsidy?">Tractor subsidy documents</button><button type="button" class="agro-followup-chip" data-question="What is organic farming?">Organic farming</button></div></div>';
        document.getElementById('conversationTitle').textContent = chat.title;
        document.getElementById('question').value = chat.draft || '';
        if (['Auto','English','Hindi','Marathi','Gujarati'].includes(chat.language)) document.getElementById('language').value = chat.language;
        document.getElementById('language').dispatchEvent(new Event('change'));
        latestChatAnswer = chat.latest || null;
        document.getElementById('readAnswerBtn').disabled = !latestChatAnswer;
        document.getElementById('explainBtn').disabled = !latestChatAnswer;
        document.getElementById('confidence').textContent = '';
        restoring = false; save(); sidebar(); toggleSidebar(false);
    }
    function newChat() {
        if (busy) return;
        capture();
        const empty = chats.find(chat => !chat.messages.length && !chat.draft);
        if (empty) return open(empty.id);
        const chat = {id:uid(),title:'New chat',messages:[],language:document.getElementById('language').value};
        chats.unshift(chat); open(chat.id);
        document.getElementById('question').focus();
    }
    window.chatWorkspace = {capture, setBusy(value) { busy = value; document.getElementById('newChatButton').disabled = busy; if (!busy) capture(); sidebar(); }};
    window.addEventListener('agro-auth-changed', () => location.reload());
    document.addEventListener('DOMContentLoaded', () => {
        try {
            const stored = JSON.parse(localStorage.getItem(key()) || 'null');
            if (stored && Array.isArray(stored.chats)) { chats = stored.chats.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)); activeId = stored.activeId; }
            else {
                chats = getPersonalHistory().map(item => ({id:uid(),title:String(item.question || 'Earlier chat').slice(0,70),language:item.language,messages:[{role:'user',html:`<p>${escapeHtml(item.question)}</p>`},{role:'bot',html:`<p>${escapeHtml(item.answer)}</p><p class="legacy-chat-note">Earlier saved answer. Source links were not stored with this older chat.</p>`}]}));
            }
        } catch { chats = []; }
        const initial = activeId; activeId = null;
        if (chats.length) open(chats.some(c => c.id === initial) ? initial : chats[0].id); else newChat();
        document.getElementById('newChatButton').addEventListener('click',newChat);
        document.getElementById('historyToggle').addEventListener('click',() => toggleSidebar(!document.body.classList.contains('history-open')));
        document.querySelector('.sidebar-close').addEventListener('click',() => toggleSidebar(false));
        document.addEventListener('keydown',event => { if (event.key === 'Escape') toggleSidebar(false); });
        document.getElementById('question').addEventListener('input',() => { if (current()) { current().draft = document.getElementById('question').value; save(); } });
        document.getElementById('language').addEventListener('change',() => { if (current()) { current().language = document.getElementById('language').value; save(); } });
    });
})();
