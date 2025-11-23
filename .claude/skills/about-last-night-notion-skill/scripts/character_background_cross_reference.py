#!/usr/bin/env python3
"""
Character Background Cross-Reference Tool

Provides timeline event data for a character to enable agent-driven cross-reference
with character sheet claims (from Google Drive).

Agent Workflow:
  1. Agent uses google_drive_fetch to get character sheets document
  2. Agent reads character's section and extracts claims
  3. Agent runs this tool to get timeline events
  4. Agent compares claims to timeline events and identifies gaps

Tool outputs: Clean timeline data optimized for agent interpretation
Agent synthesizes: Which claims are grounded, which lack grounding
Max decides: Create new content, revise sheets, or accept gaps
"""

import requests
import sys
import time
import urllib3
from typing import Dict, Any, List

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


def query_timeline_for_character(character_name: str) -> List[Dict[str, Any]]:
    """Query Timeline database for events involving this character."""
    
    # First, get character ID from Characters database
    char_url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB_ID}/query"
    char_payload = {
        "filter": {
            "property": "Name",
            "title": {"equals": character_name}
        }
    }
    
    char_response = requests.post(char_url, headers=HEADERS, json=char_payload, verify=False)
    time.sleep(0.5)
    
    if char_response.status_code != 200:
        print(f"Error querying character: {char_response.status_code}")
        return []
    
    char_results = char_response.json().get("results", [])
    if not char_results:
        print(f"Character not found: {character_name}")
        return []
    
    character_id = char_results[0]["id"]
    
    # Query Timeline for events with this character
    timeline_url = f"https://api.notion.com/v1/databases/{TIMELINE_DB_ID}/query"
    
    all_events = []
    has_more = True
    start_cursor = None
    
    while has_more:
        payload = {
            "filter": {
                "property": "Characters Involved",
                "relation": {"contains": character_id}
            },
            "page_size": 100
        }
        
        if start_cursor:
            payload["start_cursor"] = start_cursor
        
        response = requests.post(timeline_url, headers=HEADERS, json=payload, verify=False)
        time.sleep(0.5)
        
        if response.status_code != 200:
            break
        
        data = response.json()
        all_events.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
    
    return all_events


def parse_timeline_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Parse timeline event into structured format."""
    props = event.get("properties", {})
    
    # Get event description (this is the event name/title in Timeline database)
    event_name = safe_get_text(props.get("Description", {}), "title")
    
    # Get date
    date_prop = props.get("Date", {})
    date_value = date_prop.get("date", {})
    event_date = date_value.get("start", "No date") if date_value else "No date"
    
    # Get other characters involved
    chars_relation = props.get("Characters Involved", {}).get("relation", [])
    char_count = len(chars_relation)
    
    # Get evidence count
    evidence_relation = props.get("Memory/Evidence", {}).get("relation", [])
    evidence_count = len(evidence_relation)
    
    # Get time period
    time_period = safe_get_text(props.get("Time Period", {}))
    
    return {
        "name": event_name,
        "date": event_date,
        "time_period": time_period,
        "character_count": char_count,
        "evidence_count": evidence_count,
        "event_id": event["id"]
    }


def get_character_goal_cluster(character_name: str) -> str:
    """
    Get character's goal cluster from name prefix.
    
    Goal cluster is encoded in character name prefix:
    - E- = JUSTICE (Exposure)
    - R- = RECOVERY
    - P- = COVERUP (Preservation)
    - S- = PRAGMATIC
    """
    prefix_mapping = {
        "E": "JUSTICE",
        "R": "RECOVERY",
        "P": "COVERUP",
        "S": "PRAGMATIC"
    }
    
    # Extract prefix (first character before " - ")
    if " - " in character_name:
        prefix = character_name.split(" - ")[0].strip()
        return prefix_mapping.get(prefix, "Unknown")
    
    return "Unknown"


def get_character_tier(character_name: str) -> str:
    """Get character's tier from Characters database."""
    url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB_ID}/query"
    payload = {
        "filter": {
            "property": "Name",
            "title": {"equals": character_name}
        }
    }
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code != 200:
        return "Unknown"
    
    results = response.json().get("results", [])
    if not results:
        return "Unknown"
    
    props = results[0].get("properties", {})
    # Tier is a select property, not rich_text
    tier_prop = props.get("Tier", {})
    tier_select = tier_prop.get("select")
    
    if tier_select and "name" in tier_select:
        return tier_select["name"]
    
    return "Unknown"


def get_other_characters_in_event(event_id: str) -> List[str]:
    """Get names of other characters involved in this event."""
    url = f"https://api.notion.com/v1/pages/{event_id}"
    response = requests.get(url, headers=HEADERS, verify=False)
    time.sleep(0.35)
    
    if response.status_code != 200:
        return []
    
    event_data = response.json()
    props = event_data.get("properties", {})
    
    chars_relation = props.get("Characters Involved", {}).get("relation", [])
    
    char_names = []
    for char_ref in chars_relation:
        char_page = requests.get(
            f"https://api.notion.com/v1/pages/{char_ref['id']}", 
            headers=HEADERS, 
            verify=False
        )
        time.sleep(0.35)
        
        if char_page.status_code == 200:
            char_name = safe_get_text(
                char_page.json().get("properties", {}).get("Name", {}), 
                "title"
            )
            if char_name:
                char_names.append(char_name)
    
    return char_names


def analyze_character_background(character_name: str):
    """Output clean timeline data for agent cross-reference with character sheets."""
    
    print("=" * 80)
    print(f"CHARACTER TIMELINE DATA: {character_name}")
    print("=" * 80)
    print()
    
    # Get goal cluster from database
    goal_cluster = get_character_goal_cluster(character_name)
    tier = get_character_tier(character_name)
    
    print(f"Character: {character_name}")
    print(f"Tier: {tier}")
    print(f"Goal Cluster: {goal_cluster}")
    print()
    print("Character Sheets Document: https://docs.google.com/document/d/1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts")
    print()
    
    # Query timeline for character's events
    print("=" * 80)
    print("TIMELINE EVENTS")
    print("=" * 80)
    print()
    
    timeline_events = query_timeline_for_character(character_name)
    
    if not timeline_events:
        print(f"No timeline events found for {character_name}")
        print()
        print("This character has no timeline events. All backstory claims in character")
        print("sheet are UNGROUNDED unless they reference gameplay (PRESENT tense script).")
        print()
        print("Agent should:")
        print("  1. Read character sheet claims")
        print("  2. Flag all relationship/backstory claims as content gaps")
        print("  3. Recommend creating timeline events to ground character")
        return
    
    print(f"Found {len(timeline_events)} timeline events")
    print()
    
    # Parse and display events with full details
    parsed_events = []
    for event in timeline_events:
        parsed = parse_timeline_event(event)
        # Get other character names
        other_chars = get_other_characters_in_event(event["id"])
        # Remove the main character from the list
        other_chars = [c for c in other_chars if c != character_name]
        parsed["other_characters"] = other_chars
        parsed_events.append(parsed)
    
    # Sort by date
    parsed_events.sort(key=lambda x: (x["date"] if x["date"] != "No date" else "9999"))
    
    for i, event in enumerate(parsed_events, 1):
        print(f"{i}. {event['name']}")
        print(f"   Date: {event['date']}")
        if event['time_period']:
            print(f"   Time Period: {event['time_period']}")
        print(f"   Other Characters: {', '.join(event['other_characters']) if event['other_characters'] else 'None'}")
        print(f"   Evidence Elements: {event['evidence_count']}")
        print()
    
    # Summary statistics
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print()
    
    total_events = len(parsed_events)
    events_with_evidence = sum(1 for e in parsed_events if e["evidence_count"] > 0)
    events_without_evidence = total_events - events_with_evidence
    
    total_evidence = sum(e["evidence_count"] for e in parsed_events)
    
    print(f"Total Timeline Events: {total_events}")
    print(f"Events with Evidence: {events_with_evidence}")
    print(f"Events without Evidence: {events_without_evidence}")
    print(f"Total Evidence Elements: {total_evidence}")
    print()
    
    # Character mentions
    all_other_chars = set()
    for event in parsed_events:
        all_other_chars.update(event['other_characters'])
    
    print(f"Shares Timeline Events With: {len(all_other_chars)} characters")
    if all_other_chars:
        print(f"  {', '.join(sorted(all_other_chars))}")
    print()
    
    # Agent workflow reminder
    print("=" * 80)
    print("AGENT WORKFLOW")
    print("=" * 80)
    print()
    print("Next steps for agent:")
    print()
    print("1. Use google_drive_fetch to get character sheets document")
    print("   Document ID: 1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts")
    print()
    print("2. Read this character's section and extract:")
    print("   - Logline (core identity)")
    print("   - Memory Inventory bullets (backstory facts, relationships)")
    print("   - Trust pair declarations")
    print("   - Emotional context (feelings about Marcus/others)")
    print()
    print("3. Compare extracted claims to timeline events above:")
    print("   - Which relationship mentions have matching timeline events?")
    print("   - Which backstory facts are evidenced by timeline?")
    print("   - Which claims lack timeline grounding (content gaps)?")
    print()
    print("4. Synthesize findings:")
    print("   - Grounding quality assessment")
    print("   - Identified content gaps")
    print("   - Scaffolding readiness for social gameplay")
    print()
    print("5. Present findings to Max for decision-making")
    print()
    print("See: references/workflow-character-background-crossref.md for detailed guidance")
    print()


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python character_background_cross_reference.py \"<character_name>\"")
        print()
        print("Example:")
        print('  python character_background_cross_reference.py "E - Ashe Motoko"')
        print()
        print("Note: Character name must include prefix (E-, P-, R-, S-)")
        sys.exit(1)
    
    character_name = sys.argv[1]
    analyze_character_background(character_name)


if __name__ == "__main__":
    main()
