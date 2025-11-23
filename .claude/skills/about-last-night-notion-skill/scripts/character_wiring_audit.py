#!/usr/bin/env python3
"""
Character Wiring Audit
Comprehensive wiring gap analysis for a SINGLE character.
Designed for character investigation workflows.
"""

import requests
import re
import time
import sys
from typing import Dict, List, Set
import urllib3

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306"
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

def get_character_by_name(name: str):
    """Get character page by name."""
    characters = query_all(CHARACTERS_DB_ID)
    
    for char in characters:
        char_name = safe_get_text(char["properties"].get("Name", {}), "title")
        if char_name == name:
            return char
    
    return None

def build_character_id_map():
    """Build map of character IDs to names."""
    characters = query_all(CHARACTERS_DB_ID)
    
    id_map = {}
    for char in characters:
        char_id = char["id"]
        name = safe_get_text(char["properties"].get("Name", {}), "title")
        id_map[char_id] = name
    
    return id_map

def find_elements_mentioning_character(character_name: str, char_id_map: Dict) -> List[Dict]:
    """Find all elements that mention this character in narrative text."""
    elements = query_all(ELEMENTS_DB_ID)
    
    # Extract last name for searching
    last_name = character_name.split()[-1].lower()
    first_name = character_name.split()[-2] if len(character_name.split()) >= 3 else ""
    first_name = first_name.lower()
    
    mentions = []
    
    for elem in elements:
        props = elem.get("properties", {})
        
        elem_name = safe_get_text(props.get("Name", {}), "title")
        basic_type = props.get("Basic Type", {}).get("select", {})
        type_name = basic_type.get("name", "Unknown") if basic_type else "Unknown"
        
        desc_text = safe_get_text(props.get("Description/Text", {}))
        if not desc_text:
            continue
        
        desc_lower = desc_text.lower()
        
        # Check if character is mentioned
        if last_name not in desc_lower and first_name not in desc_lower:
            continue
        
        # Get relations
        owner_relation = props.get("Owner", {}).get("relation", [])
        owner_id = owner_relation[0]["id"] if owner_relation else None
        owner_name = char_id_map.get(owner_id, "Unknown") if owner_id else "Unknown"
        
        associated_relation = props.get("Associated Characters", {}).get("relation", [])
        associated_ids = [rel["id"] for rel in associated_relation]
        associated_names = [char_id_map.get(aid, "") for aid in associated_ids]
        
        # Skip if character is already owner or associated
        if character_name == owner_name or character_name in associated_names:
            continue
        
        # Find context
        search_term = last_name if last_name in desc_lower else first_name
        context_start = desc_lower.find(search_term)
        context = desc_text[max(0, context_start-50):context_start+150] if context_start >= 0 else desc_text[:200]
        
        mentions.append({
            "element_name": elem_name,
            "element_type": type_name,
            "owner": owner_name,
            "associated": associated_names,
            "context": context,
            "full_text": desc_text
        })
    
    return mentions

def find_timeline_events_with_character(character_name: str, char_id: str, char_id_map: Dict) -> List[Dict]:
    """Find timeline events that include this character."""
    events = query_all(TIMELINE_DB_ID)
    
    char_events = []
    
    for event in events:
        props = event.get("properties", {})
        
        chars_involved = props.get("Characters Involved", {}).get("relation", [])
        char_ids = [c["id"] for c in chars_involved]
        
        if char_id not in char_ids:
            continue
        
        description = safe_get_text(props.get("Description", {}), "title")
        date_data = props.get("Date", {}).get("date", {})
        date_str = date_data.get("start", "No date") if date_data else "No date"
        
        # Get other characters
        other_chars = [char_id_map.get(cid, "Unknown") for cid in char_ids if cid != char_id]
        
        # Get evidence count
        evidence = props.get("Memory/Evidence", {}).get("relation", [])
        evidence_count = len(evidence)
        
        char_events.append({
            "description": description,
            "date": date_str,
            "other_characters": other_chars,
            "evidence_count": evidence_count
        })
    
    return char_events

def extract_relationship_mentions_from_overview(overview_text: str) -> List[str]:
    """Extract potential relationship mentions from Overview text."""
    if not overview_text:
        return []
    
    # Common relationship indicators
    patterns = [
        r"worked with ([A-Z][a-z]+)",
        r"partner(?:ed)? with ([A-Z][a-z]+)",
        r"relationship with ([A-Z][a-z]+)",
        r"affair with ([A-Z][a-z]+)",
        r"married to ([A-Z][a-z]+)",
        r"friend(?:s)? with ([A-Z][a-z]+)",
        r"trust(?:s)? ([A-Z][a-z]+)",
        r"fixed point[s]?[:]? ([A-Z][a-z]+)",
    ]
    
    mentioned = []
    for pattern in patterns:
        matches = re.findall(pattern, overview_text)
        mentioned.extend(matches)
    
    return list(set(mentioned))

def audit_character_wiring(character_name: str):
    """Comprehensive wiring audit for one character."""
    
    print("=" * 80)
    print(f"CHARACTER WIRING AUDIT: {character_name}")
    print("=" * 80)
    print("\nComprehensive wiring gap analysis for character investigation workflow\n")
    
    # Get character
    character = get_character_by_name(character_name)
    if not character:
        print(f"Character '{character_name}' not found")
        return
    
    char_id = character["id"]
    props = character["properties"]
    
    # Get character map
    print("Building character map...")
    char_id_map = build_character_id_map()
    
    # Get Overview for relationship analysis
    overview = safe_get_text(props.get("Overview & Key Relationships", {}))
    
    print("\n" + "=" * 80)
    print("1. ELEMENTS MENTIONING CHARACTER WITHOUT PROPER RELATIONS")
    print("=" * 80)
    
    print("\nSearching all elements for mentions...")
    mentions = find_elements_mentioning_character(character_name, char_id_map)
    
    print(f"\nFound {len(mentions)} elements mentioning {character_name} without relations:\n")
    
    if mentions:
        for idx, mention in enumerate(mentions, 1):
            print(f"{idx}. {mention['element_name']}")
            print(f"   Type: {mention['element_type']}")
            print(f"   Owner: {mention['owner']}")
            print(f"   Current Associated: {mention['associated'] if mention['associated'] else 'None'}")
            print(f"   Context: ...{mention['context']}...")
            print()
    else:
        print("No wiring gaps found - character is properly related to all elements that mention them\n")
    
    print("=" * 80)
    print("2. TIMELINE EVENTS INVOLVING CHARACTER")
    print("=" * 80)
    
    print("\nSearching timeline events...")
    events = find_timeline_events_with_character(character_name, char_id, char_id_map)
    
    print(f"\nCharacter appears in {len(events)} timeline events:\n")
    
    if events:
        for idx, event in enumerate(events, 1):
            print(f"{idx}. {event['description']}")
            print(f"   Date: {event['date']}")
            print(f"   Other characters: {', '.join(event['other_characters']) if event['other_characters'] else 'None'}")
            print(f"   Element evidence: {event['evidence_count']}")
            print()
    else:
        print("No timeline events found for this character\n")
    
    print("=" * 80)
    print("3. OVERVIEW RELATIONSHIP ANALYSIS")
    print("=" * 80)
    
    if overview:
        print(f"\nOverview text (first 300 chars):")
        print(f"{overview[:300]}...\n" if len(overview) > 300 else f"{overview}\n")
        
        relationship_mentions = extract_relationship_mentions_from_overview(overview)
        
        if relationship_mentions:
            print(f"Potential relationships mentioned in Overview:")
            for name in relationship_mentions:
                print(f"  - {name}")
            
            print(f"\n⚠ Cross-reference these with timeline events above")
            print(f"⚠ If mentioned but no timeline event exists → content gap")
            print(f"⚠ If timeline event exists but character not in Characters Involved → wiring gap")
        else:
            print("No explicit relationship mentions detected in Overview")
    else:
        print("\n⚠ No Overview text found")
    
    print("\n" + "=" * 80)
    print("SUMMARY & INTERPRETATION")
    print("=" * 80)
    
    print(f"""
Character: {character_name}
Timeline Events: {len(events)}
Element Mentions (not wired): {len(mentions)}

WIRING GAPS IDENTIFIED:
  - {len(mentions)} elements mention character without proper relations
  - Review each element to determine if character should be:
    * Owner (if it's their POV/possession)
    * Associated Character (if they're involved in the timeline event)
    * Neither (if it's just a casual/background mention)

CONTENT GAP ANALYSIS:
  - Check Overview relationship mentions against timeline events
  - Missing events = need to CREATE timeline events + element evidence
  - Existing events but character not involved = wiring gap in Characters Involved

NEXT STEPS:
  1. Review element mentions - wire appropriate relations
  2. Cross-check Overview relationships with timeline
  3. Identify which gaps are wiring vs content
    """)

def main():
    if len(sys.argv) < 2:
        print("Usage: python character_wiring_audit.py '<character name>'")
        print("Example: python character_wiring_audit.py 'P - Oliver Sterling'")
        sys.exit(1)
    
    character_name = sys.argv[1]
    audit_character_wiring(character_name)

if __name__ == "__main__":
    main()
