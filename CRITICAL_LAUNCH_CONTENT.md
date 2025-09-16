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

## 4. ENHANCED INTEREST FORM
*Replace current form*

### HTML Structure:
```html
<!-- Enhanced Interest Form -->
<form id="interestForm" class="enhanced-form">
    <div class="form-row">
        <div class="form-group full-width">
            <input type="email" class="form-input" placeholder="Email Address*" required>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group half-width">
            <input type="tel" class="form-input" placeholder="Phone (optional for urgent updates)">
        </div>
        <div class="form-group half-width">
            <select class="form-input" required>
                <option value="">Group Size*</option>
                <option value="5-7">5-7 players</option>
                <option value="8-12">8-12 players</option>
                <option value="13-16">13-16 players</option>
                <option value="17-20">17-20 players (full buyout)</option>
                <option value="unsure">Not sure yet</option>
            </select>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group full-width">
            <select class="form-input">
                <option value="">Preferred Dates (optional)</option>
                <option value="preview-weekend1">Oct 4-6 (Preview Weekend 1)</option>
                <option value="preview-weekend2">Oct 11-12 (Preview Weekend 2)</option>
                <option value="mainrun-weekend1">Oct 18-20 (Opening Weekend)</option>
                <option value="mainrun-weekend2">Oct 25-27</option>
                <option value="mainrun-weekend3">Nov 1-3</option>
                <option value="mainrun-weekend4">Nov 8-9 (Closing Weekend)</option>
                <option value="flexible">Flexible</option>
            </select>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group full-width">
            <div class="interest-options">
                <label class="checkbox-label">
                    <input type="checkbox" name="interest" value="preview">
                    <span>Interested in Preview ($75/person)</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" name="interest" value="mainrun">
                    <span>Interested in Main Run</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" name="interest" value="corporate">
                    <span>Corporate/Private Booking</span>
                </label>
            </div>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group full-width">
            <select class="form-input">
                <option value="">How did you hear about us? (optional)</option>
                <option value="social">Social Media</option>
                <option value="friend">Friend/Word of Mouth</option>
                <option value="otc">Off the Couch Games</option>
                <option value="press">Press/Media</option>
                <option value="creator">From Creators' Previous Work</option>
                <option value="other">Other</option>
            </select>
        </div>
    </div>
    
    <button type="submit" class="cta-primary" style="width: 100%;">
        Lock In Your Memory - Get Preview Access
    </button>
    
    <p class="form-disclaimer">
        First 50 preview spots at $75. Main run pricing TBA.<br>
        <span style="color: rgba(255, 100, 100, 0.7);">No payment required now. We'll contact you when booking opens.</span>
    </p>
</form>
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

/* Enhanced Form */
.enhanced-form {
    max-width: 600px;
    margin: 0 auto;
}

.form-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
}

.full-width {
    width: 100%;
}

.half-width {
    width: 50%;
}

.interest-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(204, 0, 0, 0.2);
}

.checkbox-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.8);
}

.checkbox-label input {
    margin-right: 0.8rem;
    width: 20px;
    height: 20px;
}

.form-disclaimer {
    text-align: center;
    margin-top: 2rem;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.7);
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