// Google Apps Script for About Last Night Feedback Form
// This script handles form submissions from the post-show feedback page
//
// ═══════════════════════════════════════════════════════════
// DEPLOYMENT SETTINGS
// ═══════════════════════════════════════════════════════════
// 1. Create a new Google Sheet for feedback data
// 2. Extensions → Apps Script → paste this code
// 3. Deploy as Web App:
//    - Execute as: Me (your account)
//    - Who has access: Anyone (required for CORS to work)
// 4. Copy the deployment URL to js/feedback-interactions.js
//
// GOOGLE SHEET SETUP:
// Add these column headers in row 1:
// Timestamp | Session Date | Session Date Full | Memorable Moment | NPS Score | Improvement | Email | Email Consent | User Agent | Referrer
//
// Session Date = MMDD format (e.g., "1123") - matches report naming scheme
// Session Date Full = YYYY-MM-DD format (e.g., "2025-11-23") - human readable
//
// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Organizer notification email (receives alerts for new feedback)
const ORGANIZER_EMAIL = 'max@maxepunk.com';

// Set to true to receive email notifications for each feedback submission
const SEND_NOTIFICATIONS = true;

// Set to true to only notify for low NPS scores (detractors: 1-6)
const ONLY_NOTIFY_LOW_SCORES = false;

// ═══════════════════════════════════════════════════════════
// MAIN FORM HANDLER
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    // Get the spreadsheet and sheet
    const sheet = SpreadsheetApp.getActiveSheet();

    // Parse form data
    const formData = e.parameter;

    // Create timestamp
    const timestamp = new Date();

    // Extract form fields
    const sessionDate = formData.sessionDate || '';           // MMDD format
    const sessionDateFull = formData.sessionDateFull || '';   // YYYY-MM-DD format
    const memorableMoment = formData.memorableMoment || '';
    const npsScore = formData.npsScore || '';
    const improvement = formData.improvement || '';
    const email = formData.email || '';
    const emailConsent = formData.emailConsent === 'true' ? 'Yes' : 'No';
    const userAgent = formData.userAgent || '';
    const referrer = formData.referrer || '';

    // Append data to sheet
    // Columns: Timestamp | Session Date | Session Date Full | Memorable Moment | NPS Score | Improvement | Email | Email Consent | User Agent | Referrer
    sheet.appendRow([
      timestamp,
      sessionDate,
      sessionDateFull,
      memorableMoment,
      npsScore,
      improvement,
      email,
      emailConsent,
      userAgent,
      referrer
    ]);

    // Send notification to organizers (optional)
    if (SEND_NOTIFICATIONS) {
      const npsNum = parseInt(npsScore, 10);
      const isDetractor = !isNaN(npsNum) && npsNum <= 6;

      // Send notification if configured to always send, or if it's a low score
      if (!ONLY_NOTIFY_LOW_SCORES || isDetractor) {
        sendOrganizerNotification({
          timestamp,
          sessionDate,
          memorableMoment,
          npsScore,
          improvement,
          email,
          emailConsent,
          isDetractor
        });
      }
    }

    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'success',
        'message': 'Feedback received'
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(error) {
    // Log error for debugging
    console.error('Feedback submission error:', error);

    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'error',
        'error': error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════
// ORGANIZER NOTIFICATION
// ═══════════════════════════════════════════════════════════

function sendOrganizerNotification(data) {
  const {
    timestamp,
    sessionDate,
    memorableMoment,
    npsScore,
    improvement,
    email,
    emailConsent,
    isDetractor
  } = data;

  // Format session date for display
  const dateDisplay = sessionDate ? formatSessionDate(sessionDate) : 'Not specified';

  // Determine NPS category and color
  let npsCategory = '';
  let npsColor = '#666';
  if (npsScore) {
    const score = parseInt(npsScore, 10);
    if (score >= 9) {
      npsCategory = 'Promoter';
      npsColor = '#00aa00';
    } else if (score >= 7) {
      npsCategory = 'Passive';
      npsColor = '#ff9900';
    } else {
      npsCategory = 'Detractor';
      npsColor = '#cc0000';
    }
  }

  // Build subject line
  const subjectEmoji = isDetractor ? '⚠️' : '📝';
  const subject = `${subjectEmoji} ALN Feedback - ${dateDisplay}${npsScore ? ` - NPS: ${npsScore}` : ''}`;

  // Build HTML email body
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #000; padding: 20px; text-align: center;">
        <h1 style="color: #cc0000; margin: 0;">New Feedback Received</h1>
      </div>
      <div style="background: #f5f5f5; padding: 30px; color: #333;">

        <div style="background: #fff; border-left: 4px solid #cc0000; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 5px 0;"><strong>Session:</strong> ${dateDisplay}</p>
          <p style="margin: 5px 0;"><strong>Submitted:</strong> ${timestamp.toLocaleString()}</p>
          ${npsScore ? `<p style="margin: 5px 0;"><strong>NPS Score:</strong> <span style="color: ${npsColor}; font-weight: bold;">${npsScore}/10 (${npsCategory})</span></p>` : ''}
        </div>

        ${memorableMoment ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #cc0000; margin-bottom: 10px;">Most Memorable Moment:</h3>
          <div style="background: #fff; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(memorableMoment)}</div>
        </div>
        ` : ''}

        ${improvement ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #cc0000; margin-bottom: 10px;">Suggested Improvement:</h3>
          <div style="background: #fff; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(improvement)}</div>
        </div>
        ` : ''}

        ${email ? `
        <div style="background: #fff; border-left: 4px solid ${emailConsent === 'Yes' ? '#00aa00' : '#999'}; padding: 15px; margin-top: 20px;">
          <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Opted into updates:</strong> ${emailConsent}</p>
        </div>
        ` : '<p style="color: #666; font-style: italic;">No email provided</p>'}

      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: ORGANIZER_EMAIL,
    subject: subject,
    htmlBody: htmlBody
  });
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Format session date (MMDD format) for display
 * e.g., "1123" → "November 23"
 */
function formatSessionDate(dateCode) {
  if (!dateCode || dateCode.length !== 4) {
    return dateCode || 'Unknown';
  }

  const month = parseInt(dateCode.substring(0, 2), 10);
  const day = parseInt(dateCode.substring(2, 4), 10);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (month >= 1 && month <= 12) {
    return `${monthNames[month - 1]} ${day}`;
  }

  return dateCode;
}

/**
 * Escape HTML to prevent injection in email notifications
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTION
// ═══════════════════════════════════════════════════════════

/**
 * Test the form submission handler
 * Run this in the Apps Script editor to verify setup
 */
function testFeedbackSubmission() {
  const testData = {
    parameter: {
      sessionDate: '1123',
      memorableMoment: 'The moment when Blake revealed the truth about the memory tokens.',
      npsScore: '9',
      improvement: 'Maybe a bit more time for the puzzle solving phase.',
      email: 'test@example.com',
      emailConsent: 'true',
      userAgent: 'Test Script',
      referrer: ''
    }
  };

  const result = doPost(testData);
  console.log('Test result:', result.getContent());
}
