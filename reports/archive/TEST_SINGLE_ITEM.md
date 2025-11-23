# Single Item Analysis Test

**Purpose:** Measure actual timing for single-item analysis to inform architecture decisions.

## Prerequisites

1. Server running: `npm start` in reports/ directory
2. Authenticated (logged in to console)
3. Items loaded from Notion

---

## Method 1: Test via Frontend Console

**Steps:**

1. Open console in browser: `https://console.aboutlastnightgame.com` (or localhost:3000)
2. Click "Fetch & Deep Scan" to load items (DON'T wait for analysis)
3. Open browser DevTools (F12)
4. Go to Console tab
5. Run this code:

```javascript
// Get first item from inventory
const testItem = inventory[0];

// Test single-item analysis
fetch('/api/test-single-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: testItem })
})
.then(r => r.json())
.then(result => {
    console.log('=== TEST RESULTS ===');
    console.log('Duration:', result.duration, 'seconds');
    console.log('Prompt size:', result.promptSize.kilobytes, 'KB');
    console.log('Response size:', result.responseSize.kilobytes, 'KB');
    console.log('Analysis result:', result.result);

    // Save for reference
    window.testResult = result;
})
.catch(err => console.error('Test failed:', err));
```

6. **Check server terminal** for detailed logs
7. **Check browser console** for results

---

## Method 2: Test via curl (Requires Session Cookie)

**Note:** This is harder because you need to extract the session cookie. Use Method 1 instead.

---

## What to Measure

Run the test **3-5 times** and record:

| Run | Duration (s) | Prompt Size (KB) | Response Size (KB) | Success? |
|-----|--------------|------------------|-------------------|----------|
| 1   |              |                  |                   |          |
| 2   |              |                  |                   |          |
| 3   |              |                  |                   |          |
| 4   |              |                  |                   |          |
| 5   |              |                  |                   |          |
| **Avg** |          |                  |                   |          |

---

## Calculations

**After getting average duration:**

1. **Sequential time for 150 items:**
   ```
   150 items × avg_duration = _____ seconds = _____ minutes
   ```

2. **Estimated batch time (8 items):**
   ```
   8 items × avg_duration = _____ seconds
   ```

   **Is this under 90 seconds?**
   - Yes → Batching viable
   - No → Need smaller batches or different approach

3. **Number of batches:**
   ```
   150 items ÷ 8 items/batch = 18.75 → 19 batches
   ```

4. **Total time with concurrency (3 parallel):**
   ```
   19 batches ÷ 3 concurrent = 6.33 → 7 rounds
   7 rounds × batch_duration = _____ seconds = _____ minutes
   ```

---

## Example Results (Fill in after testing)

```
Average single-item duration: ____ seconds
Estimated batch duration (8 items): ____ seconds
Total time for 150 items (concurrent): ____ minutes

Batch size recommendation: ____
Concurrency recommendation: ____
Expected completion time: ____ minutes
```

---

## Next Steps

**Based on results:**

### If single item < 10s:
- 8-item batches will complete in ~80s (safe)
- Use concurrent batching architecture
- 150 items in ~3-4 minutes

### If single item 10-15s:
- 8-item batches will be ~80-120s (risky)
- Use 5-item batches instead
- May need 4 concurrent for speed

### If single item > 15s:
- Batching problematic (even 5 items = 75s+)
- Need streaming OR prompt optimization
- Investigate why analysis is slow

---

## Debugging

### Test fails with 401 Unauthorized
**Fix:** Make sure you're logged in first
1. Visit console in browser
2. Enter password
3. Then run test

### Test fails with timeout
**Important data point!** Even single item times out.
- Record how long it took before timeout
- This indicates prompt or analysis complexity issue
- May need to simplify prompt or use streaming

### Test succeeds but takes >30s
- Still useful data
- Indicates batching won't work well
- May need streaming for all operations

---

## Clean Up

After testing, the endpoint will remain in server.js.

**To remove later:**
1. Delete `/api/test-single-item` endpoint from server.js
2. Delete this file (TEST_SINGLE_ITEM.md)

**Keep endpoint if:**
- You want to test different prompt variations
- You want to benchmark improvements
- You want to compare models (haiku vs sonnet)

---

## Server Logs to Watch

Look for these in server terminal:

```
=== SINGLE ITEM ANALYSIS TEST ===
Start time: 2025-11-23T...
Item ID: ...
Item name: ...
Prompt size: ... characters
Prompt size: ... KB
[... Claude processing ...]
End time: 2025-11-23T...
Duration: ... seconds
Response size: ... characters
Response size: ... KB
Parsed successfully: 1 results
=== TEST COMPLETE ===
```

The **Duration** line is the key metric.

---

**Ready to test!** Start with Method 1 (browser console) - it's the easiest.
