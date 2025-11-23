#!/usr/bin/env python3
"""
Trust Pair Verification Tool

Provides timeline event data for character pairs to verify trust relationships
have narrative grounding through shared history.

Agent Workflow:
  1. Agent uses google_drive_fetch to get character sheets document
  2. Agent reads character sections and extracts trust declarations
  3. Agent runs this tool to get shared timeline events
  4. Agent assesses grounding: STRONG/MODERATE/WEAK/NONE
  5. Agent presents findings to Max

Tool outputs: Shared timeline events with dates, evidence, other characters
Agent synthesizes: Quality of narrative grounding for trust relationship
Max decides: Create new events, add evidence, revise sheets, or accept gaps
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


def get_character_id(character_name: str) -> str:
    """Get character ID from Characters database."""
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
        return None
    
    results = response.json().get("results", [])
    if not results:
        return None
    
    return results[0]["id"]


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


def query_shared_timeline_events(char1_name: str, char2_name: str) -> List[Dict[str, Any]]:
    """Query Timeline database for events involving BOTH characters."""
    
    # Get both character IDs
    char1_id = get_character_id(char1_name)
    char2_id = get_character_id(char2_name)
    
    if not char1_id:
        print(f"Character not found: {char1_name}")
        return []
    
    if not char2_id:
        print(f"Character not found: {char2_name}")
        return []
    
    # Query Timeline for events with BOTH characters
    # We need to query with compound filter: both characters must be in Characters Involved
    timeline_url = f"https://api.notion.com/v1/databases/{TIMELINE_DB_ID}/query"
    
    all_events = []
    has_more = True
    start_cursor = None
    
    while has_more:
        payload = {
            "filter": {
                "and": [
                    {
                        "property": "Characters Involved",
                        "relation": {"contains": char1_id}
                    },
                    {
                        "property": "Characters Involved",
                        "relation": {"contains": char2_id}
                    }
                ]
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


def get_all_characters_in_event(event_id: str) -> List[str]:
    """Get names of all characters involved in this event."""
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


def verify_trust_pair(char1_name: str, char2_name: str):
    """Output shared timeline data for agent assessment of trust pair grounding."""
    
    print("=" * 80)
    print(f"TRUST PAIR VERIFICATION: {char1_name} ↔ {char2_name}")
    print("=" * 80)
    print()
    
    # Get character info
    char1_tier = get_character_tier(char1_name)
    char1_cluster = get_character_goal_cluster(char1_name)
    
    char2_tier = get_character_tier(char2_name)
    char2_cluster = get_character_goal_cluster(char2_name)
    
    print(f"Character 1: {char1_name}")
    print(f"  Tier: {char1_tier}")
    print(f"  Goal Cluster: {char1_cluster}")
    print()
    print(f"Character 2: {char2_name}")
    print(f"  Tier: {char2_tier}")
    print(f"  Goal Cluster: {char2_cluster}")
    print()
    print("Character Sheets Document: https://docs.google.com/document/d/1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts")
    print()
    
    # Query timeline for shared events
    print("=" * 80)
    print("SHARED TIMELINE EVENTS")
    print("=" * 80)
    print()
    
    shared_events = query_shared_timeline_events(char1_name, char2_name)
    
    if not shared_events:
        print(f"No shared timeline events found for {char1_name} and {char2_name}")
        print()
        print("This trust pair has NO timeline grounding.")
        print()
        print("If character sheets declare trust between these characters, this is a")
        print("CONTENT GAP - shared history exists in narrative but not in Timeline database.")
        print()
        print("Agent should:")
        print("  1. Read both character sheets for trust declarations")
        print("  2. Check for relationship mentions in Memory Inventory")
        print("  3. Flag as UNGROUNDED trust pair")
        print("  4. Recommend creating timeline events showing shared history")
        print()
        print("Critical for Beat 1.2.2 (team formation): Players need to understand")
        print("WHY they can trust this person, not just that sheet says 'you can trust them.'")
        return
    
    print(f"Found {len(shared_events)} shared timeline events")
    print()
    
    # Parse and display events with full details
    parsed_events = []
    for event in shared_events:
        parsed = parse_timeline_event(event)
        # Get all character names in this event
        all_chars = get_all_characters_in_event(event["id"])
        # Separate the trust pair from other characters
        other_chars = [c for c in all_chars if c not in [char1_name, char2_name]]
        parsed["all_characters"] = all_chars
        parsed["other_characters"] = other_chars
        parsed_events.append(parsed)
    
    # Sort by date
    parsed_events.sort(key=lambda x: (x["date"] if x["date"] != "No date" else "9999"))
    
    for i, event in enumerate(parsed_events, 1):
        print(f"{i}. {event['name']}")
        print(f"   Date: {event['date']}")
        if event['time_period']:
            print(f"   Time Period: {event['time_period']}")
        print(f"   Total Characters in Event: {event['character_count']}")
        if event['other_characters']:
            print(f"   Other Characters Present: {', '.join(event['other_characters'])}")
        else:
            print(f"   Other Characters Present: None (just these two)")
        print(f"   Evidence Elements: {event['evidence_count']}")
        print()
    
    # Summary statistics
    print("=" * 80)
    print("GROUNDING ASSESSMENT DATA")
    print("=" * 80)
    print()
    
    total_events = len(parsed_events)
    events_with_evidence = sum(1 for e in parsed_events if e["evidence_count"] > 0)
    events_without_evidence = total_events - events_with_evidence
    total_evidence = sum(e["evidence_count"] for e in parsed_events)
    
    # Check if any events are just these two (private moments)
    private_events = sum(1 for e in parsed_events if e["character_count"] == 2)
    group_events = total_events - private_events
    
    print(f"Total Shared Events: {total_events}")
    print(f"Events with Evidence: {events_with_evidence}")
    print(f"Events without Evidence: {events_without_evidence}")
    print(f"Total Evidence Elements: {total_evidence}")
    print()
    print(f"Private Moments (just these two): {private_events}")
    print(f"Group Events (with others): {group_events}")
    print()
    
    # Collect all other characters who appear in their shared events
    all_other_chars = set()
    for event in parsed_events:
        all_other_chars.update(event['other_characters'])
    
    if all_other_chars:
        print(f"Other Characters in Shared Events: {len(all_other_chars)}")
        print(f"  {', '.join(sorted(all_other_chars))}")
        print()
    
    # Agent assessment guidance
    print("=" * 80)
    print("AGENT ASSESSMENT FRAMEWORK")
    print("=" * 80)
    print()
    print("Grounding Quality Levels:")
    print()
    print("STRONG GROUNDING:")
    print("  - 3+ shared events with varied contexts")
    print("  - Multiple events have evidence elements (physical discovery)")
    print("  - Mix of private moments + group contexts")
    print("  - Events show WHY trust exists (collaboration, shared experience)")
    print()
    print("MODERATE GROUNDING:")
    print("  - 1-2 shared events with some evidence")
    print("  - Events exist but may lack detail or variety")
    print("  - Trust is implied but not deeply developed")
    print()
    print("WEAK GROUNDING:")
    print("  - 1 shared event with no evidence")
    print("  - OR events don't explain trust relationship")
    print("  - Minimal shared history")
    print()
    print("NO GROUNDING:")
    print("  - 0 shared events (handled above)")
    print("  - Content gap requires new timeline events")
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
    print("2. Read both character sections and check:")
    print("   - Does either sheet declare trust? ('You know you can trust [name]')")
    print("   - Are there relationship mentions in Memory Inventory?")
    print("   - Do they reference shared experiences?")
    print()
    print("3. Compare sheet claims to shared events above:")
    print("   - Do the events explain WHY trust exists?")
    print("   - Are claimed shared experiences actually in Timeline?")
    print("   - Is there enough context for team formation choice (Beat 1.2.2)?")
    print()
    print("4. Assess grounding quality using framework above:")
    print("   - STRONG/MODERATE/WEAK/NONE")
    print("   - Consider: event count, evidence, variety, narrative coherence")
    print()
    print("5. Synthesize findings:")
    print("   - Grounding quality assessment")
    print("   - Which sheet claims are supported")
    print("   - Content gaps if trust declared but ungrounded")
    print("   - Impact on Beat 1.2.2 team formation choice")
    print()
    print("6. Present findings to Max for decision-making")
    print()
    print("Remember: Trust pairs are CRITICAL for Beat 1.2.2 team formation.")
    print("Players need to understand WHY they trust someone, not just be told they do.")
    print()


def main():
    """Main entry point."""
    if len(sys.argv) < 3:
        print("Usage: python trust_pair_verification.py \"<character1>\" \"<character2>\"")
        print()
        print("Examples:")
        print('  python trust_pair_verification.py "S - Sarah Blackwood" "R - Rachel Torres"')
        print('  python trust_pair_verification.py "E - Ashe Motoko" "S - Leila Bishara"')
        print('  python trust_pair_verification.py "P - Oliver Sterling" "R - Howie Sullivan"')
        print()
        print("Note: Character names must include prefix (E-, P-, R-, S-)")
        print()
        print("Common Trust Pairs from Character Sheets:")
        print("  - Sarah Blackwood ↔ Rachel Torres")
        print("  - Sarah Blackwood ↔ Alex Reeves")
        print("  - Derek Thorn ↔ Diana Nilsson")
        print("  - Derek Thorn ↔ Jessicah Kane")
        print("  - Diana Nilsson ↔ Sofia Francisco")
        print("  - Ashe Motoko ↔ Leila Bishara")
        print("  - Oliver Sterling ↔ Howie Sullivan")
        print("  - And others...")
        sys.exit(1)
    
    char1_name = sys.argv[1]
    char2_name = sys.argv[2]
    verify_trust_pair(char1_name, char2_name)


if __name__ == "__main__":
    main()
