/**
 * Mock backend responses for Google Apps Script endpoints
 *
 * Used in quick tests to avoid hitting real backends.
 * Simulates success/error responses, capacity data, and network conditions.
 */

/**
 * Setup route mocking for a Playwright page
 * IMPORTANT: Call this BEFORE page.goto()
 */
async function setupMockBackends(page) {
  // Mock Google Apps Script endpoints (both script.google.com and script.googleusercontent.com)
  await page.route('**/*script.google*.com/**', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Handle POST requests (form submissions)
    if (method === 'POST') {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 50));

      // Return success response matching backend structure
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          result: 'success',
          spot_number: 4,
          status: 'Confirmed',
          spots_taken: 4,
          spots_remaining: 16,
          spots_total: 20,
          minimum_players: 5,
          has_minimum: false,
        }),
      });
    }

    // Handle GET requests (capacity data for playtest)
    else if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          dates: [
            {
              date: '2025-09-21 16:00',
              displayText: 'September 21 at 4:00 PM',
              spots_total: 20,
              spots_taken: 15,
              spots_remaining: 5,
              minimum_players: 5,
              has_minimum: true,
              is_full: false,
              is_past_date: false,
            },
            {
              date: '2025-10-26 15:00',
              displayText: 'October 26 at 3:00 PM',
              spots_total: 20,
              spots_taken: 8,
              spots_remaining: 12,
              minimum_players: 5,
              has_minimum: true,
              is_full: false,
              is_past_date: false,
            },
            {
              date: '2025-11-04 18:30',
              displayText: 'November 4 at 6:30 PM',
              spots_total: 20,
              spots_taken: 3,
              spots_remaining: 17,
              minimum_players: 5,
              has_minimum: false,
              is_full: false,
              is_past_date: false,
            },
          ],
        }),
      });
    }

    // Handle OPTIONS requests (CORS preflight)
    else if (method === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  });
}

/**
 * Mock backend with network error
 */
async function setupMockNetworkError(page) {
  await page.route('**/*script.google*.com/**', async (route) => {
    await route.abort('failed');
  });
}

/**
 * Mock backend with slow response
 */
async function setupMockSlowResponse(page, delayMs = 5000) {
  await page.route('**/*script.google*.com/**', async (route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        result: 'success',
        spot_number: 1,
        status: 'Confirmed',
        spots_taken: 1,
        spots_remaining: 19,
        spots_total: 20,
        minimum_players: 5,
        has_minimum: false,
      }),
    });
  });
}

/**
 * Mock backend with error response
 */
async function setupMockErrorResponse(page) {
  await page.route('**/*script.google*.com/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        result: 'error',
        error: 'Internal server error',
      }),
    });
  });
}

/**
 * Mock capacity data for specific dates
 */
function createMockCapacityData(dates) {
  const capacityArray = [];

  dates.forEach(dateString => {
    const spotsTaken = Math.floor(Math.random() * 20);
    const spotsRemaining = 20 - spotsTaken;

    capacityArray.push({
      date: dateString,
      displayText: dateString,
      spots_total: 20,
      spots_taken: spotsTaken,
      spots_remaining: spotsRemaining,
      minimum_players: 5,
      has_minimum: spotsTaken >= 5,
      is_full: spotsRemaining === 0,
      is_past_date: false,
    });
  });

  return {
    dates: capacityArray,
  };
}

module.exports = {
  setupMockBackends,
  setupMockNetworkError,
  setupMockSlowResponse,
  setupMockErrorResponse,
  createMockCapacityData,
};
