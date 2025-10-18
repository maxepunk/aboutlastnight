# Research: Content-First Codebase Refactor

**Feature**: Content-First Codebase Refactor
**Branch**: `001-content-first-refactor`
**Date**: 2025-01-19

## Purpose

This document consolidates research findings for all NEEDS CLARIFICATION items identified in the Technical Context section of plan.md. Research addresses three key unknowns:

1. HTML validation tooling for git hooks without npm dependencies
2. File organization patterns for content-first static websites
3. localStorage implementation for form data recovery

---

## 1. HTML Validation Tooling

### Decision: HTML Tidy

**What**: Standalone C binary for HTML validation (tidy-html5), available via system package manager.

**Why Chosen**:
- ✅ True zero-dependency: C binary, no Java/Python/Node.js runtime required
- ✅ Already available on most Linux systems via `apt install tidy`
- ✅ Fast execution (native binary)
- ✅ Clear error messages with line/column numbers for non-technical users
- ✅ Simple git hook integration via exit codes (1=warnings, 2=errors)
- ✅ Can fix HTML automatically (not just validate)

**Installation**:
```bash
sudo apt-get install tidy
```

**Git Hook Integration**:
```bash
#!/bin/bash
# .git/hooks/pre-commit

HTML_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.html$')

if [ -z "$HTML_FILES" ]; then
    exit 0
fi

if ! command -v tidy &> /dev/null; then
    echo "WARNING: tidy not installed, skipping validation"
    exit 0  # Don't block commit if tool unavailable
fi

ERRORS=0
for file in $HTML_FILES; do
    tidy -q -e "$file" 2>&1
    if [ $? -eq 2 ]; then
        echo "❌ ERROR: $file has validation errors"
        ERRORS=1
    fi
done

if [ $ERRORS -eq 1 ]; then
    echo "HTML validation failed. Fix errors before committing."
    echo "To skip: git commit --no-verify"
    exit 1
fi
```

### Alternatives Considered

| Tool | Why Rejected |
|------|--------------|
| **html5validator** (Python) | Requires pip install + Java runtime (violates zero-dependency) |
| **vnu binary** | 50-100MB download, manual installation, slower than tidy |
| **xmllint** | Less comprehensive HTML validation, cryptic errors |
| **W3C Validator API** | Requires internet connection, rate limits, external dependency |
| **Python html.parser** | Parser not validator, can't detect structural errors |

### Risks & Mitigations

**Risk**: HTML Tidy has experimental/incomplete HTML5 support
**Mitigation**: Configure tidy for HTML5 mode (`doctype: html5`), sufficient for catching unclosed tags and malformed markup

**Risk**: Content editor doesn't have tidy installed
**Mitigation**: Git hook gracefully degrades (warns but allows commit), installation guide in documentation

---

## 2. File Organization Pattern

### Decision: HTML with Clear Comment Markers

**What**: Single HTML file organized into clearly marked sections using distinctive HTML comments.

**Why Chosen**:
- ✅ **Searchability**: Content editors can use Ctrl+F to find any text instantly
- ✅ **Zero dependencies**: No build tools, frameworks, or JavaScript required for basic functionality
- ✅ **WYSIWYG**: What's in the file is what displays (no template compilation)
- ✅ **Works on GitHub Pages**: No server-side includes needed
- ✅ **Progressive enhancement**: Content works without JavaScript
- ✅ **Perfect SEO**: All content in HTML source (not loaded via JS)
- ✅ **Simple local preview**: Open file:// in browser, no server needed

**Implementation Example**:
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: PRICING AND DATES                     -->
<!-- SAFE TO EDIT: Update pricing, dates, and availability   -->
<!-- FIND WITH: Search for "PRICING AND DATES"               -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="pricing">
  <!-- PRICE: Main ticket price (update before launch) -->
  <p class="price">$75/person</p>

  <!-- DATES: Preview performances -->
  <p class="preview-dates">October 4-12 Preview</p>
</section>
<!-- END CONTENT SECTION: PRICING AND DATES -->
```

**File Structure**:
```
index.html           # Main shell with clear comment sections
css/
├── base.css        # Variables, resets, typography
├── layout.css      # Grid, sections, responsive
├── components.css  # Reusable patterns (cards, accordions)
└── animations.css  # Parallax, transitions, motion
js/
├── forms.js        # Form submission + localStorage recovery
├── interactions.js # Accordions, sticky header, scroll effects
└── utils.js        # Helpers, analytics, tracking
docs/
├── CONTENT_GUIDE.md    # Where to find/update each content type
└── MIGRATION_GUIDE.md  # Old locations → new locations mapping
.githooks/
└── pre-commit      # HTML validation with tidy
```

### Alternatives Considered

| Approach | Why Rejected |
|----------|--------------|
| **HTML Partials via JS fetch** | Content not searchable until JS executes, requires local server for preview, breaks without JS |
| **JSON + JS rendering** | Requires understanding JSON syntax (unforgiving), text search won't find content, zero SEO |
| **Multiple HTML files** | Better for multi-page sites, current site is single-page |
| **Web Components** | Requires JS knowledge to modify, content in JS files not searchable |
| **Static site generators** | Violates zero-dependency constraint, requires build tools |

### Optional Enhancement: Shared Components

For truly shared elements (analytics snippets, legal footer), use JavaScript fetch as progressive enhancement:

```html
<!-- Shared component loaded via JS (optional enhancement) -->
<div id="analytics-footer"></div>
<script>
  fetch('/components/analytics.html')
    .then(r => r.text())
    .then(html => document.getElementById('analytics-footer').innerHTML = html)
    .catch(() => console.log('Analytics not loaded'));
</script>
```

**Philosophy**: Start with monolithic HTML, add separation only where proven necessary.

---

## 3. localStorage Form Recovery

### Decision: Save on Error + Exponential Backoff Retry

**What**: Preserve form data to localStorage when submission fails, implement automatic retry with exponential backoff, show recovery prompt on page reload.

**Why Chosen**:
- ✅ **Simplest implementation**: Save only when actually needed (on error)
- ✅ **Lowest overhead**: No continuous auto-save during typing
- ✅ **Browser compatibility**: localStorage has 100% support in modern browsers
- ✅ **Low security risk**: No sensitive data in forms (email/name only)
- ✅ **Resilience**: Data survives backend downtime, network failures, browser crashes

**Implementation Strategy**:

**1. Save on Submission Failure**
```javascript
const FormRecovery = {
  storageKey: 'aln_form_recovery',
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days

  save(formData) {
    const data = {
      value: formData,
      timestamp: Date.now(),
      expiry: Date.now() + this.ttl
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to save form data:', e);
      return false;
    }
  },

  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return null;

      const data = JSON.parse(stored);
      if (Date.now() > data.expiry) {
        this.clear();
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear:', e);
    }
  }
};
```

**2. Exponential Backoff Retry**

Formula: `delay = (2^retries) * 100ms + random(0-100ms)`

Retry schedule:
- 1st retry: ~200ms
- 2nd retry: ~400ms
- 3rd retry: ~800ms
- Max retries: 3 attempts

**Retryable errors**: Network failures, timeout, HTTP 408/429/500-599
**Non-retryable errors**: HTTP 400/401/403/404 (client errors)

**3. Recovery UX**

```
On page load with saved data:
┌────────────────────────────────────┐
│ ℹ️ We found unsaved form data from  │
│   October 17, 2025 at 2:30 PM      │
│   [Restore Data] [Dismiss]         │
└────────────────────────────────────┘

On submission failure:
"Unable to submit. Your data has been saved. [Retry Now]"
```

**4. Clear After Success**
```javascript
// Only clear after confirmed successful submission
if (response.ok) {
  FormRecovery.clear();
}
```

### Key Implementation Details

**When to Save**:
- ✅ After submission fails (all retries exhausted)
- ✅ On `beforeunload` if submission in progress
- ❌ NOT on every keystroke (save overhead for future enhancement)

**When to Clear**:
- ✅ After successful submission (confirmed by server)
- ✅ When user dismisses recovery prompt
- ✅ After expiry (7 days, lazy deletion on load)
- ❌ NOT on page load (might have recovery data)

**Data Expiration**: 7-day TTL (balances utility vs. staleness)

**Browser Compatibility Edge Cases**:
- **Safari Private Mode**: localStorage available but 0 bytes quota → wrap in try-catch
- **Chrome Incognito**: localStorage works but deleted on session end → acceptable
- **Storage quota**: 2-5MB minimum across all browsers → 500 bytes form data is negligible

**Security Considerations**:
- ✅ Safe to store: Email, name, checkbox preferences (not sensitive)
- ❌ Never store: Authentication tokens, passwords, API keys
- ✅ Sanitize on retrieval: Use `.textContent` not `.innerHTML` when displaying

### Alternatives Considered

| Approach | Why Rejected |
|----------|--------------|
| **Throttled auto-save on input** | Higher complexity, save on error is simpler and sufficient for launch |
| **Debounced auto-save** | Dangerous - user might leave before debounce fires |
| **Session storage** | Cleared on tab close, localStorage survives browser crashes |
| **Cookies** | 4KB limit, sent with every request (performance overhead) |
| **IndexedDB** | Overkill for simple form recovery, more complex API |

### Future Enhancement (Post-Launch)

For playtest form (more fields, higher value data):
- Throttled auto-save every 3 seconds during input
- Visual "Saved" indicator
- Show age of saved data in recovery prompt

---

## Summary of Decisions

| Unknown | Decision | Rationale |
|---------|----------|-----------|
| **HTML Validation** | HTML Tidy via git hooks | Zero-dependency C binary, fast, clear errors |
| **File Organization** | Comment-marked HTML sections | Searchable, WYSIWYG, works without build tools |
| **Form Recovery** | localStorage + exponential backoff | Simple, reliable, low overhead |

---

## Impact on Technical Context

All "NEEDS CLARIFICATION" items are now resolved:

✅ **HTML validation tooling**: Use HTML Tidy (standalone binary, zero dependencies)
✅ **File organization pattern**: Comment-marked sections in HTML (not separate templates)
✅ **localStorage implementation**: Save on error with 7-day TTL + exponential backoff retry

**Next Phase**: Proceed to Phase 1 (Design & Contracts) to define data model and API contracts.

---

## References

- HTML Tidy: https://www.html-tidy.org/
- localStorage Best Practices: LogRocket Blog (2024)
- Exponential Backoff: Advanced Web Machinery (2024)
- Static Site Organization: CSS-Tricks, Smashing Magazine
- Browser Compatibility: MDN Web Docs, Can I Use (2024)
