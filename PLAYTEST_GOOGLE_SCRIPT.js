// Google Apps Script for About Last Night Playtest Signup
// This script handles form submissions from the playtest signup page

function doPost(e) {
  try {
    // Get the spreadsheet and sheet
    const sheet = SpreadsheetApp.getActiveSheet();
    
    // Parse form data
    const formData = e.parameter;
    
    // Get current row count to determine spot number
    const currentRows = sheet.getLastRow();
    const spotsTotal = 20;
    const spotsTaken = currentRows - 1; // Subtract header row
    const spotsRemaining = Math.max(0, spotsTotal - spotsTaken);
    
    // Determine status
    const status = spotsTaken < spotsTotal ? 'Confirmed' : 'Waitlist';
    const actualSpotNumber = spotsTaken + 1;
    
    // Create timestamp
    const timestamp = new Date();
    
    // Append data to sheet
    sheet.appendRow([
      formData.name || '',
      formData.email || '',
      timestamp,
      actualSpotNumber,
      status
    ]);
    
    // Send confirmation email to participant
    if (formData.email) {
      const subject = status === 'Confirmed' 
        ? `✓ About Last Night Playtest - Spot ${actualSpotNumber} Confirmed`
        : `⏳ About Last Night Playtest - Waitlist Position ${actualSpotNumber - spotsTotal}`;
      
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
                <p style="margin: 5px 0;"><strong>Date:</strong> Sunday, September 21</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> 4:00 PM</p>
                <p style="margin: 5px 0;"><strong>Duration:</strong> 90 minutes</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> Off the Couch Games, Fremont</p>
                <p style="margin: 5px 0;"><strong>Your Spot:</strong> #${actualSpotNumber} of ${spotsTotal}</p>
              </div>
              
              <h3 style="color: #cc0000;">What to Expect:</h3>
              <ul style="line-height: 1.8;">
                <li>90-minute immersive crime thriller experience</li>
                <li>Puzzle solving, roleplay, and memory trading mechanics</li>
                <li>You'll be testing an in-progress version - your feedback is valuable!</li>
                <li>Comfortable clothes recommended</li>
              </ul>
              
              <p style="background: #fff0f0; border: 1px solid #cc0000; padding: 15px; margin-top: 20px;">
                <strong style="color: #cc0000;">Important:</strong> Please arrive 10 minutes early for check-in. 
                If you can't make it, please let us know ASAP so we can offer your spot to someone on the waitlist.
              </p>
              
              <p style="margin-top: 20px; color: #666;">
                Questions? Reply to this email.<br>
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
                <p style="margin: 5px 0;"><strong>Session date:</strong> Sunday, September 21 at 4:00 PM</p>
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
    
    // Send notification to organizers for key milestones
    const organizerEmail = 'max@maxepunk.com'; // <-- REPLACE WITH YOUR EMAIL
    
    if (spotsTaken === 15 || spotsTaken === 17 || spotsTaken === 19 || spotsTaken === 20) {
      MailApp.sendEmail({
        to: organizerEmail,
        subject: `🚨 Playtest Alert: ${spotsRemaining} spots remaining!`,
        htmlBody: `
          <h2>Playtest Signup Update</h2>
          <p><strong>${formData.name}</strong> just claimed spot #${actualSpotNumber}</p>
          <p style="font-size: 24px; color: ${spotsRemaining <= 3 ? '#cc0000' : '#ff9900'};">
            <strong>${spotsRemaining} spots remaining</strong>
          </p>
          <p><a href="https://docs.google.com/spreadsheets/d/1s9dDSSqTKc9wTtVvj-4U4fY_jzIdNCrIiI5E_atSKG4/edit?usp=sharing">View signup sheet</a></p>
        `
      });
    }
    
    // Return current status
    return ContentService
      .createTextOutput(JSON.stringify({
        'result': 'success',
        'spot_number': actualSpotNumber,
        'status': status,
        'spots_remaining': spotsRemaining
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

// Function to get current signup status (for checking spots)
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const currentRows = sheet.getLastRow();
    const spotsTotal = 20;
    const spotsTaken = currentRows - 1; // Subtract header row
    const spotsRemaining = Math.max(0, spotsTotal - spotsTaken);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        'spots_total': spotsTotal,
        'spots_taken': spotsTaken,
        'spots_remaining': spotsRemaining,
        'is_full': spotsTaken >= spotsTotal
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
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