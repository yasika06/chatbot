document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle
    const themeToggleBtn = document.getElementById('themeToggle');
    const root = document.documentElement;
    
    // Check local storage for theme
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

    // Elements
    const chatForm = document.getElementById('chatForm');
    const promptInput = document.getElementById('promptInput');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    const fileInput = document.getElementById('fileInput');
    const clearChatBtn = document.getElementById('clearChatBtn');
    const privacyModeToggle = document.getElementById('privacyModeToggle');
    const maskPreviewBox = document.getElementById('maskPreviewBox');
    const maskPreviewText = document.getElementById('maskPreviewText');
    
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete the current chat? This will remove these messages from your history as well.')) {
                // Delete from backend history DB
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
                chatMessages.innerHTML = `
                    <div class="message ai-message">
                        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
                        <div class="content">
                            <p>Chat cleared! How can I help you today?</p>
                        </div>
                    </div>`;
                sessionStorage.removeItem('continueContext');
            }
        });
    }
    
    // Modal Elements
    const warningModal = document.getElementById('warningModal');
    const closeWarningBtn = document.getElementById('closeWarningBtn');
    const acknowledgeBtn = document.getElementById('acknowledgeBtn');
    const warningBody = document.getElementById('warningBody');

    let currentChatHistory = [];
    
    // Check if we are continuing a conversation
    const savedContext = sessionStorage.getItem('continueContext');
    if (savedContext) {
        try {
            const historyContext = JSON.parse(savedContext);
            sessionStorage.removeItem('continueContext');
            
            // Render the old messages to the UI and save to local state
            historyContext.forEach(msg => {
                const sender = msg.role === 'user' ? 'user' : 'ai';
                appendMessage(sender, msg.content);
                currentChatHistory.push(msg);
            });
            
            appendMessage('ai', '💬 Context loaded from history. You can continue the conversation below.');
        } catch (e) {
            console.error("Failed to parse continue context", e);
        }
    }

    // Auto-resize textarea and handle real-time mask preview
    let maskTimeout = null;
    let currentMaskedPreview = "";

    promptInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
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

    // Submit on Enter (Shift+Enter for new line)
    promptInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.value.trim()) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // Handle Chat Submit
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const text = promptInput.value.trim();
        if (!text) return;
        
        // Reset input immediately
        promptInput.value = '';
        promptInput.style.height = 'auto';
        maskPreviewBox.classList.add('hidden');
        
        // Front-end fetch to get the masked version for instant UI display
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
        
        // Add only the masked user message to UI instantly
        appendMessage('user', finalMasked);
        
        // Show typing indicator
        typingIndicator.classList.remove('hidden');
        scrollToBottom();

        // wrapper to actually send the chat request
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

            // if server warns about sensitive data, show confirmation modal
            if (!response.ok && data.warning === 'sensitive_detected') {
                showConfirmModal(data, async () => {
                    // user chose to proceed
                    // append details to chat so they know what was sent
                    appendMessage('ai', '🔒 Sensitive information detected, sending masked prompt.');
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
                // Hide typing indicator
                typingIndicator.classList.add('hidden');
                
                // Handle findings visually if any
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
            appendMessage('ai', 'Sorry, I encountered an error communicating with the server.');
            console.error(error);
        }
    });

    // Handle File Upload
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        appendMessage('user', `📄 Uploading file: ${file.name}`);
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
                let msg = `✅ File **${data.filename}** processed successfully.`;
                
                if (data.encrypted) {
                    msg += `<br><br>⚠️ **Security Alert**: Sensitive data was detected in your file. 
                            <br>The file has been encrypted to protect your privacy.
                            <br>🔒 **New File**: ${data.encrypted_filename}
                            <br>🔑 **Password**: <code>${data.password}</code>`;
                            
                    // Show Modal Warning
                    showWarningModal(`We detected sensitive information in your uploaded file (<strong>${file.name}</strong>). To protect your privacy, we have automatically encrypted it on our server. Please save your generated password.`);
                }
                
                appendMessage('ai', msg, data.findings, data.risk_score);
            }
        } catch (error) {
            typingIndicator.classList.add('hidden');
            appendMessage('ai', 'Sorry, an error occurred during file upload.');
            console.error(error);
        }
        
        // Reset file input
        fileInput.value = '';
    });

    function appendMessage(sender, text, findings = null, riskScore = 'Low', maskedPrompt = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        
        let iconHtml = sender === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
        
        // Parse basic markdown-like syntax for bold and code
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code style="background:#e2e8f0;padding:2px 4px;border-radius:4px;color:#ef4444;">$1</code>');
        
        let contentHtml = `<p>${formattedText}</p>`;
        
        // If AI detected PII, add the findings box
        if (sender === 'ai' && findings && Object.keys(findings).length > 0) {
            let findingsHtml = `<div class="findings-box">
                <span class="risk-badge risk-${riskScore}">Risk Score: ${riskScore}</span>
                <p style="font-size: 0.8rem; margin-bottom: 0.5rem; color: #b45309;">⚠️ Sensitive information detected, message masked before sending</p>
                <div style="font-size: 0.8rem;">`;
                
            for (const [category, items] of Object.entries(findings)) {
                findingsHtml += `<div class="finding-item"><strong>${category}:</strong> Found ${items.length} instance(s)</div>`;
            }
            
            if (maskedPrompt) {
                 findingsHtml += `<div style="margin-top:0.5rem; padding-top:0.5rem; border-top: 1px solid rgba(245, 158, 11, 0.2);">
                    <strong>Masked Input Sent:</strong>
                    <p style="color: #4b5563; font-style: italic; margin-top:0.25rem;">"${maskedPrompt}"</p>
                 </div>`;
            }
            
            findingsHtml += `</div></div>`;
            contentHtml += findingsHtml;
        }

        msgDiv.innerHTML = `
            <div class="avatar">${iconHtml}</div>
            <div class="content">${contentHtml}</div>
        `;
        
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Modal logic
    function showWarningModal(message) {
        warningBody.innerHTML = `<p>${message}</p>`;
        // hide confirm/cancel buttons in this mode
        document.getElementById('confirmBtn').classList.add('hidden');
        document.getElementById('cancelBtn').classList.add('hidden');
        document.getElementById('acknowledgeBtn')?.classList?.remove('hidden');
        warningModal.classList.remove('hidden');
    }

    function showConfirmModal(data, onConfirm) {
        // data contains findings, risk_score, masked_prompt
        let html = `<p>⚠️ Sensitive data was detected in your message.</p>`;
        html += `<div style="font-size:0.9rem; margin-top:0.5rem;">`;
        for (const [cat, items] of Object.entries(data.findings)) {
            html += `<div><strong>${cat}:</strong> ${items.length} instance(s)</div>`;
        }
        html += `</div>`;
        if (data.masked_prompt) {
            html += `<p style="margin-top:0.5rem;"><strong>Masked text:</strong> <em>${data.masked_prompt}</em></p>`;
        }
        html += `<p style="margin-top:0.5rem;">Do you want to send this masked version to the AI?</p>`;
        warningBody.innerHTML = html;
        // show confirm/cancel buttons
        document.getElementById('confirmBtn').classList.remove('hidden');
        document.getElementById('cancelBtn').classList.remove('hidden');
        document.getElementById('acknowledgeBtn')?.classList?.add('hidden');
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
    // existing acknowledgeBtn may not exist now, but if present
    const acknowledgeBtnElement = document.getElementById('acknowledgeBtn');
    if (acknowledgeBtnElement) acknowledgeBtnElement.addEventListener('click', hideModal);
    
});
