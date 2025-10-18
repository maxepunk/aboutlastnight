# API Contracts

**Feature**: Content-First Codebase Refactor
**Branch**: `001-content-first-refactor`
**Date**: 2025-01-19

## Overview

This directory contains API contracts for the About Last Night landing page. Since this is a refactoring project, these contracts document **existing** APIs that must be preserved during refactoring, not new APIs being created.

---

## Contract Files

1. **google-apps-script-form-submission.yaml** - Contract for form submission to Google Apps Script endpoints
2. **localstorage-recovery-api.yaml** - Contract for localStorage recovery API (client-side)
3. **html-validation-hook.yaml** - Contract for git hook HTML validation interface

---

## Critical Constraint

**FORMS MUST NOT BREAK**: The Google Apps Script endpoints are production infrastructure. Any changes to form field names, request format, or validation must be synchronized with the backend scripts BEFORE deploying frontend changes.

### Deployment Sequence for Form Changes

```
1. Edit backend Google Apps Script (.js files in repo for version control)
2. Deploy new version to Google Apps Script (Deploy → New Version)
3. Test backend independently (curl or Postman)
4. Update frontend HTML form fields
5. Test on GitHub Pages deployment (not localhost)
6. Verify data appears in Google Sheets
7. Verify confirmation emails sent
8. Only then merge to main branch
```

---

## Versioning

Contracts follow semantic versioning:
- **MAJOR**: Breaking change (field removed, type changed)
- **MINOR**: Backward-compatible addition (new optional field)
- **PATCH**: Documentation clarification, no functional change

Current versions:
- Form submission API: v1.0.0 (stable, in production)
- localStorage recovery API: v1.0.0 (new, to be implemented)
- HTML validation hook: v1.0.0 (new, to be implemented)
