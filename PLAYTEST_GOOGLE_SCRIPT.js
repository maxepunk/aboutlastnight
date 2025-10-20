// Google Apps Script for About Last Night Playtest Signup
// This script handles form submissions from the playtest signup page
//
// ═══════════════════════════════════════════════════════════
// CONTENT-FIRST ARCHITECTURE (CRITICAL DESIGN DECISION)
// ═══════════════════════════════════════════════════════════
// This backend is designed to be DATE-AGNOSTIC.
//
// SOURCE OF TRUTH: playtest.html (frontend radio buttons)
// - Content editors update dates ONLY in playtest.html
// - This backend accepts ANY date string submitted from the form
// - No backend redeployment needed when dates change!
//
// How it works:
// 1. Frontend sends date value from radio button (e.g., "2025-09-21 16:00")
// 2. Backend validates it's non-empty, then stores it
// 3. Backend discovers unique dates dynamically from sheet data
// 4. Capacity API returns all dates found in database
//
// Benefits:
// ✓ Content editors never touch backend code
// ✓ Adding/removing dates = edit HTML only
// ✓ No Google Apps Script redeployment required
// ✓ Dates automatically formatted for emails via parsing
// ═══════════════════════════════════════════════════════════
//
// IMPORTANT DEPLOYMENT SETTINGS:
// 1. Deploy as Web App
// 2. Execute as: Me (your account)
// 3. Who has access: Anyone (required for CORS to work)
// 4. Copy the deployment URL to playtest.html
//
// GOOGLE SHEET SETUP:
// Make sure your sheet has these column headers:
// Name | Email | Timestamp | Spot Number | Status | Photo Consent | Consent Timestamp | Selected Date

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════
// Capacity configuration (same for all dates)
const SPOTS_TOTAL = 20;
const MINIMUM_PLAYERS = 5;

// NOTE: Playtest dates are NOT hardcoded here!
// The backend dynamically discovers dates from:
// 1. Incoming form submissions (playtest.html is the source of truth)
// 2. Existing data in the Google Sheet
//
// TO ADD/MODIFY DATES:
// 1. Update radio buttons in playtest.html only
// 2. No backend redeployment needed!
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    // Get the spreadsheet and sheet
    const sheet = SpreadsheetApp.getActiveSheet();
    
    // Parse form data
    const formData = e.parameter;

    // Validate selected date exists (T004 - simplified to just check non-empty)
    const selectedDate = formData.playtestDate || '';
    if (!selectedDate || selectedDate.trim() === '') {
      throw new Error('No playtest date selected');
    }

    // Get per-date spot count (T005)
    const spotsTotal = SPOTS_TOTAL;
    const minimumPlayers = MINIMUM_PLAYERS;

    // Filter signups by selected date (column H, index 7)
    // Simple string comparison - dates are stored as plain text with setNumberFormat('@')
    const allData = sheet.getDataRange().getValues();
    const signupsForDate = allData.filter((row, index) => {
      if (index === 0) return false; // Skip header row
      const rowDate = row[7];
      if (!rowDate) return false;

      // Simple string comparison (both should be plain text)
      return String(rowDate).trim() === selectedDate.trim();
    });

    const spotsTaken = signupsForDate.length;
    const spotsRemaining = Math.max(0, spotsTotal - spotsTaken);
    
    // Determine status
    const status = spotsTaken < spotsTotal ? 'Confirmed' : 'Waitlist';
    const actualSpotNumber = spotsTaken + 1;
    
    // Create timestamp
    const timestamp = new Date();

    // Append data to sheet (including photo consent and selected date) (T006)
    // Use setValues() + setNumberFormat() instead of appendRow() to prevent
    // Google Sheets from auto-converting date strings to Date objects
    const lastRow = sheet.getLastRow();
    const nextRow = lastRow + 1;
    const rowData = [[
      formData.name || '',
      formData.email || '',
      timestamp,
      actualSpotNumber,
      status,
      formData.photoConsent || 'No',  // Photo consent
      timestamp,  // Consent timestamp (same as registration)
      selectedDate  // Selected Date (column H) - must stay as plain text
    ]];

    // Write the data
    sheet.getRange(nextRow, 1, 1, 8).setValues(rowData);

    // Force column H (index 8) to be plain text format to prevent auto-conversion
    sheet.getRange(nextRow, 8).setNumberFormat('@');
    
    // Send confirmation email to participant
    if (formData.email) {
      const dateDisplay = formatDateForEmail(selectedDate);

      const subject = status === 'Confirmed'
        ? `✓ About Last Night Playtest - ${dateDisplay} - Spot ${actualSpotNumber} Confirmed`
        : `⏳ About Last Night Playtest - ${dateDisplay} - Waitlist Position ${actualSpotNumber - spotsTotal}`;
      
      const htmlBody = status === 'Confirmed' 
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #000; padding: 20px; text-align: center;">
              <h1 style="color: #cc0000; margin: 0;">SPOT CONFIRMED</h1>
            </div>
            <div style="background: #f5f5f5; padding: 30px; color: #333;">
              <h2 style="color: #000;">Welcome, ${formData.name}</h2>
              <p style="font-size: 16px;">You're confirmed for the About Last Night playtest session!</p>
              
              <div style="background: #fff; border-left: 4px solid #cc0000; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${dateDisplay}</p>
                <p style="margin: 5px 0;"><strong>Duration:</strong> 2-2.5 hrs including playtest feedback session</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> Off the Couch Games, 555 Mowry Ave, Fremont, CA 94536</p>
                <p style="margin: 5px 0;"><strong>Your Spot:</strong> #${actualSpotNumber} of ${spotsTotal}</p>
                <p style="margin: 5px 0;"><strong>Surveillance Auth:</strong> ${formData.photoConsent === 'Yes' ? '✓ Authorized' : 'Not Authorized'}</p>
              </div>
              
              <h3 style="color: #cc0000;">What to Expect:</h3>
              <ul style="line-height: 1.8;">
                <li>90ish...minute immersive crime thriller experience</li>
                <li>Puzzle solving, roleplay, and memory trading mechanics</li>
                <li>You'll be testing an in-progress version - your feedback is valuable!</li>
                <li>Comfortable clothes recommended</li>
              </ul>
              
              ${formData.photoConsent === 'Yes' ? `
              <div style="background: rgba(0, 255, 0, 0.05); border-left: 3px solid rgba(0, 255, 0, 0.3); padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #333; font-size: 14px;">
                  <strong style="color: #008800;">SURVEILLANCE AUTHORIZED:</strong> You've cleared documentation protocols. 
                  The investigation will be recorded for development purposes. Need to avoid close surveillance? Inform security at entry.
                </p>
              </div>
              ` : `
              <div style="background: rgba(255, 200, 0, 0.05); border-left: 3px solid rgba(255, 200, 0, 0.5); padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #666; font-size: 14px;">
                  <strong style="color: #cc9900;">SURVEILLANCE DECLINED:</strong> You've opted out of documentation. 
                  We'll do our best to keep you out of promotional materials. Please remind us at check-in.
                </p>
              </div>
              `}
              
              <p style="background: #fff0f0; border: 1px solid #cc0000; padding: 15px; margin-top: 20px;">
                <strong style="color: #cc0000;">Important:</strong> Please arrive 10 minutes early if possible, to get settled. 
                <br>If you can't make it, please let us know ASAP so we can offer your spot to someone on the waitlist.
                 
              </p>
              
              <p style="margin-top: 20px; color: #666;">
                Questions? Reply to this email or 
                <br> text Max at (949) 331-6879 with last minute updates/changes/questions..
                Can't wait to see what you remember about last night...
              </p>
            </div>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #000; padding: 20px; text-align: center;">
              <h1 style="color: #ff9900; margin: 0;">WAITLIST POSITION ${actualSpotNumber - spotsTotal}</h1>
            </div>
            <div style="background: #f5f5f5; padding: 30px; color: #333;">
              <h2 style="color: #000;">Thank you for your interest, ${formData.name}</h2>
              <p style="font-size: 16px;">The playtest session is currently full, but you're on our waitlist!</p>
              
              <div style="background: #fff; border-left: 4px solid #ff9900; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Your waitlist position:</strong> #${actualSpotNumber - spotsTotal}</p>
                <p style="margin: 5px 0;"><strong>Session date:</strong> ${dateDisplay}</p>
              </div>
              
              <p>If a spot opens up, we'll contact you immediately. Waitlist positions often do become available!</p>
              
              <p style="background: #fffaf0; border: 1px solid #ff9900; padding: 15px; margin-top: 20px;">
                <strong>Meanwhile:</strong> We're planning additional playtest sessions. Being on this list gives you 
                priority access to future sessions and the October launch.
              </p>
              
              <p style="margin-top: 20px; color: #666;">
                Questions? Reply to this email.<br>
                Your memories are valuable to us...
              </p>
            </div>
          </div>
        `;
      
      MailApp.sendEmail({
        to: formData.email,
        subject: subject,
        htmlBody: htmlBody
      });
    }
    
    // Send notification to organizers
    const organizerEmail = 'max@maxepunk.com, Hello@gr8ergoodgames.com'; // <-- REPLACE WITH YOUR EMAIL
    
    // Calculate actual remaining spots AFTER adding this signup
    const actualSpotsRemaining = Math.max(0, spotsTotal - (spotsTaken + 1));
    
      MailApp.sendEmail({
        to: organizerEmail,
        subject: `🚨 Playtest Alert - ${dateDisplay}: ${actualSpotsRemaining} spots remaining!`,
        htmlBody: `
          <h2>Playtest Signup Update - ${dateDisplay}</h2>
          <p><strong>${formData.name}</strong> just claimed spot #${actualSpotNumber} for ${dateDisplay}</p>
          <p>Email: ${formData.email}</p>
          <p>Photo Consent: ${formData.photoConsent === 'Yes' ? '✅ Yes' : '❌ No'}</p>
          <p style="font-size: 24px; color: ${actualSpotsRemaining <= 3 ? '#cc0000' : '#ff9900'};">
            <strong>${actualSpotsRemaining} spots remaining for this date</strong>
          </p>
          <p><a href="https://docs.google.com/spreadsheets/d/1s9dDSSqTKc9wTtVvj-4U4fY_jzIdNCrIiI5E_atSKG4/edit?usp=sharing">View signup sheet</a></p>
        `
      });

    
    // Return current status (CORS is handled automatically by Google Apps Script)
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'success',
        'spot_number': actualSpotNumber,
        'status': status,
        'spots_remaining': actualSpotsRemaining,  // Use the corrected value
        'spots_taken': spotsTaken + 1, // +1 for the just-added signup
        'spots_total': spotsTotal,
        'minimum_players': minimumPlayers,
        'has_minimum': (spotsTaken + 1) >= minimumPlayers
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    // Return error
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'error',
        'error': error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper function to format date for email (T009)
// Handles both ISO date strings (YYYY-MM-DD HH:MM) and Date objects
// Returns human-readable format like "September 21 at 4:00 PM"
function formatDateForEmail(dateInput) {
  try {
    let date;

    // Check if input is already a Date object (Google Sheets auto-conversion)
    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'string') {
      // Parse ISO date string: "2025-09-21 16:00"
      const parts = dateInput.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
      if (parts) {
        const [, year, month, day, hour, minute] = parts;
        date = new Date(year, month - 1, day, hour, minute);
      } else {
        // Try parsing as generic date string
        date = new Date(dateInput);
        if (isNaN(date.getTime())) {
          return dateInput.toString(); // Fallback to original if invalid
        }
      }
    } else {
      // Unexpected type, return as-is
      return String(dateInput);
    }

    // Format month name
    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[date.getMonth()];

    // Format time (12-hour with AM/PM)
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const minutes = date.getMinutes();
    const timeStr = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

    // Get day without leading zero
    const day = date.getDate();

    return `${monthName} ${day} at ${timeStr}`;
  } catch (error) {
    // Fallback to string representation if any parsing error
    return String(dateInput);
  }
}

// Helper function to check if a playtest date is in the past
// Takes a date string in format "YYYY-MM-DD HH:MM"
// Returns true if the date/time has already passed
function isPastPlaytestDate(dateString) {
  try {
    // Parse the date string (format: "2025-09-21 16:00")
    const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!parts) return false;

    const [, year, month, day, hour, minute] = parts;
    const playtestDate = new Date(year, month - 1, day, hour, minute);

    // Compare with current time
    return playtestDate < new Date();
  } catch (error) {
    // If parsing fails, assume not past (safe default)
    return false;
  }
}

// Helper function to get capacity for all dates (T008)
// Dynamically discovers dates from the sheet data (column H)
//
// DESIGN: This function discovers dates from existing signup data.
// - On first page load (empty sheet): Returns empty array, frontend shows static dates
// - After first signup: Returns actual dates with capacity data
// - This means the frontend MUST handle empty dates array gracefully
//
// SOURCE OF TRUTH: playtest.html radio buttons define available dates
function getAllCapacities() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const allData = sheet.getDataRange().getValues();
  const spotsTotal = SPOTS_TOTAL;
  const minimumPlayers = MINIMUM_PLAYERS;

  // Discover unique dates from column H (index 7) - skip header row
  // Store as plain text strings
  const uniqueDates = new Set();

  for (let i = 1; i < allData.length; i++) {
    const dateValue = allData[i][7];
    if (dateValue) {
      // Store as trimmed string
      uniqueDates.add(String(dateValue).trim());
    }
  }

  // Sort dates alphabetically (ISO format sorts correctly)
  const sortedDates = Array.from(uniqueDates).sort();

  // Calculate capacity for each unique date
  return sortedDates.map(dateString => {
    // Filter signups for this specific date - simple string comparison
    const signupsForDate = allData.filter((row, index) => {
      if (index === 0) return false; // Skip header
      const rowDate = row[7];
      if (!rowDate) return false;

      // Simple string comparison (dates stored as plain text)
      return String(rowDate).trim() === dateString;
    });

    const spotsTaken = signupsForDate.length;
    const spotsRemaining = Math.max(0, spotsTotal - spotsTaken);

    // Check if date is in the past
    const isPastDate = isPastPlaytestDate(dateString);

    return {
      date: dateString,  // Plain text string (YYYY-MM-DD HH:MM)
      displayText: formatDateForEmail(dateString),
      spots_total: spotsTotal,
      spots_taken: spotsTaken,
      spots_remaining: spotsRemaining,
      minimum_players: minimumPlayers,
      has_minimum: spotsTaken >= minimumPlayers,
      is_full: spotsRemaining === 0,
      is_past_date: isPastDate  // NEW: Indicates if date has already passed
    };
  });
}

// Function to get current signup status (for checking spots) (T007)
function doGet(e) {
  try {
    const capacities = getAllCapacities();

    // Return JSON response with all dates (CORS is handled automatically by Google Apps Script)
    const output = ContentService
      .createTextOutput(JSON.stringify({
        'dates': capacities
      }))
      .setMimeType(ContentService.MimeType.JSON);

    // Note: Google Apps Script doesn't support setting custom headers on GET responses
    // CORS will work with the default '*' origin allowed by Google
    return output;

  } catch(error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'error',
        'error': error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function to verify setup
function testSetup() {
  const testData = {
    parameter: {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: new Date().toISOString(),
      spot_number: '1'
    }
  };
  
  const result = doPost(testData);
  console.log(result.getContent());
}