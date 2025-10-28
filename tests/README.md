# About Last Night - Test Suite

Automated test suite for regression prevention and pre-deployment validation.

## Quick Start

```bash
# 1. Install dependencies (one-time setup)
cd tests
npm install

# 2. Install Chromium browser (one-time setup)
npx playwright install chromium

# 3. Run quick tests (pre-commit)
npm run test:quick

# 4. Run comprehensive tests (pre-deployment)
npm run test:comprehensive
```

## Architecture

**Two-tier testing system:**

- **Quick tests** (<10s): Fast pre-commit validation with mocked backends
- **Comprehensive tests** (1-2min): Full pre-deployment validation with real integration

```
tests/
├── quick/                  # Pre-commit tests (<10s)
│   ├── forms-submit.spec.js
│   ├── playtest-capacity.spec.js
│   └── critical-elements.spec.js
├── comprehensive/          # Pre-deployment tests (1-2min)
│   ├── forms-integration.spec.js
│   ├── playtest-system.spec.js
│   ├── form-recovery.spec.js
│   ├── interactions.spec.js
│   └── performance.spec.js
└── utils/                  # Shared utilities
    ├── mock-backends.js
    ├── server.js
    └── test-helpers.js
```

## Test Modes

### Quick Mode (Pre-commit)

**When to use:** Automatic on every `git commit`

**What it tests:**
- ✅ Forms submit with mocked backends
- ✅ Playtest spot counter displays correctly
- ✅ Date selection and capacity badges work
- ✅ Critical elements exist (forms, buttons, sections)
- ✅ No JavaScript console errors
- ✅ Comment markers intact (content editor navigation)

**Speed:** <10 seconds
**Backend:** Mocked Google Apps Script responses
**Server:** Local (auto-started)

```bash
npm run test:quick
```

### Comprehensive Mode (Pre-deployment)

**When to use:** Before pushing to main, before major deployments

**What it tests:**
- ✅ Real Google Apps Script integration
- ✅ Form submissions write to Google Sheets
- ✅ Confirmation emails send
- ✅ Playtest capacity system (multi-date, waitlist)
- ✅ Form recovery from localStorage
- ✅ Interactive elements (accordions, sticky header)
- ✅ Performance targets (Lighthouse audits)

**Speed:** 1-2 minutes
**Backend:** Real Google Apps Script endpoints (test deployment)
**Server:** Local or production GitHub Pages

```bash
npm run test:comprehensive
```

## Pre-commit Hook Integration

Tests run automatically before every commit:

1. **HTML validation** (existing) - Validates structure with `tidy`
2. **Quick tests** (new) - Runs fast regression tests

If either fails, the commit is blocked.

**To skip (emergency only):**
```bash
git commit --no-verify
```

**To enable hook (if not already active):**
```bash
git config core.hooksPath .githooks
```

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

**Quick mode defaults:**
```env
TEST_MODE=quick
BASE_URL=http://localhost:8000
USE_LOCAL_SERVER=true
MOCK_BACKENDS=true
```

**Comprehensive mode defaults:**
```env
TEST_MODE=comprehensive
BASE_URL=https://aboutlastnightgame.com
USE_LOCAL_SERVER=false
MOCK_BACKENDS=false
```

## Running Specific Tests

```bash
# Run only playtest capacity tests
npx playwright test playtest-capacity

# Run only forms tests
npx playwright test forms

# Run tests in watch mode (re-run on file change)
npm run test:watch

# Run with visible browser (debugging)
HEADLESS=false npm run test:quick
```

## Test Reports

After running tests, view HTML report:

```bash
npx playwright show-report test-results/html
```

## Troubleshooting

### "Tests not installed" warning during commit

```bash
cd tests && npm install
```

### "Chromium not installed" error

```bash
npx playwright install chromium
```

### Tests timeout or fail to start server

Check if port 8000 is already in use:
```bash
lsof -i :8000
# Kill process if needed
kill -9 <PID>
```

### Mock backends not working

Ensure `MOCK_BACKENDS=true` in `.env` or environment variables.

### Comprehensive tests fail against production

1. Verify Google Apps Script endpoints are correct in `.env`
2. Test endpoints manually with curl:
```bash
curl -L https://script.google.com/macros/s/YOUR_ID/exec
```

### Browser doesn't open in comprehensive mode

Set `headless: false` in `playwright.config.js` or run with:
```bash
HEADLESS=false npm run test:comprehensive
```

## Maintenance

### Adding new tests

1. Create `.spec.js` file in `quick/` or `comprehensive/`
2. Use helpers from `utils/test-helpers.js` for consistency
3. Run tests locally to verify they pass
4. Commit (pre-commit hook will validate)

### Updating selectors

If HTML structure changes, update selectors in `utils/test-helpers.js`:
- `INDEX_SELECTORS` for index.html
- `PLAYTEST_SELECTORS` for playtest.html

### Testing Google Apps Script changes

1. Deploy test version of script to separate endpoint
2. Update `.env` with test endpoint URL
3. Run comprehensive tests with `MOCK_BACKENDS=false`

## CI/CD (Future)

To integrate with GitHub Actions, add workflow file:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd tests && npm install
      - run: npx playwright install chromium
      - run: npm run test:comprehensive
```

## Test Coverage

### Quick Tests (Pre-commit)

| Test File | Purpose | Speed |
|-----------|---------|-------|
| `forms-submit.spec.js` | Form validation & submission | ~3s |
| `playtest-capacity.spec.js` | Spot counter & date selection | ~3s |
| `critical-elements.spec.js` | Element existence & JS errors | ~2s |

### Comprehensive Tests (Pre-deployment)

| Test File | Purpose | Speed |
|-----------|---------|-------|
| `forms-integration.spec.js` | Real backend integration | ~20s |
| `playtest-system.spec.js` | Full capacity system | ~15s |
| `form-recovery.spec.js` | localStorage recovery | ~15s |
| `interactions.spec.js` | UI interactions | ~10s |
| `performance.spec.js` | Lighthouse audits | ~20s |

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project architecture and dev guidelines
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) - Deployment procedures
- [.githooks/pre-commit](../.githooks/pre-commit) - Pre-commit hook implementation

## Support

For issues or questions:
- Check this README troubleshooting section
- Review test output in terminal
- Open HTML report: `npx playwright show-report`
- Check browser console in visible mode
# Test Suite Integration Complete
