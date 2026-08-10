        function generateSafeId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

        const APP_VERSION = '1.2.0';

        let groupData = [];
        let imageUrlData = {};
        
        let currentManageBatch = 'all';
        let currentSearchKeyword = ''; 
        
        window.scheduleSteps = {};
        window.scheduleCols = {}; 

        let currentEditImageKey = '';
        let currentUser = null;
        let resetTargetEmail = ''; 
        let registerTargetEmail = ''; 
        let draggedItemRowId = null;
        let dismissedReqIds = new Set();

        function showLoading(text="处理中...") { document.getElementById('loadingText').innerText=text; document.getElementById('globalLoading').classList.remove('hidden'); }
        function hideLoading() { document.getElementById('globalLoading').classList.add('hidden'); }
        function showScreen(screenId) {
            ['portal-screen', 'buyer-screen', 'shipping-apply-screen', 'payment-apply-screen', 'login-screen', 'register-screen', 'verify-signup-screen', 'forgot-screen', 'reset-screen', 'dashboard-screen', 'rank-screen', 'about-screen'].forEach(id => {
                let el = document.getElementById(id);
                if(el) el.classList.add('hidden');
            });
            document.getElementById(screenId).classList.remove('hidden');
        }

        // P6: 黑夜模式 — 初始化/切换
        window.initTheme = function() {
            const saved = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDark = saved === 'dark' || (!saved && prefersDark);
            document.documentElement.classList.toggle('dark', isDark);
            updateThemeIcon();
        };
        window.toggleTheme = function() {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateThemeIcon();
        };
        function updateThemeIcon() {
            const btn = document.getElementById('themeToggleBtn');
            if (btn) btn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
        }
        initTheme(); // 立即初始化（core.js 在 body 末尾加载，DOM 已就绪）

        // P12: 功能开关检测 — 默认开启（缺省 = true）
        window.isFeatureEnabled = function(name) {
            const config = JSON.parse(imageUrlData['__APP_CONFIG__'] || '{}');
            return config.features?.[name] !== false;
        };

        // P15: 应用自定义背景（支持纯色/图片+自动遮罩）
        window.applyBackground = function() {
            const config = JSON.parse(imageUrlData['__APP_CONFIG__'] || '{}');
            const bgType = config.bgType || 'none';
            const body = document.body;
            body.style.backgroundImage = '';
            body.style.backgroundColor = '';
            body.classList.remove('has-custom-bg');

            if (bgType === 'color' && config.bgColor) {
                body.style.backgroundColor = config.bgColor;
            } else if (bgType === 'image' && config.bgUrl) {
                body.style.backgroundImage = `url(${config.bgUrl})`;
                body.style.backgroundSize = 'cover';
                body.style.backgroundPosition = 'center';
                body.style.backgroundAttachment = 'fixed';
                body.classList.add('has-custom-bg');
                const opacity = config.bgOpacity || 0.4;
                document.documentElement.style.setProperty('--bg-overlay-opacity', opacity);
            }
        };

        // XSS 防护：转义 HTML 特殊字符
        function escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(String(str)));
            return div.innerHTML;
        }

        function showToast(msg, type = 'info') {
            const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
            const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
            const toast = document.createElement('div');
            toast.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg fade-in text-sm font-bold flex items-center gap-2`;
            toast.style.cssText = 'position:fixed; top:1rem; right:1rem; z-index:9999; max-width:20rem;';
            toast.textContent = `${icons[type] || icons.info} ${msg}`;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function updateSyncStatus(status) {
            const statusEl = document.getElementById('syncStatusText');
            if(!statusEl) return;
            if(status === 'saving') {
                statusEl.innerHTML = '⏳ 正在保存...';
                statusEl.className = 'text-yellow-600 font-bold flex items-center gap-1 text-sm';
            } else if(status === 'saved') {
                statusEl.innerHTML = '☁️ 云端已同步';
                statusEl.className = 'text-green-500 font-bold flex items-center gap-1 text-sm';
            } else if(status === 'error') {
                statusEl.innerHTML = '❌ 同步失败';
                statusEl.className = 'text-red-500 font-bold flex items-center gap-1 text-sm';
            }
        }
