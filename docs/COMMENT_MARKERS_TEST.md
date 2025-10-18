# Comment Marker Test

This file tests the box-drawing characters for comment markers to ensure they render correctly.

## Content Block Pattern

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: [SECTION NAME]                        -->
<!-- SAFE TO EDIT: All text within this section              -->
<!-- FIND WITH: Search for "[SECTION NAME]"                  -->
<!-- ═══════════════════════════════════════════════════════ -->
```

## Structural Component Pattern

```html
<!-- ╔═══════════════════════════════════════════════════════╗ -->
<!-- ║ STRUCTURAL COMPONENT: [COMPONENT NAME]                 ║ -->
<!-- ║ SAFE TO EDIT: Text content only (not HTML structure)   ║ -->
<!-- ║ TO ADD NEW: Copy entire block between these markers    ║ -->
<!-- ║ DO NOT EDIT: IDs, classes, or HTML tags                ║ -->
<!-- ╚═══════════════════════════════════════════════════════╝ -->
```

## Interactive Behavior Marker

```html
<!-- ⚠ DO NOT EDIT BELOW: JavaScript dependencies (IDs, classes, data attributes) ⚠ -->
```

## UTF-8 Encoding

These characters require UTF-8 encoding (which is the default for HTML5):
- ═ (U+2550) - Box Drawings Double Horizontal
- ║ (U+2551) - Box Drawings Double Vertical
- ╔ (U+2554) - Box Drawings Double Down and Right
- ╗ (U+2557) - Box Drawings Double Down and Left
- ╚ (U+255A) - Box Drawings Double Up and Right
- ╝ (U+255D) - Box Drawings Double Up and Left
- ⚠ (U+26A0) - Warning Sign

## VS Code Rendering Notes

- These characters render correctly in VS Code with any monospace font
- UTF-8 encoding is standard for `.html` files
- If characters appear as boxes, check file encoding (should be UTF-8)
- To verify encoding in VS Code: bottom-right corner should show "UTF-8"

**Verified**: ✅ These markers are ready for use in HTML files
