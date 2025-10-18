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
    
    // Generate a hash-based memory ID from timestamp
    // This creates a 5-digit number that looks random but is deterministic
    const timeHash = timestamp.getTime().toString();
    const hashValue = timeHash.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const memoryId = 28354 + (hashValue % 71646); // Results in range 28354-99999
    
    // Send confirmation email to participant
    if (formData.email) {
      MailApp.sendEmail({
        to: formData.email,
        subject: 'MEMORY RECOVERY INITIATED | About Last Night',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000;">
            <div style="background: linear-gradient(135deg, #000 0%, #1a0000 100%); padding: 30px; text-align: center; border-bottom: 2px solid #cc0000;">
              <h1 style="color: #cc0000; margin: 0; font-size: 28px; letter-spacing: 2px; text-shadow: 0 0 20px rgba(204, 0, 0, 0.5);">MEMORY RECOVERY INITIATED</h1>
              <p style="color: rgba(255, 255, 255, 0.6); margin-top: 10px; font-size: 12px; letter-spacing: 3px;">SUBJECT #${memoryId}</p>
            </div>
            <div style="background: #0a0a0a; padding: 40px 30px; color: #fff;">
              <div style="border-left: 3px solid #cc0000; padding-left: 20px; margin-bottom: 30px;">
                <h2 style="color: #fff; font-size: 20px; margin-bottom: 15px;">Your memories are being processed...</h2>
                <p style="color: rgba(255, 255, 255, 0.8); line-height: 1.6; font-size: 16px;">
                  The fragments from last night are locked away, but not lost. When the investigation opens, you'll be among the first to know.
                </p>
              </div>
              
              <div style="background: rgba(204, 0, 0, 0.1); border: 1px solid rgba(204, 0, 0, 0.3); padding: 20px; margin: 25px 0;">
                <h3 style="color: #cc0000; margin-top: 0; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Investigation Timeline</h3>
                <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0; font-size: 15px;">
                  Investigation Ongoing: <strong style="color: #cc0000;">NOV 14 - DEC 28:</strong> 
                </p>
                <p style="color: rgba(255, 255, 255, 0.7); margin-top: 15px; font-size: 14px;">
                  <strong>Location:</strong> Off the Couch Games, Fremont CA<br>
                  <strong>Duration:</strong> 90-120 minutes<br>
                  <strong>Players:</strong> 5-20 per session<br>
                  <strong>Price:</strong> $75 per investigator
                </p>
              </div>
              
              <div style="margin-top: 30px; padding: 20px; background: rgba(0, 0, 0, 0.5); border-top: 1px solid rgba(204, 0, 0, 0.2);">
                <p style="color: rgba(255, 255, 255, 0.6); font-size: 14px; line-height: 1.6; font-style: italic; text-align: center;">
                  "Some memories are worth killing for."
                </p>
              </div>
              
              <div style="margin-top: 35px; text-align: center;">
                <a href="https://aboutlastnightgame.com" style="display: inline-block; padding: 12px 30px; background: transparent; border: 2px solid #cc0000; color: #fff; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; font-size: 14px; transition: all 0.3s;">
                  Return to Investigation
                </a>
              </div>
              
              <div style="margin-top: 30px; text-align: center;">
                <p style="color: rgba(255, 255, 255, 0.5); font-size: 13px;">
                  You're receiving this because you initiated memory recovery at aboutlastnightgame.com<br>
                  Your memory ID: #${memoryId}
                </p>
              </div>
            </div>
          </div>
        `
      });
    }
    
    // Send notification to organizers for early signups (first 50)
    if (formData.email && sheet.getLastRow() <= 51) { // Including header row
      MailApp.sendEmail({
        to: 'max@maxepunk.com, Hello@gr8ergoodgames.com', // <-- CHANGE THIS (ADD SHUAI)
        subject: `[MEMORY #${memoryId}] ${formData.email}`,
        htmlBody: `
          <h3>MEMORY RECOVERY INITIATED</h3>
          <p><b>Subject:</b> ${formData.email}</p>
          <p><b>Memory ID:</b> #${memoryId}</p>
          <p><b>Source:</b> ${formData.utm_source || 'direct'}</p>
          <p><b>Device:</b> ${formData.device_type || 'unknown'}</p>
          <hr>
          <p><a href="https://docs.google.com/spreadsheets/d/1e2jn4KK6nP3qE76CN7s2_-jEVYIGXBeJ8iyZkjiju8A/edit?usp=sharing">Access Memory Database</a></p>
        `
      });
    }
    
    // Return success
    return ContentService
      .createTextOutput(JSON.stringify({'result': 'success', 'memory_id': memoryId}))
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