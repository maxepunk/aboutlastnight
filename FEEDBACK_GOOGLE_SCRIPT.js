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
// Timestamp | Session Date | Session Date Full | Understood Gameplay | Puzzle Quality | Character Interest | Story Satisfaction | What Worked | Improvements | Email | Mailing List | Follow Up OK | User Agent | Referrer
//
// Session Date = MMDD format (e.g., "1123") - matches report naming scheme
// Session Date Full = YYYY-MM-DD format (e.g., "2025-11-23") - human readable
// Scale scores are 1-10 (Disagree to Agree)
//
// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Organizer notification email (receives alerts for new feedback)
const ORGANIZER_EMAIL = 'max@maxepunk.com';

// Set to true to receive email notifications for each feedback submission
const SEND_NOTIFICATIONS = true;

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

    // Scale questions (1-10)
    const understoodGameplay = formData.understoodGameplay || '';
    const puzzleQuality = formData.puzzleQuality || '';
    const characterInterest = formData.characterInterest || '';
    const storySatisfaction = formData.storySatisfaction || '';

    // Open-ended questions
    const whatWorked = formData.whatWorked || '';
    const improvements = formData.improvements || '';

    // Contact info
    const email = formData.email || '';
    const mailingListConsent = formData.mailingListConsent === 'true' ? 'Yes' : 'No';
    const followUpConsent = formData.followUpConsent === 'true' ? 'Yes' : 'No';

    // Metadata
    const userAgent = formData.userAgent || '';
    const referrer = formData.referrer || '';

    // Append data to sheet
    // Columns: Timestamp | Session Date | Session Date Full | Understood Gameplay | Puzzle Quality | Character Interest | Story Satisfaction | What Worked | Improvements | Email | Mailing List | Follow Up OK | User Agent | Referrer
    sheet.appendRow([
      timestamp,
      sessionDate,
      sessionDateFull,
      understoodGameplay,
      puzzleQuality,
      characterInterest,
      storySatisfaction,
      whatWorked,
      improvements,
      email,
      mailingListConsent,
      followUpConsent,
      userAgent,
      referrer
    ]);

    // Send notification to organizers (optional)
    if (SEND_NOTIFICATIONS) {
      sendOrganizerNotification({
        timestamp,
        sessionDate,
        understoodGameplay,
        puzzleQuality,
        characterInterest,
        storySatisfaction,
        whatWorked,
        improvements,
        email,
        mailingListConsent,
        followUpConsent
      });
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
    understoodGameplay,
    puzzleQuality,
    characterInterest,
    storySatisfaction,
    whatWorked,
    improvements,
    email,
    mailingListConsent,
    followUpConsent
  } = data;

  // Format session date for display
  const dateDisplay = sessionDate ? formatSessionDate(sessionDate) : 'Not specified';

  // Calculate average score for subject line (if all scores provided)
  const scores = [understoodGameplay, puzzleQuality, characterInterest, storySatisfaction]
    .map(s => parseInt(s, 10))
    .filter(s => !isNaN(s));
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  // Build subject line
  const subject = `📝 ALN Feedback - ${dateDisplay}${avgScore ? ` - Avg: ${avgScore}/10` : ''}`;

  // Helper to render a score with color
  function scoreWithColor(score) {
    if (!score) return '<span style="color: #999;">-</span>';
    const num = parseInt(score, 10);
    let color = '#666';
    if (num >= 8) color = '#00aa00';
    else if (num >= 5) color = '#ff9900';
    else color = '#cc0000';
    return `<span style="color: ${color}; font-weight: bold;">${score}/10</span>`;
  }

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
        </div>

        <div style="background: #fff; padding: 20px; margin-bottom: 20px;">
          <h3 style="color: #cc0000; margin: 0 0 15px 0;">Scores (1-10, Disagree→Agree)</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0;">Understood gameplay & choices</td>
              <td style="text-align: right; padding: 8px 0;">${scoreWithColor(understoodGameplay)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0;">Puzzles interesting & good challenge</td>
              <td style="text-align: right; padding: 8px 0;">${scoreWithColor(puzzleQuality)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0;">Character interesting & engaging</td>
              <td style="text-align: right; padding: 8px 0;">${scoreWithColor(characterInterest)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Satisfied with story ending</td>
              <td style="text-align: right; padding: 8px 0;">${scoreWithColor(storySatisfaction)}</td>
            </tr>
          </table>
        </div>

        ${whatWorked ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #cc0000; margin-bottom: 10px;">What Worked:</h3>
          <div style="background: #fff; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(whatWorked)}</div>
        </div>
        ` : ''}

        ${improvements ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #cc0000; margin-bottom: 10px;">What Could Improve:</h3>
          <div style="background: #fff; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(improvements)}</div>
        </div>
        ` : ''}

        ${email ? `
        <div style="background: #fff; border-left: 4px solid ${followUpConsent === 'Yes' ? '#00aa00' : '#999'}; padding: 15px; margin-top: 20px;">
          <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Mailing list:</strong> ${mailingListConsent}</p>
          <p style="margin: 5px 0;"><strong>OK to follow up:</strong> ${followUpConsent}</p>
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
      sessionDateFull: '2025-11-23',
      understoodGameplay: '8',
      puzzleQuality: '7',
      characterInterest: '9',
      storySatisfaction: '8',
      whatWorked: 'The character interactions were amazing. Loved the tension in the final act.',
      improvements: 'Maybe a bit more time for the puzzle solving phase.',
      email: 'test@example.com',
      mailingListConsent: 'true',
      followUpConsent: 'true',
      userAgent: 'Test Script',
      referrer: ''
    }
  };

  const result = doPost(testData);
  console.log('Test result:', result.getContent());
}
