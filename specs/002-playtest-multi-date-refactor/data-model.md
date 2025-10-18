# Data Model: Playtest Multi-Date Refactor

**Phase 1 Design Output** | **Date**: 2025-10-18

## Overview

This document defines the data entities, relationships, and validation rules for the playtest multi-date signup system. The model extends the existing single-date playtest system to support multiple independent playtest sessions.

---

## Entity Definitions

### 1. PlaytestDate

Represents a specific playtest session with independent capacity tracking.

**Fields**:

| Field | Type | Description | Validation | Example |
|-------|------|-------------|------------|---------|
| `dateValue` | String (ISO 8601) | Unique identifier and display value | Required, format: `YYYY-MM-DD HH:MM` | `"2025-09-21 16:00"` |
| `displayText` | String | Human-readable label for UI | Required, max 50 chars | `"September 21 at 4:00 PM"` |
| `spotsTotal` | Integer | Maximum capacity for this session | Required, > 0, <= 20 | `20` |
| `spotsTaken` | Integer | Current signup count | >= 0, <= spotsTotal + waitlist | `18` |
| `spotsRemaining` | Integer | Computed: spotsTotal - spotsTaken | >= 0 | `2` |
| `minimumPlayers` | Integer | Minimum required for session viability | Required, > 0, < spotsTotal | `5` |
| `hasMinimum` | Boolean | Computed: spotsTaken >= minimumPlayers | true/false | `true` |

**Derivations**:
```javascript
spotsRemaining = Math.max(0, spotsTotal - spotsTaken)
hasMinimum = (spotsTaken >= minimumPlayers)
isAvailable = (spotsRemaining > 0 || allowWaitlist)
```

**State Transitions**:
1. **Below Minimum** (spotsTaken < minimumPlayers): Show "X/5 minimum players required"
2. **Available** (hasMinimum && spotsRemaining > 0): Show "N spots remaining"
3. **Low Capacity** (spotsRemaining <= 5 && > 3): Visual warning state (yellow)
4. **Critical** (spotsRemaining <= 3 && > 0): Visual critical state (red pulsing)
5. **Full** (spotsRemaining == 0): Show "Playtest Full" + waitlist option

**Invariants**:
- `spotsTaken` never decreases (append-only signups)
- `spotsTotal` is fixed per date (not editable via UI)
- `minimumPlayers` is constant (5) across all dates

---

### 2. SignupRecord

Links a participant to a specific playtest date with status tracking.

**Fields**:

| Field | Type | Description | Validation | Example |
|-------|------|-------------|------------|---------|
| `name` | String | Participant full name | Required, 1-100 chars | `"Jane Doe"` |
| `email` | String (Email) | Contact email | Required, valid email format | `"jane@example.com"` |
| `timestamp` | DateTime | Signup submission time | Auto-generated (server) | `2025-09-15T14:30:00Z` |
| `spotNumber` | Integer | Sequential position in signup list | Auto-generated, > 0 | `19` |
| `status` | Enum | Confirmation status | Required, one of: `Confirmed`, `Waitlist` | `"Confirmed"` |
| `photoConsent` | Boolean | Photo consent checkbox state | Optional, default: false | `true` |
| `consentTimestamp` | DateTime | When consent recorded | Same as timestamp | `2025-09-15T14:30:00Z` |
| `selectedDate` | String (ISO 8601) | Chosen playtest date | **NEW FIELD**, Required, foreign key to PlaytestDate | `"2025-09-21 16:00"` |

**Validation Rules**:
```javascript
// Name: Non-empty, trimmed
name.trim().length > 0 && name.length <= 100

// Email: Standard RFC 5322 format
/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Selected Date: Must match a valid PlaytestDate.dateValue
selectedDate in validPlaytestDates

// Spot Number: Sequential per date
spotNumber = (count of signups for selectedDate) + 1

// Status: Based on capacity at submission time
status = (spotsTaken < spotsTotal) ? "Confirmed" : "Waitlist"
```

**Business Rules**:
1. **Unique Emails per Date**: Same email CAN sign up for multiple dates (separate signup each time)
2. **Sequential Spot Assignment**: Spot numbers are per-date sequential (not global)
3. **Immutable After Creation**: Signups cannot be edited (only cancellation via manual admin action)
4. **Waitlist Positioning**: Waitlist spot number continues sequence (e.g., spots 21, 22 for waitlist)

---

### 3. SpotCounterState (Client-Side)

UI state for real-time capacity display (lives in JavaScript, not persisted).

**Fields**:

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `currentDate` | String (ISO 8601) | Currently selected date in UI | User radio selection |
| `dateCapacities` | Map<String, PlaytestDate> | All dates' capacity data | Loaded from backend on page load |
| `lastUpdated` | DateTime | When capacity data fetched | Client timestamp |

**Update Triggers**:
1. **Page Load**: Fetch all date capacities via `GET /api/playtest-capacity`
2. **Radio Change**: Switch display to `dateCapacities[selectedDate]`
3. **Interval Refresh**: Re-fetch every 30 seconds to show live updates
4. **Post-Submission**: Update from response payload

**Display Logic**:
```javascript
function updateSpotCounter(selectedDate) {
  const data = dateCapacities[selectedDate];

  if (!data.hasMinimum) {
    display = `${data.spotsTaken}/${data.minimumPlayers} minimum`;
    styleClass = 'progress';
  } else {
    display = `${data.spotsRemaining} spots remaining`;
    styleClass = data.spotsRemaining === 0 ? 'full' :
                 data.spotsRemaining <= 3 ? 'critical' :
                 data.spotsRemaining <= 5 ? 'warning' : 'available';
  }
}
```

---

## Relationships

```
PlaytestDate (1) ──< (N) SignupRecord
  - One playtest date has many signup records
  - Signup record belongs to exactly one playtest date
  - Relationship via SignupRecord.selectedDate = PlaytestDate.dateValue
```

**Cardinality**:
- Each `PlaytestDate` can have 0 to unlimited `SignupRecords` (waitlist unlimited)
- Each `SignupRecord` references exactly 1 `PlaytestDate`
- No cascading deletes (dates are never deleted, only archived/closed)

---

## Backend Schema (Google Sheets)

**Sheet Name**: "Playtest Signups" (existing)

**Columns** (updated):

| Column | Type | Header Text | Notes |
|--------|------|-------------|-------|
| A | String | `Name` | Existing |
| B | Email | `Email` | Existing |
| C | DateTime | `Timestamp` | Existing (auto-generated) |
| D | Integer | `Spot Number` | Existing (sequential) |
| E | Enum | `Status` | Existing (`Confirmed` or `Waitlist`) |
| F | String | `Photo Consent` | Existing (`Yes` or `No`) |
| G | DateTime | `Consent Timestamp` | Existing |
| **H** | **String** | **`Selected Date`** | **NEW** (ISO format: `YYYY-MM-DD HH:MM`) |

**Migration Steps**:
1. Add column H header "Selected Date"
2. Backfill existing rows with `"2025-09-21 16:00"` (default to Sept 21 session)
3. Deploy updated Google Apps Script with date handling
4. Deploy updated playtest.html with date selection UI

**Query Patterns**:

```javascript
// Get capacity for specific date
function getCapacityForDate(dateValue) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // Filter rows where column H (index 7) matches dateValue
  const signupsForDate = data.filter(row => row[7] === dateValue);

  return {
    spotsTaken: signupsForDate.length,
    spotsTotal: 20,
    spotsRemaining: Math.max(0, 20 - signupsForDate.length)
  };
}

// Get all dates' capacities (DYNAMIC DISCOVERY - NO HARDCODED DATES)
function getAllCapacities() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // Discover unique dates from column H (index 7)
  const uniqueDates = new Set();
  for (let i = 1; i < data.length; i++) {
    const dateValue = data[i][7];
    if (dateValue && dateValue.toString().trim() !== '') {
      uniqueDates.add(dateValue.toString());
    }
  }

  // Calculate capacity for each discovered date
  return Array.from(uniqueDates).sort().map(date => ({
    date: date,
    displayText: formatDateForEmail(date),  // Dynamically parse and format
    ...getCapacityForDate(date)
  }));
}
```

**CRITICAL ARCHITECTURE NOTE**:
The backend does NOT hardcode playtest dates. It dynamically discovers dates from the database by scanning column H. This enables:
- Content editors to add/remove dates by editing `playtest.html` only
- No backend redeployment required when dates change
- True content-first architecture where HTML is the source of truth

See [research.md R7](research.md#r7-backend-date-configuration-strategy) for detailed rationale.

---

## Client-Side Data Structures

### localStorage Schema (Form Recovery)

```typescript
interface RecoveryData {
  value: {
    name: string;
    email: string;
    photoConsent: boolean;
    playtestDate: string;  // NEW: ISO date value
  };
  timestamp: number;  // Unix milliseconds
  expiry: number;     // Unix milliseconds (timestamp + 7 days)
}
```

**Storage Key**: `"aln_playtest_recovery"` (different from interest form)

---

### JavaScript Object Structure (Runtime)

**Date Capacity Map**:
```javascript
const dateCapacities = {
  "2025-09-21 16:00": {
    displayText: "September 21 at 4:00 PM",
    spotsTotal: 20,
    spotsTaken: 18,
    spotsRemaining: 2,
    minimumPlayers: 5,
    hasMinimum: true
  },
  "2025-10-26 15:00": {
    displayText: "October 26 at 3:00 PM",
    spotsTotal: 20,
    spotsTaken: 7,
    spotsRemaining: 13,
    minimumPlayers: 5,
    hasMinimum: true
  },
  "2025-11-04 18:30": {
    displayText: "November 4 at 6:30 PM",
    spotsTotal: 20,
    spotsTaken: 3,
    spotsRemaining: 17,
    minimumPlayers: 5,
    hasMinimum: false
  }
};
```

---

## Validation Summary

**Frontend Validation** (JavaScript):
- ✅ Date selection required (HTML5 `required` + JS check)
- ✅ Email format (HTML5 `type="email"`)
- ✅ Name non-empty (HTML5 `required`)
- ✅ Photo consent optional (no validation)

**Backend Validation** (Google Apps Script):
- ✅ Selected date matches known PlaytestDate values
- ✅ Email format validation (additional server-side check)
- ✅ Duplicate prevention (check if email + date already exists)
- ✅ Capacity calculation per date (filter by Selected Date column)

**Error Handling**:
- Missing date selection → Block submission, show error message
- Invalid email → HTML5 validation message
- Backend unavailable → Retry with exponential backoff (RetryManager)
- Quota exceeded → Save to localStorage, show "Saved - Try Again" message

---

## Data Flow Diagram

```
┌─────────────┐
│ User selects│
│   radio btn │
│  for date   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│  Update spot     │
│  counter display │ (from pre-loaded dateCapacities)
│  instantly       │
└──────────────────┘

       [User fills form]

       │
       ▼
┌──────────────────┐
│  Submit form     │
│  with selected   │
│  date value      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Google Apps      │
│ Script receives  │
│ POST with date   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Filter signups   │
│ by selected date │
│ Calculate spots  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Append row with  │
│ Selected Date in │
│ column H         │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Send email with  │
│ date-specific    │
│ confirmation     │
└──────────────────┘
```

---

## API Contract Reference

See [contracts/playtest-api-contract.yaml](contracts/playtest-api-contract.yaml) for detailed request/response schemas.

**Key Endpoints**:
- `GET /exec` → Returns capacity for all dates
- `POST /exec` → Submits signup with selected date

---

## Backward Compatibility

**Existing Sept 21 Signups**:
- Schema migration backfills column H with `"2025-09-21 16:00"`
- No data loss for existing signups
- Capacity calculation works retroactively

**Frontend Changes**:
- New playtest.html requires updated backend deployed first
- Old inline-script version incompatible with new schema
- No rollback to old version after migration

---

## Notes for Implementation

1. **Date Values are Keys**: The ISO date string serves as both unique identifier and relationship key
2. **No Database Joins**: Filtering signups by date happens in Google Apps Script via array filter
3. **Client-Side Caching**: Capacity data loaded once on page load, refreshed every 30s
4. **Optimistic UI**: Assume submission success, handle errors reactively
5. **Sequential Integrity**: Spot numbers are per-date sequential, not globally unique
