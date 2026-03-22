document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('themeToggle');
    const root = document.documentElement;
    
    // Check local storage for theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        root.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = root.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if(!themeToggleBtn) return;
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

    // Fetch Stats
    async function loadStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            // Animate counters
            animateValue('stat-prompts', 0, data.prompts_scanned || 0, 1000);
            animateValue('stat-sensitive', 0, data.sensitive_prompts_detected || 0, 1000);
            animateValue('stat-files', 0, data.files_uploaded || 0, 1000);
            animateValue('stat-encrypted', 0, data.files_encrypted || 0, 1000);
            
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    function animateValue(id, start, end, duration) {
        if (start === end) {
            document.getElementById(id).textContent = end;
            return;
        }
        
        const obj = document.getElementById(id);
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.textContent = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.textContent = end;
            }
        };
        
        window.requestAnimationFrame(step);
    }

    // Load stats initially
    loadStats();
    
    // Refresh stats every 10 seconds
    setInterval(loadStats, 10000);
});
