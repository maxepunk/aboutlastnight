#!/usr/bin/env python3
"""
Timeline-to-Element Evidence Scanner
Identifies timeline events that lack physical element evidence.
Descriptive output for agent interpretation.
"""

import requests
import time
from collections import defaultdict
import urllib3

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
TIMELINE_DB_ID = "1b52f33d-583f-80de-ae5a-d20020c120dd"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

def safe_get_text(prop_data, prop_type="rich_text"):
    """Safely extract text from Notion property."""
    items = prop_data.get(prop_type, [])
    if not items or len(items) == 0:
        return ""
    
    text_parts = []
    for item in items:
        if "plain_text" in item:
            text_parts.append(item["plain_text"])
        elif "text" in item and "content" in item["text"]:
            text_parts.append(item["text"]["content"])
    
    return " ".join(text_parts)

def query_all(db_id):
    """Query all records from database."""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    
    all_results = []
    has_more = True
    start_cursor = None
    
    while has_more:
        payload = {"page_size": 100}
        if start_cursor:
            payload["start_cursor"] = start_cursor
        
        response = requests.post(url, headers=HEADERS, json=payload, verify=False)
        time.sleep(0.5)
        
        if response.status_code != 200:
            break
        
        data = response.json()
        all_results.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
    
    return all_results

def build_character_map():
    """Build map of character IDs to names."""
    characters = query_all(CHARACTERS_DB_ID)
    
    char_map = {}
    for char in characters:
        char_id = char["id"]
        name = safe_get_text(char["properties"].get("Name", {}), "title")
        char_map[char_id] = name
    
    return char_map

def analyze_timeline_events():
    """Analyze timeline events for element evidence."""
    print("Querying all timeline events...")
    events = query_all(TIMELINE_DB_ID)
    print(f"Retrieved {len(events)} events\n")
    
    print("Building character map...")
    char_map = build_character_map()
    
    gaps = []
    has_evidence = []
    
    print("Analyzing event evidence...\n")
    for event in events:
        props = event.get("properties", {})
        
        # Get event details
        description = safe_get_text(props.get("Description", {}), "title")
        if not description:
            continue
        
        # Get date
        date_data = props.get("Date", {}).get("date", {})
        date_str = date_data.get("start", "No date") if date_data else "No date"
        
        # Get characters involved
        chars_involved = props.get("Characters Involved", {}).get("relation", [])
        char_names = [char_map.get(c["id"], "Unknown") for c in chars_involved]
        
        # Get notes
        notes = safe_get_text(props.get("Notes", {}))
        
        # Get evidence elements
        evidence = props.get("Memory/Evidence", {}).get("relation", [])
        evidence_count = len(evidence)
        
        event_data = {
            "description": description,
            "date": date_str,
            "characters_count": len(char_names),
            "characters": char_names[:5],  # First 5 for display
            "evidence_count": evidence_count,
            "notes": notes[:200] if notes else ""
        }
        
        if evidence_count == 0:
            gaps.append(event_data)
        else:
            has_evidence.append(event_data)
    
    return gaps, has_evidence

def print_analysis(gaps, has_evidence):
    """Print formatted analysis for agent interpretation."""
    print("=" * 80)
    print("TIMELINE-TO-ELEMENT EVIDENCE ANALYSIS")
    print("=" * 80)
    print("\nTimeline events and their physical element evidence\n")
    
    total = len(gaps) + len(has_evidence)
    print(f"Total Timeline Events: {total}")
    print(f"  With element evidence: {len(has_evidence)} ({len(has_evidence)/total*100:.1f}%)")
    print(f"  WITHOUT element evidence: {len(gaps)} ({len(gaps)/total*100:.1f}%)")
    
    if gaps:
        print("\n" + "=" * 80)
        print(f"EVENTS WITHOUT ELEMENT EVIDENCE ({len(gaps)} events)")
        print("=" * 80)
        print("\nThese backstory events exist but have no physical props/documents/tokens\n")
        
        # Sort by character count (more characters = potentially more significant)
        gaps_sorted = sorted(gaps, key=lambda x: x["characters_count"], reverse=True)
        
        for idx, event in enumerate(gaps_sorted[:20], 1):
            print(f"{idx}. {event['description']}")
            print(f"   Date: {event['date']}")
            print(f"   Characters: {', '.join(event['characters'])} ({event['characters_count']} total)")
            if event['notes']:
                print(f"   Notes: {event['notes']}...")
            print()
        
        if len(gaps) > 20:
            print(f"... and {len(gaps) - 20} more events without evidence\n")
    
    # Pattern analysis
    print("=" * 80)
    print("PATTERN ANALYSIS")
    print("=" * 80)
    
    # Character involvement in ungrounded events
    char_counts = defaultdict(int)
    for gap in gaps:
        for char in gap["characters"]:
            char_counts[char] += 1
    
    if char_counts:
        print("\nCharacters most involved in ungrounded events:")
        for char, count in sorted(char_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"  {char}: {count} events without evidence")
    
    # Date distribution
    dated_gaps = [g for g in gaps if g["date"] != "No date"]
    print(f"\nDated events without evidence: {len(dated_gaps)}/{len(gaps)}")
    
    # Multi-character events
    multi_char = [g for g in gaps if g["characters_count"] >= 3]
    print(f"Multi-character events (≥3) without evidence: {len(multi_char)}")

def main():
    gaps, has_evidence = analyze_timeline_events()
    print_analysis(gaps, has_evidence)
    
    print("\n" + "=" * 80)
    print("INTERPRETATION GUIDE")
    print("=" * 80)
    print("""
Timeline events without element evidence represent:
  - Backstory that exists in design but has no player-discoverable proof
  - Potential content gaps (need props, documents, photos, etc.)
  - OR wiring gaps (elements exist but Timeline Event relation not set)

Events with multiple characters are often more significant:
  - Shared history moments
  - Key relationship foundations
  - Should prioritize for element creation

Next steps:
  - Review high-character-count events first
  - Determine if elements should exist (photos, documents, emails)
  - OR check if existing elements should be wired to these events
    """)

if __name__ == "__main__":
    main()
