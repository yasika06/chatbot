document.addEventListener('DOMContentLoaded', () => {
    // always use light theme on history page; disable toggle
    document.documentElement.setAttribute('data-theme', 'light');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.style.display = 'none';
    }

    const historyList = document.getElementById('historyList');
    const unlockBtn = document.getElementById('unlockBtn');
    const historyPwd = document.getElementById('historyPwd');
    const historyMessage = document.getElementById('historyMessage');

    const currentPwd = document.getElementById('currentPwd');
    const newPwd = document.getElementById('newPwd');
    const changePwdBtn = document.getElementById('changePwdBtn');
    const pwdMsg = document.getElementById('pwdMsg');

    async function loadHistory(password = null) {
        let url = '/api/history';
        if (password) {
            url += '?password=' + encodeURIComponent(password);
        }
        const res = await fetch(url);
        const data = await res.json();
        renderHistory(data.history, data.showing_sensitive);
    }

    function renderHistory(entries, sensitiveUnlocked) {
        historyList.innerHTML = '';
        if (entries.length === 0) {
            historyList.innerHTML = '<p>No history available.</p>';
            return;
        }
        entries.forEach(e => {
            const div = document.createElement('div');
            // add class for styling based on flags
            let classes = ['history-entry'];
            if (e.sensitive) classes.push('sensitive-entry');
            if (e.user_locked) classes.push('locked-entry');
            div.className = classes.join(' ');

            // badges for sensitive/locked
            let badges = '';
            if (e.sensitive) badges += '<span class="badge sensitive">Sensitive</span>';
            if (e.user_locked) badges += '<span class="badge locked">Locked</span>';

            let lockIcon = e.user_locked ? 'fa-lock-open' : 'fa-lock';
            let continueBtn = `<button class="btn-continue" data-id="${e.id}" data-prompt="${encodeURIComponent(e.original_prompt)}" data-response="${encodeURIComponent(e.response)}"><i class="fa-solid fa-comment-dots"></i> Continue</button>`;
            let lockBtn = `<button class="btn-lock" data-id="${e.id}" data-locked="${e.user_locked}"><i class="fa-solid ${lockIcon}"></i> ${e.user_locked ? 'Unlock' : 'Lock'}</button>`;
            let deleteBtn = `<button class="btn-delete" data-id="${e.id}"><i class="fa-solid fa-trash"></i> Delete</button>`;

            div.innerHTML = `
                <div class="entry-timestamp">${e.timestamp}</div>
                <div class="entry-badges">${badges}</div>
                <div><strong>Prompt:</strong> ${e.original_prompt}</div>
                <div><strong>Response:</strong> ${e.response}</div>
                <div><strong>Masked:</strong> ${e.masked_prompt}</div>
                <div class="history-entry-controls">${continueBtn} ${lockBtn} ${deleteBtn}</div>
                <hr>`;
            historyList.appendChild(div);
        });
        if (!sensitiveUnlocked) {
            historyMessage.textContent = 'Sensitive entries are hidden.';
        } else {
            historyMessage.textContent = '';
        }
    }

    unlockBtn.addEventListener('click', () => {
        loadHistory(historyPwd.value);
    });

    const clearAllBtn = document.getElementById('clearAllBtn');
    clearAllBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete all history? This will also delete any stored uploaded files.')) return;
        
        // Delete history
        const res = await fetch('/api/history/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: historyPwd.value })
        });
        
        if (res.ok) {
            // Also explicitly delete stored files when clearing all history
            await fetch('/api/files/delete', { method: 'POST' });
            loadHistory(historyPwd.value);
        }
    });

    // clear all files
    const clearFilesBtn = document.getElementById('clearFilesBtn');
    if (clearFilesBtn) {
        clearFilesBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to completely delete all stored (uploaded and encrypted) files? This cannot be undone.')) return;
            const res = await fetch('/api/files/delete', { method: 'POST' });
            if (res.ok) {
                alert('All stored files have been securely deleted from the server.');
            } else {
                alert('Failed to delete files. Check server logs.');
            }
        });
    }

    // delegate lock/unlock/delete actions
    historyList.addEventListener('click', async (e) => {
        let lockBtn = e.target.closest('.btn-lock');
        let deleteBtn = e.target.closest('.btn-delete');
        let continueBtn = e.target.closest('.btn-continue');
        
        if (continueBtn) {
            const promptContext = decodeURIComponent(continueBtn.dataset.prompt);
            const responseContext = decodeURIComponent(continueBtn.dataset.response);
            const entryId = parseInt(continueBtn.dataset.id);
            
            const historyContext = [
                { role: 'user', content: promptContext, id: entryId },
                { role: 'assistant', content: responseContext, id: entryId }
            ];
            
            sessionStorage.setItem('continueContext', JSON.stringify(historyContext));
            window.location.href = '/';
        } else if (lockBtn) {
            const id = lockBtn.dataset.id;
            const locked = lockBtn.dataset.locked === 'true';
            const res = await fetch('/api/history/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(id), lock: !locked })
            });
            if (res.ok) {
                loadHistory(historyPwd.value);
            }
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            if (confirm('Are you sure you want to delete this entry?')) {
                try {
                    const res = await fetch(`/delete/${id}`, {
                        method: 'DELETE'
                    });
                    
                    const result = await res.json();
                    
                    if (res.ok && result.status === 'success') {
                        alert(result.message || 'Chat entry successfully deleted!');
                        
                        // Dynamically remove item
                        const itemDiv = deleteBtn.closest('.history-entry');
                        if (itemDiv) {
                            itemDiv.remove();
                        } else {
                            loadHistory(historyPwd.value);
                        }
                    } else {
                        alert('Error: ' + (result.message || 'Failed to delete'));
                    }
                } catch (err) {
                    alert('Error occurred while deleting: ' + err.message);
                }
            }
        }
    });

    changePwdBtn.addEventListener('click', async () => {
        const cur = currentPwd.value;
        const nw = newPwd.value;
        if (!nw) return;
        const res = await fetch('/api/history/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: cur, new_password: nw })
        });
        const data = await res.json();
        if (res.ok) {
            pwdMsg.textContent = 'Password updated';
            currentPwd.value = '';
            newPwd.value = '';
        } else {
            pwdMsg.textContent = data.error || 'Failed';
            pwdMsg.style.color = '#ef4444';
        }
    });

    loadHistory();
});