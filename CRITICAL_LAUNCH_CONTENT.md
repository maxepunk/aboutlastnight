# CRITICAL WEBSITE CONTENT - Immediate Implementation

## 1. HOW IT WORKS SECTION
*Insert after Evidence Room section*

### HTML Structure:
```html
<!-- How It Works Section -->
<section id="how-it-works" class="how-it-works">
    <div class="container">
        <h2>How The Investigation Works</h2>
        <p class="section-intro">90 minutes. Multiple suspects. Your memories are the evidence.</p>
        
        <div class="process-grid">
            <div class="process-step">
                <div class="step-number">01</div>
                <h3>Gather Your Suspects</h3>
                <p>5-20 players enter together. You might know some. Others are strangers with their own agendas.</p>
            </div>
            
            <div class="process-step">
                <div class="step-number">02</div>
                <h3>Receive Your Identity</h3>
                <p>You're not just a player. You're a character with a past, connections, and secrets worth protecting.</p>
            </div>
            
            <div class="process-step">
                <div class="step-number">03</div>
                <h3>Recover Your Memories</h3>
                <p>Solve physical puzzles scattered throughout the space. Each unlocks memory fragments from last night.</p>
            </div>
            
            <div class="process-step">
                <div class="step-number">04</div>
                <h3>Trade, Betray, or Trust</h3>
                <p>Your memories have value to others. Negotiate, trade, or hoard them. Every choice changes the outcome.</p>
            </div>
        </div>
        
        <div class="experience-stats">
            <div class="stat">
                <span class="stat-number">90</span>
                <span class="stat-label">Minutes</span>
            </div>
            <div class="stat">
                <span class="stat-number">5-20</span>
                <span class="stat-label">Players</span>
            </div>
            <div class="stat">
                <span class="stat-number">∞</span>
                <span class="stat-label">Outcomes</span>
            </div>
        </div>
    </div>
</section>
```

---

## 2. FAQ SECTION
*Insert before Interest Form*

### HTML Structure:
```html
<!-- FAQ Section -->
<section id="faq" class="faq-section">
    <div class="container">
        <h2>Classified Information</h2>
        <p class="section-intro">What you need to know before entering the investigation.</p>
        
        <div class="faq-grid">
            <div class="faq-item">
                <h3 class="faq-question">What exactly is this experience?</h3>
                <p class="faq-answer">A 90-minute immersive crime thriller where you play a character with fragmented memories. Solve puzzles to recover your memories, then decide whether to trade, keep, or weaponize them. Part escape room, part roleplay, part social strategy game.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">How many people do I need?</h3>
                <p class="faq-answer">Minimum 5 players, maximum 20. Don't have a full group? You'll be paired with others – and trust us, playing with strangers adds to the tension and strategy.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">Will we be paired with strangers?</h3>
                <p class="faq-answer">Possibly, yes. This game thrives on unexpected alliances and rivalries. However, groups can book all 20 spots for a fully private experience.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">How long does it take?</h3>
                <p class="faq-answer">Plan for 90-120 minutes. Most groups finish around 90 minutes, but complex negotiations can extend gameplay.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">When can I play?</h3>
                <p class="faq-answer">Preview performances: October 4-12 ($75/person)<br>
                Main run: October 18 - November 9<br>
                Friday-Sunday performances, multiple time slots.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">Is this scary?</h3>
                <p class="faq-answer">No jump scares or horror elements. This is a psychological thriller focused on mystery, deduction, and social dynamics. Think noir detective story, not haunted house.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">Age requirements?</h3>
                <p class="faq-answer">16+ recommended due to complex themes and strategic gameplay. Under 18 must be accompanied by an adult.</p>
            </div>
            
            <div class="faq-item">
                <h3 class="faq-question">Content warnings?</h3>
                <p class="faq-answer">Themes include: memory loss, corporate conspiracy, infidelity, substance use references, artificial intelligence, and psychological manipulation. No physical contact required between players.</p>
            </div>
        </div>
    </div>
</section>
```

---

## 3. BOOKING INFO BAR
*Sticky element below hero section*

### HTML Structure:
```html
<!-- Booking Info Bar - Place right after hero section -->
<div class="booking-bar" id="booking-bar">
    <div class="booking-content">
        <div class="booking-dates">
            <span class="preview-dates">PREVIEW: Oct 4-12 | $75/person</span>
            <span class="divider">•</span>
            <span class="main-dates">MAIN RUN: Oct 18 - Nov 9</span>
            <span class="divider">•</span>
            <span class="min-players">5 player minimum</span>
        </div>
        <a href="#submit-evidence" class="booking-cta">Join Preview List - Save 25%</a>
    </div>
</div>
```

---

## 4. MEMORY RECOVERY FORM (Option B - Simplified)
*Replace current form*

### HTML Structure:
```html
<!-- Memory Recovery Form -->
<form id="interestForm" class="memory-form">
    <div class="corrupted-header">
        <span class="glitch">MEMORY_RECOVERY_PROTOCOL</span>
    </div>
    
    <input type="email" 
           name="email"
           class="memory-input" 
           placeholder="Initialize memory recovery sequence"
           required>
    
    <!-- Hidden fields for tracking -->
    <input type="hidden" name="utm_source" id="utm_source">
    <input type="hidden" name="referrer" id="referrer">
    <input type="hidden" name="device_type" id="device_type">
    
    <button type="submit" class="recover-button">
        Begin Recovery
    </button>
    
    <p class="system-note">
        SYSTEM: Preview access October 4-12<br>
        WARNING: Full investigation $75 • October 18 - November 9
    </p>
</form>

<div id="form-message" class="recovery-status" style="display: none;">
    <p class="success-msg">✓ MEMORY RECOVERY INITIATED • CHECK EMAIL FOR PROTOCOL</p>
</div>
```

### JavaScript for Form:
```javascript
// Google Sheets Integration
const GOOGLE_SCRIPT_URL = 'YOUR-WEB-APP-URL'; // Add your Google Script URL here

// Populate hidden fields on page load
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    document.getElementById('utm_source').value = urlParams.get('utm_source') || 'direct';
    document.getElementById('referrer').value = document.referrer || '';
    
    const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);
    document.getElementById('device_type').value = isMobile ? 'Mobile' : 'Desktop';
});

// Handle form submission
document.getElementById('interestForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const button = this.querySelector('.recover-button');
    const originalText = button.textContent;
    const formMessage = document.getElementById('form-message');
    
    // Collect form data
    const formData = new FormData(this);
    const data = {};
    for (let [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    // Visual feedback
    button.textContent = 'ACCESSING MEMORY CORE...';
    button.disabled = true;
    
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data)
        });
        
        // Success state
        button.textContent = 'MEMORY RECOVERED';
        button.style.background = '#00ff00';
        button.style.borderColor = '#00ff00';
        formMessage.style.display = 'block';
        
        // Reset after delay
        setTimeout(() => {
            this.reset();
            button.textContent = originalText;
            button.disabled = false;
            button.style.background = '';
            button.style.borderColor = '';
            formMessage.style.display = 'none';
        }, 5000);
        
    } catch (error) {
        button.textContent = 'ERROR - TRY AGAIN';
        button.style.background = '#ff0000';
        button.disabled = false;
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 3000);
    }
});
```

---

## 5. TRUST SIGNALS TO ADD

### In Hero Section (after tagline):
```html
<p class="awards-badge">From the creators of Golden Lock Award Winner</p>
```

### After main CTAs:
```html
<div class="media-mentions">
    <p>Featured On</p>
    <div class="media-logos">
        CNN • ABC • New York Times • SF Chronicle
    </div>
</div>
```

### Enhanced Creators Section Addition:
```html
<div class="creator-achievements">
    <div class="achievement">
        <img src="golden-lock-icon.svg" alt="Golden Lock">
        <span>2023 Golden Lock Award Winner</span>
    </div>
    <div class="achievement">
        <img src="cali-icon.svg" alt="CALI">
        <span>2022 CALI Catalyst Award</span>
    </div>
    <div class="achievement">
        <img src="mit-icon.svg" alt="MIT">
        <span>MIT Neuroscience Research</span>
    </div>
</div>
```

---

## 6. ADDITIONAL CSS STYLES NEEDED

```css
/* Booking Bar */
.booking-bar {
    position: sticky;
    top: 0;
    background: rgba(0, 0, 0, 0.95);
    border-bottom: 2px solid #cc0000;
    padding: 1rem 2rem;
    z-index: 90;
    backdrop-filter: blur(10px);
}

.booking-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
}

.booking-dates {
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
}

.preview-dates {
    color: #cc0000;
    font-weight: 700;
}

.divider {
    margin: 0 1rem;
    color: rgba(255, 255, 255, 0.3);
}

.booking-cta {
    padding: 0.8rem 2rem;
    background: #cc0000;
    color: white;
    text-decoration: none;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: all 0.3s;
}

.booking-cta:hover {
    background: #ff0000;
    box-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
}

/* How It Works */
.how-it-works {
    padding: 6rem 2rem;
    background: #000;
    position: relative;
}

.process-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 3rem;
    margin: 4rem 0;
}

.process-step {
    text-align: center;
    position: relative;
}

.step-number {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 4rem;
    color: #cc0000;
    opacity: 0.3;
    margin-bottom: 1rem;
}

.process-step h3 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.8rem;
    margin-bottom: 1rem;
    color: #fff;
}

.experience-stats {
    display: flex;
    justify-content: center;
    gap: 4rem;
    margin-top: 4rem;
    padding-top: 3rem;
    border-top: 1px solid rgba(204, 0, 0, 0.3);
}

.stat {
    text-align: center;
}

.stat-number {
    display: block;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3rem;
    color: #cc0000;
}

.stat-label {
    display: block;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

/* FAQ Section */
.faq-section {
    padding: 6rem 2rem;
    background: linear-gradient(180deg, #0a0a0a 0%, #000 100%);
}

.faq-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-top: 3rem;
}

.faq-item {
    background: rgba(20, 20, 20, 0.6);
    border-left: 3px solid #cc0000;
    padding: 2rem;
    transition: all 0.3s;
}

.faq-item:hover {
    background: rgba(30, 10, 10, 0.8);
    transform: translateX(5px);
}

.faq-question {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.5rem;
    color: #fff;
    margin-bottom: 1rem;
}

.faq-answer {
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
}

/* Memory Recovery Form */
.memory-form {
    max-width: 500px;
    margin: 0 auto;
    text-align: center;
}

.corrupted-header {
    margin-bottom: 2rem;
    padding: 1rem;
    background: rgba(204, 0, 0, 0.1);
    border: 1px solid rgba(204, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
}

.corrupted-header:before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(204, 0, 0, 0.2), transparent);
    animation: scan 3s infinite;
}

@keyframes scan {
    0% { left: -100%; }
    100% { left: 100%; }
}

.glitch {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.2rem;
    letter-spacing: 0.2em;
    color: #cc0000;
    text-transform: uppercase;
    animation: glitchText 3s infinite;
}

.memory-input {
    width: 100%;
    padding: 1.2rem;
    font-size: 1.1rem;
    background: rgba(10, 10, 10, 0.9);
    border: 2px solid rgba(204, 0, 0, 0.3);
    color: #fff;
    text-align: center;
    margin-bottom: 1.5rem;
    transition: all 0.3s;
    font-family: 'Barlow', sans-serif;
}

.memory-input::placeholder {
    color: rgba(204, 0, 0, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.9rem;
}

.memory-input:focus {
    outline: none;
    border-color: #cc0000;
    background: rgba(30, 0, 0, 0.9);
    box-shadow: 0 0 30px rgba(204, 0, 0, 0.3);
    transform: scale(1.02);
}

.recover-button {
    width: 100%;
    padding: 1.2rem 2rem;
    font-size: 1.1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    background: transparent;
    border: 2px solid #cc0000;
    color: #fff;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.3s;
    margin-bottom: 2rem;
}

.recover-button:before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: #cc0000;
    transition: left 0.3s;
    z-index: -1;
}

.recover-button:hover:before {
    left: 0;
}

.recover-button:hover {
    animation: policeLights 1s infinite;
}

.system-note {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.6;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.recovery-status {
    margin-top: 2rem;
    padding: 1rem;
    background: rgba(0, 255, 0, 0.1);
    border: 1px solid rgba(0, 255, 0, 0.3);
    text-align: center;
}

.success-msg {
    color: #00ff00;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.9rem;
}

/* Media queries for mobile */
@media (max-width: 768px) {
    .booking-content {
        flex-direction: column;
        gap: 1rem;
    }
    
    .booking-dates {
        font-size: 0.9rem;
        text-align: center;
    }
    
    .form-row {
        flex-direction: column;
    }
    
    .half-width {
        width: 100%;
    }
    
    .faq-grid {
        grid-template-columns: 1fr;
    }
    
    .process-grid {
        grid-template-columns: 1fr;
    }
}
```

---

## IMPLEMENTATION PRIORITY

### MUST DO TODAY:
1. Add "How It Works" section - clarifies the experience
2. Add FAQ section - answers key objections  
3. Add booking info bar - provides essential logistics
4. Enhance interest form - better segmentation for follow-up

### SHOULD DO THIS WEEK:
1. Add trust signals (awards, media mentions)
2. Optimize mobile responsiveness
3. Set up form backend/email capture
4. Add Google Analytics

### NICE TO HAVE BEFORE PREVIEW:
1. Countdown timer
2. Video teaser
3. Instagram embed
4. Live availability counter