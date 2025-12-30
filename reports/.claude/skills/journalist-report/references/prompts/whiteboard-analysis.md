# Whiteboard Analysis

You are analyzing a photograph of the investigation whiteboard from "About Last Night" - a murder mystery investigation game.

## OCR Name Disambiguation

You will be provided with a ROSTER of character names from this session. When transcribing handwritten names from the whiteboard, use this roster to correct OCR errors.

**Common OCR errors to watch for:**
- Similar letters: `ss` vs `sh` (Jessicah not Jossiah)
- Letter confusion: `n` vs `r`, `a` vs `o`, `k` vs `h`
- Missing/extra letters in long names
- First-letter capitalization issues

**Disambiguation rules:**
1. If handwritten text closely matches a roster name, use the roster spelling
2. When in doubt, prefer roster names over literal transcription
3. Flag truly ambiguous cases with `[unclear: X or Y]`

### Correct Disambiguation Examples

Roster: `Victoria, Morgan, Jessicah, Kai, Taylor`

| Handwritten | Transcribe As | Reason |
|-------------|---------------|--------|
| Viktoria | Victoria | Roster match (k→c) |
| Mona | Morgan | Roster match (partial) |
| Jossiah | Jessicah | Roster match (ss→sh, o→e) |
| Ty | Taylor | Roster match (abbreviation) |
| Randy | Randy | No roster match - keep literal |

### Wrong - Never Do This

> Transcribed: "Mona blamed Viktoria"

WHY THIS IS WRONG: Both names have roster matches (Morgan, Victoria). Always apply roster disambiguation.

## Spatial Structure Discovery

The whiteboard may contain various organizational structures. Your task is to DISCOVER what structures exist, not assume any particular format.

**Possible structures to look for:**
- Connection lines between names/concepts
- Grouping boxes or circles
- Timeline progressions (arrows, sequences)
- Hierarchical arrangements
- Column/row organization
- Color coding or highlighting patterns
- Central vs peripheral positioning

**Structure discovery rules:**
1. Describe structures as you find them
2. Note spatial relationships (above, left of, connected to, circled with)
3. If no clear structure, describe as "free-form notes"
4. Don't force interpretation if structure is ambiguous

### Correct Structure Examples

> The whiteboard shows Victoria's name in a central box with lines radiating outward to five other names: Morgan, James, Kai, Sarah, and Derek. This appears to be an accusation web with Victoria at the center.

> Names are organized in two columns with a vertical line between them. Left column contains exposed evidence markers, right column appears to be suspicion notes.

### Wrong - Never Do This

> The standard investigation matrix shows...

WHY THIS IS WRONG: Don't assume standard formats. Describe what you actually see.

## Content Accuracy

Report what is visible on the whiteboard. Do not infer or add information that isn't written.

**What to extract:**
- Names (with roster disambiguation)
- Quoted text or phrases
- Symbols and their apparent meaning
- Spatial relationships
- Visible annotations or marks

**What NOT to add:**
- Conclusions not written on the board
- Evidence content that isn't visible
- Relationships that aren't marked
- Motivations or theories not written

### Correct Content Reporting

> Below Victoria's name, handwritten text reads: "Talked to Morgan at bar - suspicious"

### Wrong - Never Do This

> Victoria must have conspired with Morgan based on the connections shown.

WHY THIS IS WRONG: Report observations, not conclusions. The whiteboard shows a connection; interpretation is for the article.

## Output Format

Return structured JSON with:
- `names`: Array of all names found (roster-corrected)
- `connections`: Array of `{from, to, label}` for any lines/arrows
- `groups`: Array of `{label, members}` for boxed/circled clusters
- `notes`: Array of text content not directly associated with connections
- `structureType`: Brief description of overall organization observed
- `ambiguities`: Array of any unclear elements that may need verification
