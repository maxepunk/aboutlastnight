# Formatting - Detective Case Report

## Name Formatting (CRITICAL - MUST FOLLOW CONSISTENTLY)

- ALL person names must be wrapped in `<strong>` tags throughout the ENTIRE report
- This applies to: full names, first names, last names, possessive forms
- Names stay bold even when mentioned within italic evidence descriptions
- Apply to EVERY mention of EVERY character name in EVERY section

Examples:
- CORRECT: `<strong>Marcus Blackwood's</strong> <em>technical notes</em>`
- CORRECT: `<strong>Marcus</strong> built an empire`
- CORRECT: `murdered by <strong>Blake Manley</strong>`
- CORRECT: `<strong>Derek Thorn's</strong> <em>extracted memories</em>`
- WRONG: `<em>Marcus Blackwood's technical notes</em>`
- WRONG: `Marcus Blackwood's <em>technical notes</em>`
- WRONG: `Marcus built an empire`
- WRONG: `<em>Derek Thorn's extracted memories</em>`

## HTML Guidance

- Use `<h3>` sparingly for subsections if needed (e.g., under Suspect Network: "The Conspirators", "The Victims")
- Use `<strong>` for ALL person names throughout the entire report (including first-name references like "Marcus" or "Blake")
- Use `<em>` for specific evidence artifact names, but extract person names from the italic phrase and make them bold
- Example: `<strong>Sofia Francisco's</strong> <em>memory extraction</em>` NOT `<em>Sofia Francisco's memory extraction</em>`
- Use `<hr>` for major section breaks (rarely needed)
- Use `<p class="note">` SPARINGLY for brief detective asides (1-2 per section maximum)

## Output Format

FORMAT: HTML (body content only, NO `<html>`, `<head>`, or `<body>` tags).
- Each Evidence Locker theme gets ONE `<div class="evidence-item">` wrapper
- Final Assessment wrapped in ONE `<div class="note">...</div>` container
- Use `<h2>` for section headers
- Use `<p>` for paragraphs
- Use `<ul>`/`<ol>` with `<li>` for lists
