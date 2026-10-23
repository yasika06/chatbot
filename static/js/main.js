/* ================================================================
   AI PrivacyShield — Main JavaScript
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ─────────────────────────────────────────────
  //  CONSTANTS & CONFIG
  // ─────────────────────────────────────────────
  const QUICK_PROMPTS = {
    scan:    'Please scan this text for any sensitive information and show me what gets detected and masked: "My email is example@gmail.com, my phone is 9876543210, and my Aadhaar number is 1234 5678 9012."',
    privacy: 'What types of personal information does AI PrivacyShield detect and protect? Explain in detail with examples.',
    ask:     'Hello! I am ready to chat. What topics can you help me with today?',
  };

  // ─────────────────────────────────────────────
  //  DOM REFS
  // ─────────────────────────────────────────────
  const sidebar           = document.getElementById('sidebar');
  const sidebarToggle     = document.getElementById('sidebarToggle');
  const mobileSidebarBtn  = document.getElementById('mobileSidebarBtn');
  const newChatBtn        = document.getElementById('newChatBtn');
  const chatHistoryList   = document.getElementById('chatHistoryList');

  const welcomeScreen     = document.getElementById('welcomeScreen');
  const messagesList      = document.getElementById('messagesList');
  const typingRow         = document.getElementById('typingRow');
  const chatViewport      = document.getElementById('chatViewport');

  const chatForm          = document.getElementById('chatForm');
  const promptInput       = document.getElementById('promptInput');
  const sendBtn           = document.getElementById('sendBtn');

  const maskBanner        = document.getElementById('maskBanner');
  const maskBannerText    = document.getElementById('maskBannerText');
  const maskBannerClose   = document.getElementById('maskBannerClose');

  const filePreview       = document.getElementById('filePreview');
  const filePreviewName   = document.getElementById('filePreviewName');
  const filePreviewSize   = document.getElementById('filePreviewSize');
  const filePreviewRemove = document.getElementById('filePreviewRemove');

  const fileInputInline   = document.getElementById('fileInputInline');
  const fileInputHidden   = document.getElementById('fileInput');

  const clearChatBtn      = document.getElementById('clearChatBtn');
  const privacyModeToggle = document.getElementById('privacyModeToggle');
  const topbarSessionName = document.getElementById('topbarSessionName');

  const themeToggle       = document.getElementById('themeToggle');
  const settingsBtn       = document.getElementById('settingsBtn');
  const settingsOverlay   = document.getElementById('settingsOverlay');
  const settingsClose     = document.getElementById('settingsClose');
  const settingsPrivacyMode = document.getElementById('settingsPrivacyMode');
  const clearAllFilesBtn  = document.getElementById('clearAllFilesBtn');
  const clearAllHistoryBtn= document.getElementById('clearAllHistoryBtn');
  const themeDarkBtn      = document.getElementById('themeDarkBtn');
  const themeLightBtn     = document.getElementById('themeLightBtn');

  const privacyModal      = document.getElementById('privacyModal');
  const pmBody            = document.getElementById('pmBody');
  const pmClose           = document.getElementById('pmClose');
  const pmCancel          = document.getElementById('pmCancel');
  const pmSend            = document.getElementById('pmSend');

  const fileWarningModal  = document.getElementById('fileWarningModal');
  const fwBody            = document.getElementById('fwBody');
  const fwClose           = document.getElementById('fwClose');
  const fwAck             = document.getElementById('fwAck');

  // ─────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────
  let currentHistory    = [];    // [{role, content, id}]
  let currentSessionId  = null;  // active session ID (ChatGPT style)
  let pendingFile       = null;  // File object queued to upload
  let maskDebounce      = null;
  let chatSessions      = [];    // sidebar list

  // ─────────────────────────────────────────────
  //  THEME
  // ─────────────────────────────────────────────
  const root = document.documentElement;

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    const icon = themeToggle ? themeToggle.querySelector('i') : null;
    if (icon) icon.className = t === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    if (themeDarkBtn)  themeDarkBtn.classList.toggle('active', t === 'dark');
    if (themeLightBtn) themeLightBtn.classList.toggle('active', t === 'light');
  }

  applyTheme(localStorage.getItem('theme') || 'dark');

  if (themeToggle) themeToggle.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  if (themeDarkBtn)  themeDarkBtn.addEventListener('click',  () => applyTheme('dark'));
  if (themeLightBtn) themeLightBtn.addEventListener('click', () => applyTheme('light'));

  // ─────────────────────────────────────────────
  //  SIDEBAR TOGGLE
  // ─────────────────────────────────────────────
  if (sidebarToggle) sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  if (mobileSidebarBtn) mobileSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== mobileSidebarBtn) {
      sidebar.classList.remove('open');
    }
  });

  // ─────────────────────────────────────────────
  //  SETTINGS PANEL
  // ─────────────────────────────────────────────
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.remove('hidden');
    // Sync settings UI
    if (settingsPrivacyMode) settingsPrivacyMode.value = privacyModeToggle.value;
  });

  function closeSettings() { settingsOverlay.classList.add('hidden'); }
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsOverlay) settingsOverlay.addEventListener('click', e => {
    if (e.target === settingsOverlay) closeSettings();
  });

  if (settingsPrivacyMode) settingsPrivacyMode.addEventListener('change', () => {
    privacyModeToggle.value = settingsPrivacyMode.value;
  });

  if (clearAllFilesBtn) clearAllFilesBtn.addEventListener('click', async () => {
    if (!confirm('Permanently delete all uploaded and encrypted files, and reset counters?')) return;
    try {
      const res = await fetch('/api/files/delete', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'All stored files have been deleted.');
      closeSettings();
      loadChatHistory();
    } catch (e) {
      alert('Failed to delete files.');
    }
  });

  if (clearAllHistoryBtn) clearAllHistoryBtn.addEventListener('click', async () => {
    if (!confirm('Clear all chat history? This cannot be undone.')) return;
    await fetch('/api/history/delete', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({id: null})
    });
    // Also delete any stored files
    await fetch('/api/files/delete', { method: 'POST' });
    chatSessions = [];
    renderHistorySidebar([]);
    startNewChat(true);
    closeSettings();
  });

  // ─────────────────────────────────────────────
  //  PRIVACY MODE SYNC
  // ─────────────────────────────────────────────
  privacyModeToggle.addEventListener('change', () => {
    if (settingsPrivacyMode) settingsPrivacyMode.value = privacyModeToggle.value;
  });

  // ─────────────────────────────────────────────
  //  LOAD CHAT SESSIONS SIDEBAR (ChatGPT style)
  // ─────────────────────────────────────────────
  async function loadChatHistory() {
    try {
      const res  = await fetch('/api/sessions');
      const data = await res.json();
      chatSessions = data.sessions || [];
      renderHistorySidebar(chatSessions);
    } catch (e) {
      chatHistoryList.innerHTML = '<div class="history-empty">Could not load history</div>';
    }
  }

  function renderHistorySidebar(sessions) {
    if (!sessions.length) {
      chatHistoryList.innerHTML = '<div class="history-empty">No recent chats</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    sessions.forEach(sess => {
      const title = sess.title || 'New Chat';

      const item = document.createElement('button');
      item.className = 'history-item' + (sess.id === currentSessionId ? ' active' : '');
      item.dataset.sessionId = sess.id;
      item.title = title;

      const span = document.createElement('span');
      span.className = 'history-item-title';
      span.textContent = title;
      item.appendChild(span);

      item.addEventListener('click', () => {
        openSession(sess.id);
      });
      frag.appendChild(item);
    });
    chatHistoryList.innerHTML = '';
    chatHistoryList.appendChild(frag);
  }

  async function openSession(sessionId) {
    currentSessionId = sessionId;
    startNewChat(false); // clear chat view without resetting currentSessionId

    // Mark active in sidebar
    document.querySelectorAll('.history-item').forEach(el => {
      el.classList.toggle('active', el.dataset.sessionId === sessionId);
    });

    try {
      const res = await fetch(`/api/session/${sessionId}`);
      const data = await res.json();
      const sess = data.session;
      if (!sess) return;

      topbarSessionName.textContent = sess.title || 'Chat';
      currentHistory = [];

      const messages = sess.messages || [];
      if (messages.length > 0) {
        welcomeScreen.classList.add('hidden');
      }

      messages.forEach(msg => {
        const userText = msg.masked_prompt || msg.original_prompt || '';
        const aiText = msg.response || '';
        const timeObj = msg.timestamp ? new Date(msg.timestamp) : null;
        if (userText) {
          appendUserMessage(userText, timeObj);
          currentHistory.push({ role: 'user', content: userText, id: msg.id });
        }
        if (aiText) {
          appendAiMessage(aiText, null, 'Low', null, timeObj);
          currentHistory.push({ role: 'assistant', content: aiText, id: msg.id });
        }
      });
      scrollToBottom();
      sidebar.classList.remove('open');
    } catch (err) {
      console.error('Error opening session:', err);
    }
  }

  loadChatHistory();

  // ─────────────────────────────────────────────
  //  NEW CHAT
  // ─────────────────────────────────────────────
  function startNewChat(resetSession = true) {
    if (resetSession) {
      currentSessionId = null;
      document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
    }
    currentHistory = [];
    messagesList.innerHTML = '';
    welcomeScreen.classList.remove('hidden');
    topbarSessionName.textContent = resetSession ? 'AI PrivacyShield' : '';
    maskBanner.classList.add('hidden');
    filePreview.classList.add('hidden');
    pendingFile = null;
    promptInput.value = '';
    promptInput.style.height = 'auto';
    sendBtn.disabled = true;
    if (resetSession) loadChatHistory();
  }

  if (newChatBtn) newChatBtn.addEventListener('click', () => startNewChat(true));
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear current chat and start a new conversation?')) {
      startNewChat(true);
    }
  });

  // ─────────────────────────────────────────────
  //  QUICK ACTION CARDS (welcome screen)
  // ─────────────────────────────────────────────
  document.querySelectorAll('.qa-card[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      promptInput.value = prompt;
      adjustTextarea();
      sendBtn.disabled = false;
      promptInput.focus();
      chatForm.dispatchEvent(new Event('submit', {bubbles: true}));
    });
  });

  const qaFileBtn = document.getElementById('qaFileBtn');
  if (qaFileBtn) qaFileBtn.addEventListener('click', () => fileInputInline.click());

  // ─────────────────────────────────────────────
  //  SIDEBAR QUICK ACTIONS
  // ─────────────────────────────────────────────
  document.querySelectorAll('.sidebar-action[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'file') { fileInputInline.click(); return; }
      const prompt = QUICK_PROMPTS[action];
      if (prompt) { fillAndSend(prompt); }
      sidebar.classList.remove('open');
    });
  });

  // Inline quick action buttons (below input)
  document.querySelectorAll('.iqa-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'file') { fileInputInline.click(); return; }
      const prompt = QUICK_PROMPTS[action];
      if (prompt) fillAndSend(prompt);
    });
  });

  function fillAndSend(prompt) {
    promptInput.value = prompt;
    adjustTextarea();
    sendBtn.disabled = false;
    chatForm.dispatchEvent(new Event('submit', {bubbles: true}));
  }

  // ─────────────────────────────────────────────
  //  CLEAR CHAT
  // ─────────────────────────────────────────────
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
    if (currentHistory.length === 0 && messagesList.children.length === 0) return;
    if (!confirm('Clear this chat?')) return;
    startNewChat(true);
  });

  // ─────────────────────────────────────────────
  //  TEXTAREA AUTO-RESIZE + LIVE MASK PREVIEW
  // ─────────────────────────────────────────────
  function adjustTextarea() {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
  }

  promptInput.addEventListener('input', () => {
    adjustTextarea();
    sendBtn.disabled = promptInput.value.trim().length === 0;

    const text = promptInput.value.trim();
    if (!text) { maskBanner.classList.add('hidden'); return; }

    clearTimeout(maskDebounce);
    maskDebounce = setTimeout(async () => {
      try {
        const res  = await fetch('/api/mask', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({text, privacy_mode: privacyModeToggle.value})
        });
        const data = await res.json();
        if (data.masked_text && data.masked_text !== text) {
          maskBannerText.textContent = '🔐 Sensitive data detected — will be masked before sending to AI';
          maskBanner.classList.remove('hidden');
        } else {
          maskBanner.classList.add('hidden');
        }
      } catch (e) { maskBanner.classList.add('hidden'); }
    }, 350);
  });

  promptInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (promptInput.value.trim()) chatForm.dispatchEvent(new Event('submit'));
    }
  });

  if (maskBannerClose) maskBannerClose.addEventListener('click', () => maskBanner.classList.add('hidden'));

  // ─────────────────────────────────────────────
  //  FILE HANDLING
  // ─────────────────────────────────────────────
  function handleFileSelected(file) {
    if (!file) return;
    pendingFile = file;
    filePreviewName.textContent = file.name;
    filePreviewSize.textContent = formatBytes(file.size);
    filePreview.classList.remove('hidden');
  }

  fileInputInline.addEventListener('change', e => handleFileSelected(e.target.files[0]));
  if (fileInputHidden) fileInputHidden.addEventListener('change', e => handleFileSelected(e.target.files[0]));

  if (filePreviewRemove) filePreviewRemove.addEventListener('click', () => {
    pendingFile = null;
    fileInputInline.value = '';
    if (fileInputHidden) fileInputHidden.value = '';
    filePreview.classList.add('hidden');
  });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  async function uploadPendingFile() {
    if (!pendingFile) return null;
    const file = pendingFile;
    pendingFile = null;
    filePreview.classList.add('hidden');
    fileInputInline.value = '';

    appendUserMessage(`📎 ${file.name} (${formatBytes(file.size)})`);
    showTyping();
    scrollToBottom();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('privacy_mode', privacyModeToggle.value);

    try {
      const res  = await fetch('/api/upload', {method:'POST', body: formData});
      const data = await res.json();
      hideTyping();

      if (data.error) {
        appendAiMessage(`❌ Upload failed: ${data.error}`);
        return null;
      }

      if (data.encrypted) {
        showFileWarningModal(`
          <p>Sensitive data was detected in <strong>${escHtml(file.name)}</strong>. The file has been encrypted to protect your privacy.</p>
          <div style="margin-top:10px;padding:10px;background:var(--bg-base);border-radius:var(--r-md);font-size:.82rem;">
            <p><strong>Encrypted file:</strong> ${escHtml(data.encrypted_filename || '')}</p>
            <p><strong>Password:</strong> <code>${escHtml(data.password || '')}</code></p>
            <p style="color:var(--warning);margin-top:6px;">⚠️ Please save this password in a secure location.</p>
          </div>
        `);
      }

      const msgLines = [`✅ **${escHtml(data.filename)}** processed successfully.`];
      if (data.findings && Object.keys(data.findings).length > 0) {
        const count = Object.values(data.findings).flat().length;
        msgLines.push(`\n\n🔐 ${count} sensitive items detected and masked.`);
      }
      appendAiMessage(msgLines.join(''), data.findings, data.risk_score);
      return data;
    } catch (err) {
      hideTyping();
      appendAiMessage('Sorry, an error occurred during file upload.');
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  CHAT SUBMIT
  // ─────────────────────────────────────────────
  chatForm.addEventListener('submit', async e => {
    e.preventDefault();

    // File upload mode
    if (pendingFile && !promptInput.value.trim()) {
      await uploadPendingFile();
      return;
    }

    const rawText = promptInput.value.trim();
    if (!rawText && !pendingFile) return;

    // If there's a file + text, upload file first then continue
    if (pendingFile) {
      await uploadPendingFile();
    }

    if (!rawText) return;

    // Hide welcome screen
    welcomeScreen.classList.add('hidden');

    // Get masked version for display
    let displayText = rawText;
    try {
      const mRes  = await fetch('/api/mask', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({text: rawText, privacy_mode: privacyModeToggle.value})
      });
      const mData = await mRes.json();
      displayText = mData.masked_text || rawText;
    } catch(e){}

    // Display user message (show masked version)
    appendUserMessage(displayText);

    promptInput.value = '';
    promptInput.style.height = 'auto';
    sendBtn.disabled = true;
    maskBanner.classList.add('hidden');

    // Update session name
    if (!topbarSessionName.textContent) {
      topbarSessionName.textContent = rawText.slice(0, 40) + (rawText.length > 40 ? '…' : '');
    }

    showTyping();
    scrollToBottom();

    const sendToBE = async (confirm = false) => {
      return fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          prompt:       rawText,
          session_id:   currentSessionId,
          history:      currentHistory.slice(-10), // last 5 turns
          confirm:      confirm,
          privacy_mode: privacyModeToggle.value
        })
      });
    };

    try {
      let res  = await sendToBE(false);
      let data = await res.json();

      if (!res.ok && data.warning === 'sensitive_detected') {
        hideTyping();
        // Show privacy modal
        showPrivacyModal(data, async () => {
          showTyping();
          const res2  = await sendToBE(true);
          const data2 = await res2.json();
          hideTyping();
          handleAiResponse(data2, rawText);
        });
        return;
      }

      hideTyping();
      handleAiResponse(data, rawText);

    } catch (err) {
      hideTyping();
      appendAiMessage('⚠️ Sorry, something went wrong. Please try again.');
      console.error(err);
    }
  });

  function handleAiResponse(data, originalText) {
    if (data.error) {
      appendAiMessage('❌ Error: ' + data.error);
      return;
    }

    if (data.session_id) {
      currentSessionId = data.session_id;
    }
    if (data.session_title) {
      topbarSessionName.textContent = data.session_title;
    }

    const findings   = data.findings    || {};
    const riskScore  = data.risk_score  || 'Low';
    const hasFindings= Object.keys(findings).length > 0;

    if (hasFindings) {
      // Show privacy notice inline
      const noticeEl = document.createElement('div');
      noticeEl.className = 'privacy-inline-notice';
      const totalItems = Object.values(findings).flat().length;
      noticeEl.innerHTML = `
        <div style="max-width:900px;margin:0 auto;padding:4px 20px;">
          <span class="privacy-notice">
            <i class="fa-solid fa-shield-halved"></i>
            🔐 ${totalItems} sensitive item${totalItems !== 1 ? 's' : ''} detected and protected before sending to AI
          </span>
        </div>
      `;
      messagesList.appendChild(noticeEl);
    }

    appendAiMessage(data.response, findings, riskScore, data.masked_prompt);

    currentHistory.push({role:'user',      content: originalText, id: data.id});
    currentHistory.push({role:'assistant', content: data.response, id: data.id});

    // Refresh sidebar history after each message
    loadChatHistory();
  }

  // ─────────────────────────────────────────────
  //  APPEND MESSAGES
  // ─────────────────────────────────────────────
  function appendUserMessage(text, timeObj = null) {
    const row = document.createElement('div');
    row.className = 'msg-row user';

    const time = timeObj ? new Date(timeObj) : new Date();
    row.innerHTML = `
      <div class="msg-content">
        <div>${escHtml(text).replace(/\n/g,'<br>')}</div>
        <div class="msg-time" style="text-align:right;margin-top:4px;">${fmtTime(time)}</div>
      </div>
      <div class="user-avatar"><i class="fa-solid fa-user"></i></div>
    `;

    messagesList.appendChild(row);
    scrollToBottom();
  }

  function appendAiMessage(text, findings = null, riskScore = 'Low', maskedPrompt = null, timeObj = null) {
    const row = document.createElement('div');
    row.className = 'msg-row ai';

    const time = timeObj ? new Date(timeObj) : new Date();
    const formattedText = formatMarkdown(text);

    let privacyCardHtml = '';
    if (findings && Object.keys(findings).length > 0) {
      privacyCardHtml = buildPrivacyScanCard(findings, riskScore, maskedPrompt);
    }

    row.innerHTML = `
      <div class="ai-avatar"><i class="fa-solid fa-shield-halved"></i></div>
      <div class="msg-content">
        <div class="msg-bubble">${formattedText}</div>
        ${privacyCardHtml}
        <div class="msg-time">${fmtTime(time)}</div>
      </div>
    `;

    messagesList.appendChild(row);
    scrollToBottom();
  }

  function buildPrivacyScanCard(findings, riskScore, maskedPrompt) {
    const cats = Object.entries(findings);
    const total = cats.reduce((s,[,v]) => s + v.length, 0);
    const catIcons = {
      email:'fa-envelope', phone:'fa-phone', aadhaar:'fa-id-card',
      credit_card:'fa-credit-card', password:'fa-key', api_key:'fa-code'
    };

    let rows = cats.map(([cat, items]) => `
      <tr>
        <td class="td-type">${ucFirst(cat.replace('_',' '))}</td>
        <td>${items.length} found</td>
        <td class="td-status"><i class="fa-solid fa-lock"></i> Masked</td>
      </tr>
    `).join('');

    let preview = '';
    if (maskedPrompt) {
      preview = `
        <div style="padding:10px 14px;border-top:1px solid var(--border-light);">
          <span class="pm-masked-label">Message sent to AI:</span>
          <div class="pm-masked-preview">${escHtml(maskedPrompt)}</div>
        </div>
      `;
    }

    return `
      <div class="privacy-scan-card" style="margin-top:8px;">
        <div class="psc-header">
          <i class="fa-solid fa-shield-halved"></i>
          <strong>🛡 Privacy Scan Complete</strong>
          <span class="psc-count">${total} protected</span>
        </div>
        <table class="psc-table">
          <thead><tr><th>Information</th><th>Count</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${preview}
        <div class="psc-footer">
          <i class="fa-solid fa-circle-check"></i>
          Privacy Status: Protected ✅
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────
  //  MARKDOWN FORMATTER
  // ─────────────────────────────────────────────
  function formatMarkdown(raw) {
    if (!raw) return '';

    // Escape HTML
    let t = raw
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');

    // Code blocks
    t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${code.trim()}</code></pre>`
    );

    // Inline code
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/_(.+?)_/g, '<em>$1</em>');

    // Headings
    t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    t = t.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule
    t = t.replace(/^---+$/gm, '<hr>');

    // Blockquotes
    t = t.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    t = t.replace(/(?:^[*\-] .+\n?)+/gm, match => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^[*\-] /,'')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    t = t.replace(/(?:^\d+\. .+\n?)+/gm, match => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /,'')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // Paragraphs
    const parts = t.split(/\n\n+/);
    t = parts.map(p => {
      p = p.trim();
      if (!p) return '';
      if (/^<(h[1-3]|ul|ol|pre|blockquote|hr)/.test(p)) return p;
      return `<p>${p.replace(/\n/g,'<br>')}</p>`;
    }).join('\n');

    // Read-more for very long responses
    const words = raw.split(/\s+/).length;
    if (words > 250) {
      const el = document.createElement('div');
      el.innerHTML = t;
      const paras = el.querySelectorAll('p,ul,ol,pre,h1,h2,h3');
      if (paras.length > 4) {
        const cutoff = 3;
        let hidden = '';
        paras.forEach((p, i) => { if (i >= cutoff) hidden += p.outerHTML; });
        for (let i = cutoff; i < paras.length; i++) paras[i].remove();
        const extra = `
          <div class="read-more-extra" id="rm-${Date.now()}">${hidden}</div>
          <span class="read-more-toggle" onclick="toggleReadMore(this)">
            <i class="fa-solid fa-chevron-down"></i> Read More
          </span>
        `;
        el.innerHTML += extra;
        return el.innerHTML;
      }
    }
    return t;
  }

  window.toggleReadMore = function(el) {
    const extra = el.previousElementSibling;
    const shown = extra.classList.toggle('shown');
    el.innerHTML = shown
      ? '<i class="fa-solid fa-chevron-up"></i> Show Less'
      : '<i class="fa-solid fa-chevron-down"></i> Read More';
  };

  // ─────────────────────────────────────────────
  //  TYPING INDICATOR
  // ─────────────────────────────────────────────
  function showTyping() { typingRow.classList.remove('hidden'); scrollToBottom(); }
  function hideTyping() { typingRow.classList.add('hidden'); }

  // ─────────────────────────────────────────────
  //  SCROLL TO BOTTOM
  // ─────────────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatViewport.scrollTo({top: chatViewport.scrollHeight, behavior: 'smooth'});
    });
  }

  // ─────────────────────────────────────────────
  //  PRIVACY MODAL
  // ─────────────────────────────────────────────
  let _onConfirm = null;

  function showPrivacyModal(data, onConfirm) {
    _onConfirm = onConfirm;
    const cats = Object.entries(data.findings || {});
    const total = cats.reduce((s,[,v]) => s + v.length, 0);

    let rows = cats.map(([cat,items]) => `
      <tr>
        <td class="pm-td-type">${ucFirst(cat.replace('_',' '))}</td>
        <td class="pm-td-count">${items.length} found</td>
        <td class="pm-td-status"><i class="fa-solid fa-lock"></i> Will be masked</td>
      </tr>
    `).join('');

    let preview = '';
    if (data.masked_prompt) {
      preview = `
        <div style="margin-top:12px;">
          <span class="pm-masked-label">Will be sent to AI as:</span>
          <div class="pm-masked-preview">${escHtml(data.masked_prompt)}</div>
        </div>
      `;
    }

    pmBody.innerHTML = `
      <div class="pm-findings-count">
        <i class="fa-solid fa-shield-halved"></i>
        ${total} sensitive detail${total !== 1 ? 's' : ''} detected
      </div>
      <table class="pm-findings-table">
        <thead><tr><th>Type</th><th>Count</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${preview}
    `;
    privacyModal.classList.remove('hidden');
  }

  function closePrivacyModal() { privacyModal.classList.add('hidden'); _onConfirm = null; }
  pmClose.addEventListener('click', closePrivacyModal);
  pmCancel.addEventListener('click', closePrivacyModal);
  privacyModal.addEventListener('click', e => { if(e.target===privacyModal) closePrivacyModal(); });
  pmSend.addEventListener('click', () => {
    closePrivacyModal();
    if (_onConfirm) _onConfirm();
  });

  // ─────────────────────────────────────────────
  //  FILE WARNING MODAL
  // ─────────────────────────────────────────────
  function showFileWarningModal(html) {
    fwBody.innerHTML = html;
    fileWarningModal.classList.remove('hidden');
  }
  fwClose.addEventListener('click', () => fileWarningModal.classList.add('hidden'));
  fwAck.addEventListener('click',   () => fileWarningModal.classList.add('hidden'));
  fileWarningModal.addEventListener('click', e => {
    if(e.target === fileWarningModal) fileWarningModal.classList.add('hidden');
  });

  // ─────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function ucFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function fmtTime(date) {
    return date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }

  // ─────────────────────────────────────────────
  //  CONTINUE FROM HISTORY (legacy sessionStorage)
  // ─────────────────────────────────────────────
  const savedContext = sessionStorage.getItem('continueContext');
  if (savedContext) {
    try {
      const ctx = JSON.parse(savedContext);
      sessionStorage.removeItem('continueContext');
      welcomeScreen.classList.add('hidden');
      ctx.forEach(msg => {
        if (msg.role === 'user') appendUserMessage(msg.content);
        else appendAiMessage(msg.content);
        currentHistory.push(msg);
      });
    } catch(e) {}
  }

});
