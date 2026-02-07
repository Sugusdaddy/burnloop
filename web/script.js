// ============================================
// BurnLoop - Professional Exchange Scripts
// ============================================

const CONFIG = {
    TOKEN_ADDRESS: '968zAsb2uRZhZAqpAJAt3khAEuK2KfZFMo9cAqKjpump',
    POOL_ADDRESS: 'AhJFcrmvk5thQvyCQut6YrPQDpvAXRo4oZUkH6y46nyv',
    REFRESH_INTERVAL: 30000,
    CHART_POINTS: 50
};

// State
let liveData = {
    price: 0.00005198,
    priceChange: 41.16,
    volume: 34000,
    liquidity: 18000,
    burned: 0
};

// ============================================
// API Functions
// ============================================

async function fetchLiveData() {
    try {
        const response = await fetch(
            `https://api.dexscreener.com/latest/dex/pairs/solana/${CONFIG.POOL_ADDRESS}`
        );
        const data = await response.json();
        
        if (data.pair) {
            liveData.price = parseFloat(data.pair.priceUsd) || liveData.price;
            liveData.priceChange = data.pair.priceChange?.h24 || liveData.priceChange;
            liveData.volume = data.pair.volume?.h24 || liveData.volume;
            liveData.liquidity = data.pair.liquidity?.usd || liveData.liquidity;
            
            updateUI();
        }
    } catch (error) {
        console.log('API fetch error:', error);
    }
}

// ============================================
// UI Update Functions
// ============================================

function updateUI() {
    // Update ticker
    updateElement('live-price', `$${liveData.price.toFixed(8)}`);
    updateElement('live-volume', formatCurrency(liveData.volume));
    updateElement('live-liquidity', formatCurrency(liveData.liquidity));
    
    // Update price change
    const priceChangeEl = document.getElementById('price-change');
    if (priceChangeEl) {
        const isPositive = liveData.priceChange >= 0;
        priceChangeEl.textContent = `${isPositive ? '+' : ''}${liveData.priceChange.toFixed(2)}%`;
        priceChangeEl.className = `ticker-change ${isPositive ? 'positive' : 'negative'}`;
    }
    
    // Update chart price
    updateElement('chart-price', `$${liveData.price.toFixed(8)}`);
    
    // Update stats
    updateElement('stat-liquidity', formatCurrency(liveData.liquidity));
    updateElement('stat-volume', formatCurrency(liveData.volume));
    updateElement('stat-mcap', formatCurrency(liveData.liquidity * 2.5)); // Rough estimate
}

function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatCurrency(value) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
}

// ============================================
// Burn Counter Simulation
// ============================================

let burnCounter = 0;
let burnInterval;

function startBurnCounter() {
    // Simulate gradual burn based on volume
    burnInterval = setInterval(() => {
        // Roughly 0.1% of volume gets burned per day
        // Simulate this with small increments
        const increment = Math.floor(Math.random() * 500) + 100;
        burnCounter += increment;
        
        updateElement('total-burned', formatNumber(burnCounter));
        updateElement('stat-burned', formatNumber(burnCounter));
    }, 3000);
}

function formatNumber(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

// ============================================
// Trading Demo Interactions
// ============================================

function initTradingDemo() {
    // Tab switching
    const tabs = document.querySelectorAll('.order-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const side = tab.dataset.side;
            const button = document.getElementById('place-order');
            if (button) {
                if (side === 'long') {
                    button.textContent = 'Open Long Position';
                    button.className = 'btn btn-large btn-long';
                } else {
                    button.textContent = 'Open Short Position';
                    button.className = 'btn btn-large btn-short';
                }
            }
        });
    });
    
    // Leverage slider
    const leverageSlider = document.getElementById('leverage-slider');
    const leverageValue = document.getElementById('leverage-value');
    const collateralInput = document.getElementById('collateral-input');
    const positionSize = document.getElementById('position-size');
    const liqPrice = document.getElementById('liq-price');
    
    function updatePosition() {
        const leverage = parseInt(leverageSlider?.value || 5);
        const collateral = parseFloat(collateralInput?.value || 1000);
        
        if (leverageValue) leverageValue.textContent = leverage;
        if (positionSize) positionSize.textContent = `${(collateral * leverage).toLocaleString()} BURN`;
        
        // Calculate rough liquidation price
        const liqPriceValue = liveData.price * (1 - (1 / leverage) * 0.8);
        if (liqPrice) liqPrice.textContent = `$${liqPriceValue.toFixed(8)}`;
        
        // Update trading fee
        const fee = Math.floor(collateral * leverage * 0.001);
        const feeEl = document.querySelector('.burn-text');
        if (feeEl) feeEl.textContent = `🔥 ${fee} BURN`;
    }
    
    if (leverageSlider) {
        leverageSlider.addEventListener('input', updatePosition);
    }
    
    if (collateralInput) {
        collateralInput.addEventListener('input', updatePosition);
    }
    
    // Leverage presets
    const presets = document.querySelectorAll('.preset-btn');
    presets.forEach(preset => {
        preset.addEventListener('click', () => {
            presets.forEach(p => p.classList.remove('active'));
            preset.classList.add('active');
            
            const leverage = preset.dataset.leverage;
            if (leverageSlider) {
                leverageSlider.value = leverage;
                updatePosition();
            }
        });
    });
    
    // Place order button (demo)
    const placeOrderBtn = document.getElementById('place-order');
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Show demo notification
            placeOrderBtn.textContent = '⏳ Processing...';
            placeOrderBtn.disabled = true;
            
            setTimeout(() => {
                placeOrderBtn.textContent = '✓ Demo Order Placed!';
                
                setTimeout(() => {
                    const isLong = document.querySelector('.order-tab.active')?.dataset.side === 'long';
                    placeOrderBtn.textContent = isLong ? 'Open Long Position' : 'Open Short Position';
                    placeOrderBtn.disabled = false;
                }, 1500);
            }, 1000);
        });
    }
    
    // Initial update
    updatePosition();
}

// ============================================
// Chart Simulation
// ============================================

function initChart() {
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    
    // Set canvas size
    function resizeCanvas() {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        drawChart();
    }
    
    // Generate random price data
    let priceData = [];
    const basePrice = liveData.price;
    
    for (let i = 0; i < CONFIG.CHART_POINTS; i++) {
        const variation = (Math.random() - 0.5) * 0.3;
        priceData.push(basePrice * (1 + variation));
    }
    
    function drawChart() {
        const width = canvas.width;
        const height = canvas.height;
        const padding = 20;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Calculate min/max
        const min = Math.min(...priceData) * 0.95;
        const max = Math.max(...priceData) * 1.05;
        const range = max - min;
        
        // Draw gradient area
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(255, 87, 34, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 87, 34, 0)');
        
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        
        priceData.forEach((price, i) => {
            const x = padding + (i / (priceData.length - 1)) * (width - padding * 2);
            const y = height - padding - ((price - min) / range) * (height - padding * 2);
            
            if (i === 0) {
                ctx.lineTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.lineTo(width - padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw line
        ctx.beginPath();
        priceData.forEach((price, i) => {
            const x = padding + (i / (priceData.length - 1)) * (width - padding * 2);
            const y = height - padding - ((price - min) / range) * (height - padding * 2);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw current price dot
        const lastPrice = priceData[priceData.length - 1];
        const lastX = width - padding;
        const lastY = height - padding - ((lastPrice - min) / range) * (height - padding * 2);
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5722';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 87, 34, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Update chart with new data point
    function updateChart() {
        const variation = (Math.random() - 0.5) * 0.1;
        const lastPrice = priceData[priceData.length - 1];
        const newPrice = lastPrice * (1 + variation);
        
        priceData.shift();
        priceData.push(newPrice);
        
        drawChart();
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Animate chart
    setInterval(updateChart, 2000);
}

// ============================================
// Copy Address
// ============================================

function copyAddress() {
    navigator.clipboard.writeText(CONFIG.TOKEN_ADDRESS).then(() => {
        const btn = document.querySelector('.copy-btn');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`;
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 2000);
        }
    });
}

// ============================================
// Smooth Scroll
// ============================================

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ============================================
// Scroll Animations
// ============================================

function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    // Observe elements
    const elements = document.querySelectorAll(
        '.loop-step, .feature-card, .stat-card, .timeline-item'
    );
    
    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
    
    // Add visible class styles
    const style = document.createElement('style');
    style.textContent = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔥 BurnLoop Exchange Loading...');
    
    // Fetch initial data
    fetchLiveData();
    
    // Start periodic updates
    setInterval(fetchLiveData, CONFIG.REFRESH_INTERVAL);
    
    // Initialize components
    initTradingDemo();
    initChart();
    initSmoothScroll();
    initScrollAnimations();
    startBurnCounter();
    
    console.log('🔥 BurnLoop Exchange Ready!');
});

// Make copyAddress available globally
window.copyAddress = copyAddress;
