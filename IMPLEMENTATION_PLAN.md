# About Last Night - Website Implementation Plan

## Overview
A step-by-step guide to implement the marketing strategy using Google Sheets for data collection, maintaining design cohesion throughout.

**Time Estimate:** 3-4 hours total
**Approach:** Progressive enhancement - each step improves the site without breaking existing functionality

---

## PHASE 1: BACKEND SETUP (30 minutes)
*Set up data collection before touching the website*

### Step 1.1: Create Google Sheet Structure
1. Create new Google Sheet: "About_Last_Night_Leads"
2. Set up columns in Row 1:
   ```
   A: Timestamp
   B: Email
   C: Source (UTM tracking)
   D: Referrer
   E: Device_Type
   F: Notes
   ```
3. Format Row 1 as header (bold, freeze row)
4. Share sheet with team members who need access

### Step 1.2: Create Google Apps Script
1. In your Google Sheet: Extensions → Apps Script
2. Delete default code, paste this:

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const timestamp = new Date();
    
    // Parse form data
    const formData = e.parameter;
    
    // Prepare row data (simplified for single email field)
    const newRow = [
      timestamp,
      formData.email || '',
      formData.utm_source || 'direct',
      formData.referrer || '',
      formData.device_type || '',
      '' // Notes column - empty for now
    ];
    
    // Append to sheet
    sheet.appendRow(newRow);
    
    // Send email notification for early signups (first 50)
    if (formData.email && sheet.getLastRow() <= 51) { // Including header row
      MailApp.sendEmail({
        to: 'YOUR-EMAIL@gmail.com', // <-- CHANGE THIS
        subject: `[MEMORY #${sheet.getLastRow() - 1}] ${formData.email}`,
        htmlBody: `
          <h3>MEMORY RECOVERY INITIATED</h3>
          <p><b>Subject:</b> ${formData.email}</p>
          <p><b>Memory ID:</b> #${sheet.getLastRow() - 1}</p>
          <p><b>Source:</b> ${formData.utm_source || 'direct'}</p>
          <p><b>Device:</b> ${formData.device_type || 'unknown'}</p>
          <hr>
          <p><a href="YOUR-SHEET-URL">Access Memory Database</a></p>
        `
      });
    }
    
    // Return success
    return ContentService
      .createTextOutput(JSON.stringify({'result': 'success', 'memory_id': sheet.getLastRow() - 1}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    // Return error
    return ContentService
      .createTextOutput(JSON.stringify({'result': 'error', 'error': error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function
function testSetup() {
  const testData = {
    parameter: {
      email: 'test@example.com',
      utm_source: 'test',
      device_type: 'Desktop'
    }
  };
  
  const result = doPost(testData);
  console.log(result.getContent());
}
```

3. **IMPORTANT:** Update `YOUR-EMAIL@gmail.com` and `YOUR-SHEET-URL` in the code

### Step 1.3: Deploy Web App
1. Click "Deploy" → "New Deployment"
2. Settings:
   - Type: Web app
   - Description: "About Last Night Form Handler"
   - Execute as: Me
   - Who has access: Anyone
3. Click "Deploy"
4. **COPY THE WEB APP URL** - You'll need this!
    https://script.google.com/macros/s/AKfycbzZ7Xep091AvDFGPADN6CzRCHJUgD0-rPEcBFsuDWEtDTNUiFJGQ_cWIlEwX8gZm8Nk2g/exec
    **deployment ID** AKfycbzZ7Xep091AvDFGPADN6CzRCHJUgD0-rPEcBFsuDWEtDTNUiFJGQ_cWIlEwX8gZm8Nk2g
5. Test by clicking "Test deployments"

---

## PHASE 2: PREPARE WEBSITE FILES (15 minutes)
*Create backup and organize new content*

### Step 2.1: Backup Current Site
```bash
# Create backup
cp index.html index-backup-$(date +%Y%m%d).html
```

### Step 2.2: Create Component Files
Create these files for cleaner organization:

**new-sections.html** (temporary file with new content):
```html
<!-- We'll put new sections here first to review before adding to main file -->
```

**form-handler.js**:
```javascript
// Google Sheets Form Handler
const GOOGLE_SCRIPT_URL = 'YOUR-WEB-APP-URL'; // <-- Paste your URL here

async function submitToGoogleSheets(formData) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Important for Google Scripts
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formData)
    });
    
    // Note: With no-cors, we can't read response
    // Assume success if no error thrown
    return { success: true };
  } catch (error) {
    console.error('Submission error:', error);
    return { success: false, error };
  }
}
```

---

## PHASE 3: IMPLEMENT CRITICAL CONTENT (1 hour)
*Add new sections while maintaining design cohesion*

### Step 3.1: Add Booking Info Bar
Add right after closing `</section>` of hero section:

```html
<!-- Booking Info Bar -->
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

### Step 3.2: Add How It Works Section
Add after Evidence Room section:

```html
<!-- How It Works Section -->
<section id="how-it-works" class="how-it-works">
    <div class="container">
        <h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; text-align: center; color: #cc0000; margin-bottom: 1rem;">How The Investigation Works</h2>
        <p style="text-align: center; font-size: 1.3rem; color: rgba(255, 255, 255, 0.8); margin-bottom: 3rem;">
            90 minutes. Multiple suspects. Your memories are the evidence.
        </p>
        
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

### Step 3.3: Add FAQ Section
Add before Interest Form section:

```html
<!-- FAQ Section -->
<section id="faq" class="faq-section">
    <div class="container">
        <h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; text-align: center; color: #cc0000; margin-bottom: 1rem;">Classified Information</h2>
        <p style="text-align: center; font-size: 1.3rem; color: rgba(255, 255, 255, 0.8); margin-bottom: 3rem;">
            What you need to know before entering the investigation.
        </p>
        
        <div class="faq-grid">
            <!-- FAQ items here - see CRITICAL_LAUNCH_CONTENT.md for full content -->
        </div>
    </div>
</section>
```

### Step 3.4: Add CSS for New Sections
Add to existing `<style>` tag:

```css
/* Container for consistent spacing */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
}

/* Booking Bar - matches existing design */
.booking-bar {
    position: sticky;
    top: 0;
    background: rgba(0, 0, 0, 0.95);
    border-bottom: 2px solid #cc0000;
    padding: 1rem 2rem;
    z-index: 90;
    backdrop-filter: blur(10px);
    animation: policeLights 10s infinite subtle;
}

/* How It Works - cohesive with Evidence Room */
.how-it-works {
    padding: 6rem 2rem;
    background: #000;
    position: relative;
    border-top: 1px solid rgba(204, 0, 0, 0.2);
}

.process-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 4rem 0;
}

.process-step {
    text-align: center;
    padding: 2rem;
    background: rgba(10, 10, 10, 0.9);
    border: 1px solid rgba(204, 0, 0, 0.2);
    transition: all 0.3s;
}

.process-step:hover {
    border-color: #cc0000;
    transform: translateY(-5px);
    background: rgba(30, 0, 0, 0.9);
}

.step-number {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3rem;
    color: #cc0000;
    opacity: 0.5;
    margin-bottom: 1rem;
}

/* FAQ Section - matches memory blocks style */
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

/* Stats display */
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
    text-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
}

.stat-label {
    display: block;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}
```

---

## PHASE 4: ENHANCE FORM (45 minutes)
*Replace existing form with enhanced version connected to Google Sheets*

### Step 4.1: Replace Form HTML
Replace the existing form in the Interest Form section:

```html
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

### Step 4.2: Add Form CSS
Add to existing styles:

```css
/* Memory Recovery Form Styles */
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

.system-note br {
    margin-bottom: 0.5rem;
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
```

### Step 4.3: Update JavaScript
Replace existing form submission handler:

```javascript
// Google Sheets Integration
const GOOGLE_SCRIPT_URL = 'YOUR-WEB-APP-URL-HERE'; // <-- PASTE YOUR URL HERE!

// Populate hidden fields
document.addEventListener('DOMContentLoaded', function() {
    // Get UTM parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    document.getElementById('utm_source').value = urlParams.get('utm_source') || 'direct';
    document.getElementById('referrer').value = document.referrer || '';
    
    // Simple device detection
    const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);
    document.getElementById('device_type').value = isMobile ? 'Mobile' : 'Desktop';
});

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
    button.style.opacity = '0.7';
    
    try {
        // Submit to Google Sheets
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data)
        });
        
        // Success state (we assume success with no-cors)
        button.textContent = 'MEMORY RECOVERED';
        button.style.background = '#00ff00';
        button.style.borderColor = '#00ff00';
        formMessage.style.display = 'block';
        
        // Reset form after delay
        setTimeout(() => {
            this.reset();
            button.textContent = originalText;
            button.disabled = false;
            button.style.background = '';
            button.style.opacity = '1';
            formMessage.style.display = 'none';
        }, 5000);
        
    } catch (error) {
        console.error('Submission error:', error);
        button.textContent = 'ERROR - TRY AGAIN';
        button.style.background = '#ff0000';
        button.disabled = false;
        button.style.opacity = '1';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 3000);
    }
});
```

---

## PHASE 5: ADD TRUST SIGNALS (30 minutes)
*Add credibility markers throughout the site*

### Step 5.1: Update Hero Section
Add after the tagline:

```html
<p class="awards-badge">From the creators of Golden Lock Award Winner</p>
```

Add CSS:
```css
.awards-badge {
    font-size: 1rem;
    color: rgba(255, 200, 0, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin: 1rem 0;
    font-weight: 300;
}
```

### Step 5.2: Add Media Mentions
After the CTA buttons in hero section:

```html
<div class="media-mentions">
    <p>As Featured On</p>
    <div class="media-logos">
        CNN • ABC • New York Times • SF Chronicle
    </div>
</div>
```

Add CSS:
```css
.media-mentions {
    margin-top: 3rem;
    opacity: 0.7;
}

.media-mentions p {
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 0.5rem;
    color: rgba(255, 255, 255, 0.5);
}

.media-logos {
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.8);
    letter-spacing: 0.1em;
}
```

---

## PHASE 6: TESTING & VALIDATION (30 minutes)

### Step 6.1: Test Google Sheets Integration
1. Submit a test form entry
2. Check Google Sheet for new row
3. Verify email notification received
4. Test with missing required fields
5. Test with all checkboxes selected

### Step 6.2: Visual QA Checklist
- [ ] Booking bar stays visible when scrolling
- [ ] All sections align properly
- [ ] Hover effects work on all interactive elements
- [ ] Mobile responsive at 375px, 768px, 1024px
- [ ] Form shows success/error states clearly
- [ ] All internal links scroll smoothly

### Step 6.3: Content Review
- [ ] Dates are correct (Oct 4-12, Oct 18-Nov 9)
- [ ] Pricing is clear ($75 preview)
- [ ] No typos in new content
- [ ] FAQ answers all critical questions
- [ ] CTAs are consistent throughout

### Step 6.4: Performance Check
- [ ] Page loads in under 3 seconds
- [ ] Images are visible but not blocking
- [ ] Form submits within 2 seconds
- [ ] No console errors

---

## PHASE 7: LAUNCH CHECKLIST

### Pre-Launch (Do These First)
- [ ] Google Sheet is set up and tested
- [ ] Email notifications work
- [ ] Form validation is working
- [ ] Mobile responsiveness verified
- [ ] Team has access to Google Sheet

### Launch Day
- [ ] Deploy updated index.html
- [ ] Test form submission on live site
- [ ] Share with team for review
- [ ] Monitor first few submissions

### Post-Launch (Within 24 Hours)
- [ ] Set up Google Analytics
- [ ] Create thank-you email template
- [ ] Plan first email to list
- [ ] Schedule social media posts

---

## QUICK REFERENCE: File Structure

```
aboutlastnightgame/
├── index.html (main file - updated)
├── index-backup-[date].html (backup)
├── images/
│   ├── Noirroom.png
│   ├── Sarahfacingaway.png
│   ├── Sarahlookback.png
│   └── Sleepyparty.png
├── MARKETING_STRATEGY.md
├── CRITICAL_LAUNCH_CONTENT.md
├── FORM_IMPLEMENTATION.md
└── IMPLEMENTATION_PLAN.md (this file)
```

---

## TROUBLESHOOTING

### Form Not Submitting
1. Check GOOGLE_SCRIPT_URL is correct
2. Verify Google Script is deployed as "Anyone can access"
3. Check browser console for errors
4. Test Google Script directly via test function

### Styling Issues
1. Check for CSS conflicts
2. Verify font imports are working
3. Clear browser cache
4. Test in incognito mode

### Google Sheets Not Updating
1. Check column headers match script exactly
2. Verify script permissions
3. Check Google account quotas
4. Review script execution logs

---

## SUCCESS METRICS

Week 1 Goals:
- 50+ email signups
- <40% bounce rate
- 3+ minutes average time on site
- 20% form conversion rate

Week 2 Goals:
- 150+ total signups
- 30% email open rate
- 5+ group bookings interested
- Press coverage initiated

---

## NOTES FOR COHESIVE DESIGN

Throughout implementation, maintain:
1. **Color Consistency**: #cc0000 (red), rgba(255,255,255,0.8) (white text)
2. **Font Hierarchy**: Bebas Neue for headers, Barlow for body
3. **Animation Style**: Subtle hover effects, glitch text sparingly
4. **Border Style**: Always use rgba(204, 0, 0, 0.2-0.3) for borders
5. **Spacing**: 6rem padding for major sections, 2rem for content
6. **Interactive Feedback**: Red hover states, transform on interaction

Remember: Each new element should feel like it belongs to the noir crime thriller aesthetic already established.