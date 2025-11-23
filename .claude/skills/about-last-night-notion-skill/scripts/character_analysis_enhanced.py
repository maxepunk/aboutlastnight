#!/usr/bin/env python3
"""
Enhanced Character Analysis - Shows ACTUAL timeline event details, not just counts.
Provides complete character context for assessment decisions.
"""

import requests
import sys
import time
import urllib3
from typing import Dict, Any, List

# Suppress SSL warnings for cleaner output
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"
TIMELINE_DB_ID = "1b52f33d-583f-80de-ae5a-d20020c120dd"

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
    
    # Concatenate all text items
    text_parts = []
    for item in items:
        if "plain_text" in item:
            text_parts.append(item["plain_text"])
        elif "text" in item and "content" in item["text"]:
            text_parts.append(item["text"]["content"])
    
    return " ".join(text_parts)

def query_character(name: str) -> Dict[str, Any]:
    """Query character by name."""
    url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB_ID}/query"
    
    payload = {
        "filter": {
            "property": "Name",
            "title": {"equals": name}
        }
    }
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    
    if response.status_code != 200:
        print(f"Error querying character: {response.status_code}")
        return {}
    
    results = response.json().get("results", [])
    return results[0] if results else {}

def get_timeline_event_details(event_id: str) -> Dict[str, Any]:
    """Retrieve full timeline event details."""
    url = f"https://api.notion.com/v1/pages/{event_id}"
    response = requests.get(url, headers=HEADERS, verify=False)
    
    if response.status_code != 200:
        return {}
    
    return response.json()

def get_other_characters_in_event(event_page: Dict[str, Any], exclude_name: str) -> List[str]:
    """Get other character names involved in timeline event."""
    chars_relation = event_page.get("properties", {}).get("Characters Involved", {}).get("relation", [])
    
    other_chars = []
    for char_ref in chars_relation:
        # Retrieve character name
        char_page = requests.get(
            f"https://api.notion.com/v1/pages/{char_ref['id']}", 
            headers=HEADERS, 
            verify=False
        )
        time.sleep(0.35)  # Rate limiting
        
        if char_page.status_code == 200:
            char_name = safe_get_text(char_page.json().get("properties", {}).get("Name", {}), "title")
            if char_name and char_name != exclude_name:
                other_chars.append(char_name)
    
    return other_chars

def analyze_character(name: str):
    """Comprehensive character analysis with full context."""
    
    print("=" * 80)
    print(f"ENHANCED CHARACTER ANALYSIS: {name}")
    print("=" * 80)
    
    # Get character
    character = query_character(name)
    
    if not character:
        print(f"Character '{name}' not found")
        return
    
    props = character.get("properties", {})
    
    # ===== CORE IDENTITY =====
    print("\n--- CORE IDENTITY ---")
    tier = props.get("Tier", {}).get("select", {})
    tier_name = tier.get("name", "Unknown") if tier else "Unknown"
    
    char_type = props.get("Type", {}).get("select", {})
    type_name = char_type.get("name", "Unknown") if char_type else "Unknown"
    
    # Infer goal cluster from name prefix
    goal_cluster = "Unknown"
    if name.startswith("E -"):
        goal_cluster = "JUSTICE"
    elif name.startswith("R -"):
        goal_cluster = "RECOVERY"
    elif name.startswith("S -"):
        goal_cluster = "PRAGMATIC"
    elif name.startswith("P -"):
        goal_cluster = "COVERUP"
    
    print(f"Tier: {tier_name}")
    print(f"Type: {type_name}")
    print(f"Goal Cluster: {goal_cluster}")
    
    # ===== NARRATIVE FIELDS =====
    logline = safe_get_text(props.get("Character Logline", {}))
    overview = safe_get_text(props.get("Overview & Key Relationships", {}))
    emotion = safe_get_text(props.get("Emotion towards CEO & others", {}))
    primary_action = safe_get_text(props.get("Primary Action", {}))
    
    if logline:
        print(f"\nLogline:\n  {logline}")
    else:
        print(f"\n⚠ Logline: MISSING")
    
    print(f"\n--- NARRATIVE CONTEXT ---")
    
    if overview:
        print(f"\nOverview & Key Relationships:")
        print(f"  {overview[:300]}..." if len(overview) > 300 else f"  {overview}")
    else:
        print(f"\n⚠ Overview: MISSING")
    
    if emotion:
        print(f"\nEmotion towards CEO & others:")
        print(f"  {emotion[:200]}..." if len(emotion) > 200 else f"  {emotion}")
    else:
        print(f"\n⚠ Emotion: MISSING")
    
    if primary_action:
        print(f"\nPrimary Action (PRESENT tense objective):")
        print(f"  {primary_action[:200]}..." if len(primary_action) > 200 else f"  {primary_action}")
    else:
        print(f"\n⚠ Primary Action: MISSING")
    
    # ===== TIMELINE EVENTS (DETAILED) =====
    print(f"\n--- TIMELINE EVENTS (PAST Backstory) ---")
    
    events_relation = props.get("Events", {}).get("relation", [])
    event_count = len(events_relation)
    
    print(f"Count: {event_count}")
    
    if event_count == 0:
        print("⚠ NO timeline events - character has no grounded PAST history")
    else:
        print("\nEvent Details:")
        for idx, event_ref in enumerate(events_relation[:5], 1):  # Show up to 5
            event_page = get_timeline_event_details(event_ref["id"])
            time.sleep(0.35)  # Rate limiting
            
            if event_page:
                event_props = event_page.get("properties", {})
                
                # Get event description (title field)
                description = safe_get_text(event_props.get("Description", {}), "title")
                
                # Get date
                date_data = event_props.get("Date", {}).get("date", {})
                date_str = date_data.get("start", "No date") if date_data else "No date"
                
                # Get other characters
                other_chars = get_other_characters_in_event(event_page, name)
                
                # Get element count
                elements = len(event_props.get("Memory/Evidence", {}).get("relation", []))
                
                print(f"\n  {idx}. {description}")
                print(f"     Date: {date_str}")
                print(f"     Other Characters: {', '.join(other_chars) if other_chars else 'None'}")
                print(f"     Elements (evidence): {elements}")
        
        if event_count > 5:
            print(f"\n  ... and {event_count - 5} more events")
    
    # ===== CONTENT METRICS =====
    print(f"\n--- CONTENT METRICS ---")
    
    owned = len(props.get("Owned Elements", {}).get("relation", []))
    associated = len(props.get("Associated Elements", {}).get("relation", []))
    puzzles = len(props.get("Character Puzzles", {}).get("relation", []))
    
    print(f"Owned Elements: {owned}")
    print(f"Associated Elements: {associated}")
    print(f"Timeline Events: {event_count}")
    print(f"Character Puzzles: {puzzles}")
    
    # Element type distribution
    type_rollup = props.get("Owned Elem Types", {}).get("rollup", {})
    if type_rollup and type_rollup.get("type") == "array":
        types = [item.get("name") for item in type_rollup.get("array", []) if item.get("name")]
        if types:
            print(f"\nOwned Element Types: {', '.join(set(types))}")
    
    # ===== ASSESSMENT =====
    print(f"\n--- ASSESSMENT & FLAGS ---")
    
    # Completeness checks
    narrative_complete = all([logline, overview, emotion, primary_action])
    
    if narrative_complete:
        print("✓ All narrative fields complete")
    else:
        print("⚠ Missing narrative fields")
    
    # Tier-aware volume check
    if tier_name == "Core":
        if owned < 8:
            print(f"⚠ Core tier with only {owned} owned elements - likely insufficient")
    elif tier_name == "Secondary":
        if owned < 5:
            print(f"⚠ Secondary tier with only {owned} owned elements - may be thin")
    elif tier_name == "Tertiary":
        if owned >= 4:
            print(f"✓ Tertiary tier with {owned} owned elements - volume appropriate")
        else:
            print(f"⚠ Even Tertiary needs minimum gameplay elements")
    
    # Backstory grounding
    if event_count == 0:
        print("⚠ CRITICAL: No timeline events - character lacks PAST history grounding")
    elif event_count < 3 and tier_name in ["Core", "Secondary"]:
        print(f"⚠ Only {event_count} timeline events - thin PAST history for {tier_name} tier")
    
    # Associated elements check
    if associated == 0:
        print("⚠ No associated elements - doesn't appear in shared timeline events")
    
    # Coat check puzzle check
    if puzzles == 0:
        print("⚠ No character puzzles - missing coat check touchpoint?")
    elif puzzles == 1:
        print("✓ Has character puzzle (likely coat check)")
    
    print("\n" + "=" * 80)
    print("INTERPRETATION GUIDE:")
    print("=" * 80)
    print("""
Tier determines DENSITY expectations:
  - Core: Rich content, multiple timeline events, complex relationships
  - Secondary: Moderate content, some timeline history
  - Tertiary: Lighter content, but MUST have satisfying 2-hour gameplay loop

Assessment priority:
  1. Narrative fields complete? (Can player understand who they are?)
  2. Timeline events match Overview claims? (Is backstory grounded?)
  3. Can player achieve Primary Action with available elements/puzzles?
  4. Does associated element count suggest isolation? (Wiring gap?)

Next steps if issues found:
  - Missing timeline events → Search Timeline DB for mentions of this character
  - 0 associated elements → Check if existing events should include them
  - Narrative field gaps → Content creation needed
  - Low owned elements for tier → Check for orphan elements first
    """)

def main():
    if len(sys.argv) < 2:
        print("Usage: python character_analysis_enhanced.py '<character name>'")
        print("Example: python character_analysis_enhanced.py 'P - Oliver Sterling'")
        sys.exit(1)
    
    character_name = sys.argv[1]
    analyze_character(character_name)

if __name__ == "__main__":
    main()
