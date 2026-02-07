// BurnLoop Website Scripts

// Token address
const TOKEN_ADDRESS = '968zAsb2uRZhZAqpAJAt3khAEuK2KfZFMo9cAqKjpump';
const POOL_ADDRESS = 'AhJFcrmvk5thQvyCQut6YrPQDpvAXRo4oZUkH6y46nyv';

// Copy address function
function copyAddress() {
    navigator.clipboard.writeText(TOKEN_ADDRESS).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// Fetch live data from DexScreener
async function fetchTokenData() {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${POOL_ADDRESS}`);
        const data = await response.json();
        
        if (data.pair) {
            // Update price
            const priceEl = document.getElementById('price');
            if (priceEl && data.pair.priceUsd) {
                priceEl.textContent = `$${parseFloat(data.pair.priceUsd).toFixed(6)}`;
            }
            
            // Update liquidity
            const liquidityEl = document.getElementById('liquidity');
            if (liquidityEl && data.pair.liquidity?.usd) {
                const liq = data.pair.liquidity.usd;
                liquidityEl.textContent = liq >= 1000 ? `$${(liq / 1000).toFixed(1)}K` : `$${liq.toFixed(0)}`;
            }
        }
    } catch (error) {
        console.log('Could not fetch live data:', error);
    }
}

// Animate numbers
function animateValue(element, start, end, duration) {
    const startTimestamp = Date.now();
    const step = () => {
        const progress = Math.min((Date.now() - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        element.textContent = value.toLocaleString();
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(step);
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(10, 10, 15, 0.98)';
    } else {
        navbar.style.background = 'rgba(10, 10, 15, 0.9)';
    }
});

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.querySelectorAll('.flow-step, .info-card, .roadmap-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.6s ease-out';
    observer.observe(el);
});

// Simulate burned tokens counter (this would be real data from the contract)
let burnedTokens = 0;
function updateBurnedCounter() {
    const burnedEl = document.getElementById('burned');
    if (burnedEl) {
        // Simulate gradual burn (in production, this would come from the contract)
        burnedTokens += Math.floor(Math.random() * 100);
        burnedEl.textContent = burnedTokens.toLocaleString();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchTokenData();
    // Refresh data every 30 seconds
    setInterval(fetchTokenData, 30000);
    
    // Update burn counter every 5 seconds (demo)
    setInterval(updateBurnedCounter, 5000);
});

// Add some fire particles dynamically
function addFireParticle() {
    const container = document.querySelector('.bg-animation');
    if (!container) return;
    
    const particle = document.createElement('div');
    particle.className = 'fire-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (10 + Math.random() * 10) + 's';
    container.appendChild(particle);
    
    // Remove after animation
    setTimeout(() => {
        particle.remove();
    }, 20000);
}

// Add particles periodically
setInterval(addFireParticle, 3000);

console.log('🔥 BurnLoop loaded! Every trade burns forever.');
