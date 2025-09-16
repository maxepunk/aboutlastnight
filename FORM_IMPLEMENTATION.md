# Complete Interest Form Implementation Guide

## Option 1: No-Backend Solution (Recommended for Quick Launch)

### Using Formspree (Free tier available)

```html
<!-- Enhanced Interest Form with Formspree -->
<form id="interestForm" 
      action="https://formspree.io/f/YOUR_FORM_ID" 
      method="POST"
      class="enhanced-form">
    
    <input type="hidden" name="_subject" value="New About Last Night Interest!">
    <input type="hidden" name="_next" value="https://yourdomain.com/thank-you">
    <input type="text" name="_gotcha" style="display:none"> <!-- Honeypot spam protection -->
    
    <div class="form-row">
        <div class="form-group full-width">
            <input type="email" name="email" class="form-input" placeholder="Email Address*" required>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group half-width">
            <input type="tel" name="phone" class="form-input" placeholder="Phone (optional for urgent updates)">
        </div>
        <div class="form-group half-width">
            <select name="group_size" class="form-input" required>
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
            <select name="preferred_dates" class="form-input">
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
                    <input type="checkbox" name="interest_preview" value="yes">
                    <span>Interested in Preview ($75/person)</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" name="interest_mainrun" value="yes">
                    <span>Interested in Main Run</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" name="interest_corporate" value="yes">
                    <span>Corporate/Private Booking</span>
                </label>
            </div>
        </div>
    </div>
    
    <div class="form-row">
        <div class="form-group full-width">
            <select name="source" class="form-input">
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

### JavaScript for Enhanced UX:

```javascript
// Enhanced form handling with validation and feedback
document.getElementById('interestForm').addEventListener('submit', function(e) {
    const button = this.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    
    // Visual feedback during submission
    button.textContent = 'PROCESSING MEMORY...';
    button.disabled = true;
    button.style.opacity = '0.7';
    
    // For Formspree, the form will submit normally
    // This is just for visual feedback
});

// Add real-time validation
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('blur', function() {
        if (this.hasAttribute('required') && !this.value) {
            this.style.borderColor = '#ff0000';
        } else {
            this.style.borderColor = '#cc0000';
        }
    });
});

// Track form interactions for analytics
document.getElementById('interestForm').addEventListener('focus', function(e) {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'form_start', {
            'event_category': 'engagement',
            'event_label': 'interest_form'
        });
    }
}, { once: true });
```

---

## Option 2: Google Sheets Integration (Free, No Server Needed)

### Setup Steps:
1. Create a Google Sheet
2. Go to Extensions → Apps Script
3. Add this script:

```javascript
// Google Apps Script Code
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nextRow = sheet.getLastRow() + 1;
  
  const newRow = headers.map(header => {
    return e.parameter[header] || '';
  });
  
  newRow[0] = new Date(); // Add timestamp
  sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);
  
  // Send email notification
  MailApp.sendEmail({
    to: 'your-email@example.com',
    subject: 'New About Last Night Interest!',
    htmlBody: `
      <h3>New submission received!</h3>
      <p><strong>Email:</strong> ${e.parameter.email}</p>
      <p><strong>Group Size:</strong> ${e.parameter.group_size}</p>
      <p><strong>Interest:</strong> ${e.parameter.interest_preview ? 'Preview ' : ''}${e.parameter.interest_mainrun ? 'Main Run ' : ''}${e.parameter.interest_corporate ? 'Corporate' : ''}</p>
    `
  });
  
  return ContentService
    .createTextOutput(JSON.stringify({ 'result': 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Frontend JavaScript for Google Sheets:

```javascript
// Submit to Google Sheets
document.getElementById('interestForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const button = this.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    
    // Visual feedback
    button.textContent = 'PROCESSING MEMORY...';
    button.disabled = true;
    
    try {
        const response = await fetch('YOUR_GOOGLE_SCRIPT_URL', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            // Success state
            button.textContent = 'MEMORY LOCKED';
            button.style.background = '#00ff00';
            
            // Show success message
            const successMsg = document.createElement('div');
            successMsg.className = 'success-message';
            successMsg.innerHTML = `
                <p style="color: #00ff00; text-align: center; margin-top: 1rem;">
                    ✓ Your spot in the investigation is secured.<br>
                    Check your email for next steps.
                </p>
            `;
            this.appendChild(successMsg);
            
            // Reset form
            setTimeout(() => {
                this.reset();
                button.textContent = originalText;
                button.disabled = false;
                button.style.background = '';
                successMsg.remove();
            }, 5000);
            
            // Track conversion
            if (typeof gtag !== 'undefined') {
                gtag('event', 'conversion', {
                    'event_category': 'engagement',
                    'event_label': 'interest_form_submission'
                });
            }
        } else {
            throw new Error('Submission failed');
        }
    } catch (error) {
        // Error state
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

## Option 3: Email Service Integration (Recommended for Marketing)

### Mailchimp Embedded Form:

```html
<!-- Mailchimp Signup Form -->
<div id="mc_embed_signup">
    <form action="https://YOUR_DOMAIN.us1.list-manage.com/subscribe/post?u=YOUR_USER_ID&amp;id=YOUR_LIST_ID&amp;f_id=YOUR_FORM_ID" 
          method="post" 
          id="mc-embedded-subscribe-form" 
          name="mc-embedded-subscribe-form" 
          class="enhanced-form validate" 
          target="_blank">
        
        <div class="form-row">
            <div class="form-group full-width">
                <input type="email" value="" name="EMAIL" class="form-input required email" placeholder="Email Address*" required>
            </div>
        </div>
        
        <div class="form-row">
            <div class="form-group half-width">
                <input type="tel" name="PHONE" class="form-input" placeholder="Phone (optional)">
            </div>
            <div class="form-group half-width">
                <select name="GROUPSIZE" class="form-input" required>
                    <option value="">Group Size*</option>
                    <option value="5-7">5-7 players</option>
                    <option value="8-12">8-12 players</option>
                    <option value="13-16">13-16 players</option>
                    <option value="17-20">17-20 players (full buyout)</option>
                    <option value="unsure">Not sure yet</option>
                </select>
            </div>
        </div>
        
        <!-- Mailchimp interest groups -->
        <div class="form-row">
            <div class="form-group full-width">
                <div class="interest-options">
                    <label class="checkbox-label">
                        <input type="checkbox" value="1" name="group[12345][1]">
                        <span>Interested in Preview ($75/person)</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" value="2" name="group[12345][2]">
                        <span>Interested in Main Run</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" value="4" name="group[12345][4]">
                        <span>Corporate/Private Booking</span>
                    </label>
                </div>
            </div>
        </div>
        
        <!-- Mailchimp hidden fields -->
        <div style="position: absolute; left: -5000px;" aria-hidden="true">
            <input type="text" name="b_YOUR_USER_ID_YOUR_LIST_ID" tabindex="-1" value="">
        </div>
        
        <button type="submit" name="subscribe" class="cta-primary" style="width: 100%;">
            Lock In Your Memory - Get Preview Access
        </button>
    </form>
</div>
```

---

## Option 4: Simple Backend (Node.js/Express)

### Backend Code (server.js):

```javascript
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

const app = express();
app.use(cors());
app.use(express.json());

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Validation middleware
const validateForm = [
    body('email').isEmail().normalizeEmail(),
    body('group_size').notEmpty(),
    body('phone').optional().isMobilePhone()
];

// Form submission endpoint
app.post('/api/interest', validateForm, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, phone, group_size, preferred_dates, interests, source } = req.body;
    
    try {
        // Save to database (example with MongoDB)
        // const lead = await Lead.create({ email, phone, group_size, ... });
        
        // Send confirmation email
        await transporter.sendMail({
            from: '"About Last Night" <noreply@aboutlastnight.com>',
            to: email,
            subject: 'Your Memory Has Been Locked',
            html: `
                <h2>Welcome to the Investigation</h2>
                <p>You've secured your spot for About Last Night.</p>
                <p>We'll contact you 48 hours before tickets go live with exclusive early access.</p>
                <p><strong>Your Details:</strong></p>
                <ul>
                    <li>Group Size: ${group_size}</li>
                    <li>Preferred Dates: ${preferred_dates || 'Flexible'}</li>
                </ul>
                <p>Some memories are worth killing for...</p>
            `
        });
        
        // Send notification to team
        await transporter.sendMail({
            from: '"Form System" <noreply@aboutlastnight.com>',
            to: 'team@aboutlastnight.com',
            subject: `New Interest: ${email}`,
            text: JSON.stringify(req.body, null, 2)
        });
        
        res.json({ success: true, message: 'Memory locked successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

### Frontend for API:

```javascript
// Submit to custom backend
document.getElementById('interestForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());
    
    // Collect checkbox values
    data.interests = [];
    if (formData.get('interest_preview')) data.interests.push('preview');
    if (formData.get('interest_mainrun')) data.interests.push('mainrun');
    if (formData.get('interest_corporate')) data.interests.push('corporate');
    
    const button = this.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    
    button.textContent = 'PROCESSING MEMORY...';
    button.disabled = true;
    
    try {
        const response = await fetch('https://your-api.com/api/interest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            button.textContent = 'MEMORY LOCKED';
            button.style.background = '#00ff00';
            
            // Clear and thank
            setTimeout(() => {
                this.reset();
                button.textContent = originalText;
                button.disabled = false;
                button.style.background = '';
            }, 3000);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        button.textContent = 'ERROR - TRY AGAIN';
        button.style.background = '#ff0000';
        button.disabled = false;
        
        console.error('Submission error:', error);
    }
});
```

---

## RECOMMENDATION FOR IMMEDIATE LAUNCH:

**Use Option 1 (Formspree) or Option 2 (Google Sheets)**

Both are:
- Free to start
- No server required
- Can be implemented in 30 minutes
- Reliable and secure

Formspree gives you:
- Automatic spam protection
- Email notifications
- CSV export
- Webhooks for automation

Google Sheets gives you:
- Real-time data access
- Easy team sharing
- Built-in analytics
- Free email notifications

**Later upgrade to Option 3 (Mailchimp) for:**
- Automated email sequences
- Segmentation
- A/B testing
- Marketing automation