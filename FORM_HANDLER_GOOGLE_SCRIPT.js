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
        to: 'max@maxepunk.com, Hello@gr8ergoodgames.com', // <-- CHANGE THIS (ADD SHUAI)
        subject: `[MEMORY #${sheet.getLastRow() - 1}] ${formData.email}`,
        htmlBody: `
          <h3>MEMORY RECOVERY INITIATED</h3>
          <p><b>Subject:</b> ${formData.email}</p>
          <p><b>Memory ID:</b> #${sheet.getLastRow() - 1}</p>
          <p><b>Source:</b> ${formData.utm_source || 'direct'}</p>
          <p><b>Device:</b> ${formData.device_type || 'unknown'}</p>
          <hr>
          <p><a href="https://docs.google.com/spreadsheets/d/1e2jn4KK6nP3qE76CN7s2_-jEVYIGXBeJ8iyZkjiju8A/edit?usp=sharing">Access Memory Database</a></p>
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