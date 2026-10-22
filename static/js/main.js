document.addEventListener('DOMContentLoaded', () => {
    // ── Theme Toggle ──
    const themeToggleBtn = document.getElementById('themeToggle');
    const root = document.documentElement;
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        root.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    }

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = root.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        const icon = themeToggleBtn.querySelector('i');
        const text = themeToggleBtn.querySelector('span');
        if (theme === 'dark') {
            icon.className = 'fa-solid fa-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'fa-solid fa-moon';
            text.textContent = 'Dark Mode';
        }
    }

    // ── Elements ──
    const chatForm = document.getElementById('chatForm');
    const promptInput = document.getElementById('promptInput');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    const fileInput = document.getElementById('fileInput');
    const clearChatBtn = document.getElementById('clearChatBtn');
    const privacyModeToggle = document.getElementById('privacyModeToggle');
    const maskPreviewBox = document.getElementById('maskPreviewBox');
    const maskPreviewText = document.getElementById('maskPreviewText');
    const welcomeState = document.getElementById('welcomeState');
    
    // ── Clear Chat ──
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Clear chat and remove from history?')) {
                const idsToDelete = currentChatHistory.filter(msg => msg.id).map(msg => msg.id);
                const uniqueIds = [...new Set(idsToDelete)];
                uniqueIds.forEach(id => {
                    fetch('/api/history/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: parseInt(id) })
                    });
                });

                currentChatHistory = [];
                chatMessages.innerHTML = '';
                // Re-add welcome state
                chatMessages.innerHTML = `
                    <div class="welcome-container" id="welcomeState">
                        <div class="welcome-icon">
                            <i class="fa-solid fa-shield-halved"></i>
                        </div>
                        <h2>AI PrivacyShield</h2>
                        <p>Chat cleared! Ask me anything — I'm ready to help.</p>
                        <div class="welcome-features">
                            <div class="welcome-chip"><i class="fa-solid fa-brain"></i> Ask Anything</div>
                            <div class="welcome-chip"><i class="fa-solid fa-lock"></i> Auto PII Masking</div>
                            <div class="welcome-chip"><i class="fa-solid fa-code"></i> Code Help</div>
                            <div class="welcome-chip"><i class="fa-solid fa-file-shield"></i> File Encryption</div>
                        </div>
                    </div>`;
                sessionStorage.removeItem('continueContext');
            }
        });
    }
    
    // ── Modal Elements ──
    const warningModal = document.getElementById('warningModal');
    const closeWarningBtn = document.getElementById('closeWarningBtn');
    const warningBody = document.getElementById('warningBody');

    let currentChatHistory = [];
    
    // ── Continue Conversation ──
    const savedContext = sessionStorage.getItem('continueContext');
    if (savedContext) {
        try {
            const historyContext = JSON.parse(savedContext);
            sessionStorage.removeItem('continueContext');
            
            // Hide welcome state
            if (welcomeState) welcomeState.style.display = 'none';
            
            historyContext.forEach(msg => {
                const sender = msg.role === 'user' ? 'user' : 'ai';
                appendMessage(sender, msg.content);
                currentChatHistory.push(msg);
            });
            
            appendMessage('ai', '💬 Context loaded from history. Continue your conversation below.');
        } catch (e) {
            console.error("Failed to parse continue context", e);
        }
    }

    // ── Auto-resize & Live Mask Preview ──
    let maskTimeout = null;
    let currentMaskedPreview = "";

    promptInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
        
        const text = this.value.trim();
        if (!text) {
            maskPreviewBox.classList.add('hidden');
            currentMaskedPreview = "";
            return;
        }

        clearTimeout(maskTimeout);
        maskTimeout = setTimeout(async () => {
            try {
                const res = await fetch('/api/mask', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({text: text, privacy_mode: privacyModeToggle.value})
                });
                const data = await res.json();
                currentMaskedPreview = data.masked_text;
                if (currentMaskedPreview !== text) {
                    maskPreviewText.innerText = currentMaskedPreview;
                    maskPreviewBox.classList.remove('hidden');
                } else {
                    maskPreviewBox.classList.add('hidden');
                }
            } catch (e) {
                console.error('Error fetching mask preview', e);
            }
        }, 300);
    });

    // ── Submit on Enter ──
    promptInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.value.trim()) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // ── Handle Chat Submit ──
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const text = promptInput.value.trim();
        if (!text) return;
        
        // Hide welcome state on first message
        const ws = document.getElementById('welcomeState');
        if (ws) ws.style.display = 'none';
        
        promptInput.value = '';
        promptInput.style.height = 'auto';
        maskPreviewBox.classList.add('hidden');
        
        // Get masked version for UI display
        let finalMasked = text;
        try {
            const mRes = await fetch('/api/mask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({text: text, privacy_mode: privacyModeToggle.value})
            });
            const mData = await mRes.json();
            finalMasked = mData.masked_text || text;
        } catch (err) {}
        
        appendMessage('user', finalMasked);
        
        typingIndicator.classList.remove('hidden');
        scrollToBottom();

        const sendChat = async (confirm = false) => {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text, history: currentChatHistory, confirm: confirm, privacy_mode: privacyModeToggle.value })
            });
            return res;
        };

        try {
            let response = await sendChat(false);
            let data = await response.json();

            if (!response.ok && data.warning === 'sensitive_detected') {
                showConfirmModal(data, async () => {
                    appendMessage('ai', '🔒 Sensitive data detected — sending masked version.');
                    typingIndicator.classList.remove('hidden');
                    const resp2 = await sendChat(true);
                    const dat2 = await resp2.json();
                    typingIndicator.classList.add('hidden');
                    if (dat2.findings && Object.keys(dat2.findings).length > 0) {
                        appendMessage('ai', dat2.response, dat2.findings, dat2.risk_score, dat2.masked_prompt);
                    } else {
                        appendMessage('ai', dat2.response);
                    }
                    
                    currentChatHistory.push({ role: 'user', content: finalMasked, id: dat2.id });
                    currentChatHistory.push({ role: 'assistant', content: dat2.response, id: dat2.id });
                });
            } else {
                typingIndicator.classList.add('hidden');
                
                if (data.findings && Object.keys(data.findings).length > 0) {
                    appendMessage('ai', data.response, data.findings, data.risk_score, data.masked_prompt);
                } else {
                    appendMessage('ai', data.response);
                }
                
                currentChatHistory.push({ role: 'user', content: finalMasked, id: data.id });
                currentChatHistory.push({ role: 'assistant', content: data.response, id: data.id });
            }
            
        } catch (error) {
            typingIndicator.classList.add('hidden');
            appendMessage('ai', 'Sorry, I encountered an error. Please try again.');
            console.error(error);
        }
    });

    // ── Handle File Upload ──
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Hide welcome state
        const ws = document.getElementById('welcomeState');
        if (ws) ws.style.display = 'none';
        
        appendMessage('user', `📎 Uploading: ${file.name}`);
        typingIndicator.classList.remove('hidden');
        scrollToBottom();
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('privacy_mode', privacyModeToggle ? privacyModeToggle.value : 'partial');
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            typingIndicator.classList.add('hidden');
            
            if (data.error) {
                appendMessage('ai', `❌ Upload failed: ${data.error}`);
            } else {
                let msg = `✅ **${data.filename}** processed successfully.`;
                
                if (data.encrypted) {
                    msg += `\n\n⚠️ **Security Alert**: Sensitive data detected in your file.`;
                    msg += `\nThe file has been **encrypted** to protect your privacy.`;
                    msg += `\n🔒 **Encrypted File**: ${data.encrypted_filename}`;
                    msg += `\n🔑 **Password**: \`${data.password}\``;
                            
                    showWarningModal(`Sensitive information detected in <strong>${file.name}</strong>. The file has been automatically encrypted. Please save your generated password.`);
                }
                
                appendMessage('ai', msg, data.findings, data.risk_score);
            }
        } catch (error) {
            typingIndicator.classList.add('hidden');
            appendMessage('ai', 'Sorry, an error occurred during file upload.');
            console.error(error);
        }
        
        fileInput.value = '';
    });

    // ── Format AI text with markdown-like rendering ──
    function formatText(text) {
        // Escape HTML first
        let formatted = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Code blocks (```)
        formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        
        // Line breaks to paragraphs
        const paragraphs = formatted.split(/\n\n+/);
        if (paragraphs.length > 1) {
            formatted = paragraphs.map(p => {
                if (p.startsWith('<pre>')) return p;
                // Handle bullet points within a paragraph
                const lines = p.split('\n');
                const processed = lines.map(line => {
                    if (/^[\-\*]\s/.test(line)) {
                        return line;
                    }
                    return line;
                }).join('\n');
                return `<p>${processed}</p>`;
            }).join('');
        }
        
        // Handle bullet lists
        formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Handle numbered lists
        formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
        
        // Single newlines to <br>
        formatted = formatted.replace(/(?<!<\/p>|<\/pre>|<\/li>|<\/ul>|<\/ol>)\n(?!<p|<pre|<li|<ul|<ol)/g, '<br>');
        
        return formatted;
    }

    // ── Append Message (ChatGPT-style layout) ──
    function appendMessage(sender, text, findings = null, riskScore = 'Low', maskedPrompt = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        
        const iconHtml = sender === 'user' 
            ? '<i class="fa-solid fa-user"></i>' 
            : '<i class="fa-solid fa-shield-halved"></i>';
        
        let formattedText = sender === 'ai' ? formatText(text) : `<p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
        
        let contentHtml = formattedText;
        
        // Findings box for PII detection
        if (sender === 'ai' && findings && Object.keys(findings).length > 0) {
            let findingsHtml = `<div class="findings-box">
                <span class="risk-badge risk-${riskScore}">Risk: ${riskScore}</span>
                <p style="font-size: 0.82rem; margin-bottom: 8px; color: var(--warning);">⚠️ Sensitive data detected and masked before sending</p>
                <div style="font-size: 0.82rem;">`;
                
            for (const [category, items] of Object.entries(findings)) {
                findingsHtml += `<div class="finding-item"><strong>${category}:</strong> ${items.length} instance(s) found</div>`;
            }
            
            if (maskedPrompt) {
                findingsHtml += `<div style="margin-top:8px; padding-top:8px; border-top: 1px solid rgba(245, 158, 11, 0.15);">
                    <strong>Sent as:</strong>
                    <span style="color: var(--text-secondary); font-style: italic;"> "${maskedPrompt}"</span>
                </div>`;
            }
            
            findingsHtml += `</div></div>`;
            contentHtml += findingsHtml;
        }

        if (sender === 'ai') {
            // AI messages get full-width background treatment (like ChatGPT)
            msgDiv.innerHTML = `
                <div class="message-inner">
                    <div class="avatar">${iconHtml}</div>
                    <div class="content">${contentHtml}</div>
                </div>`;
        } else {
            // User messages
            msgDiv.innerHTML = `
                <div class="avatar">${iconHtml}</div>
                <div class="content">${contentHtml}</div>`;
        }
        
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // ── Modal Logic ──
    function showWarningModal(message) {
        warningBody.innerHTML = `<p>${message}</p>`;
        document.getElementById('confirmBtn').classList.add('hidden');
        document.getElementById('cancelBtn').classList.add('hidden');
        const acknowledgeBtnEl = document.getElementById('acknowledgeBtn');
        if (acknowledgeBtnEl) acknowledgeBtnEl.classList.remove('hidden');
        warningModal.classList.remove('hidden');
    }

    function showConfirmModal(data, onConfirm) {
        let html = `<p style="margin-bottom:12px;">⚠️ Sensitive data was detected in your message:</p>`;
        html += `<div style="font-size:0.88rem;">`;
        for (const [cat, items] of Object.entries(data.findings)) {
            html += `<div style="margin-bottom:4px;"><strong style="text-transform:capitalize;">${cat}:</strong> ${items.length} instance(s)</div>`;
        }
        html += `</div>`;
        if (data.masked_prompt) {
            html += `<p style="margin-top:12px; padding:10px; background: var(--bg-app); border-radius: var(--radius-sm); font-size:0.88rem;"><strong>Will be sent as:</strong><br><em style="color:var(--text-secondary);">"${data.masked_prompt}"</em></p>`;
        }
        warningBody.innerHTML = html;
        
        document.getElementById('confirmBtn').classList.remove('hidden');
        document.getElementById('cancelBtn').classList.remove('hidden');
        const acknowledgeBtnEl = document.getElementById('acknowledgeBtn');
        if (acknowledgeBtnEl) acknowledgeBtnEl.classList.add('hidden');
        warningModal.classList.remove('hidden');

        const confirmHandler = () => {
            hideModal();
            onConfirm();
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
        };
        const cancelHandler = () => {
            hideModal();
        };
        const confirmBtn = document.getElementById('confirmBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
    }

    const hideModal = () => warningModal.classList.add('hidden');
    closeWarningBtn.addEventListener('click', hideModal);
    const acknowledgeBtnElement = document.getElementById('acknowledgeBtn');
    if (acknowledgeBtnElement) acknowledgeBtnElement.addEventListener('click', hideModal);
    
});
