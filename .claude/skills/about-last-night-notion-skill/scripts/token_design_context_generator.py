#!/usr/bin/env python3
"""
Token Design Context Generator - Phase C Tool 1

Provides complete context for designing tokens for a specific character by gathering:
- Character database "given circumstances" fields (design intent layer)
- Structural context (tier, cluster, existing tokens, timeline events)
- Trust pairs and relationship grounding
- Thread candidates based on character's narrative connections
- Agent workflow guidance pointing to reference files

Agent Workflow:
  1. Agent runs this tool for target character
  2. Tool outputs character database fields (Overview, Emotion, Primary Action, Logline)
  3. Tool provides structural context (tier, cluster, tokens, events, trust pairs, threads)
  4. Agent reads references:
     - goal-clusters.md for cluster-specific patterns
     - sf-mechanics.md for SF_ field validation
     - narrative-threads.md for thread assignment
  5. Agent synthesizes token design recommendations
  6. Max makes final design decisions and iterates

Tool outputs: Programmatic data + character "given circumstances"
Agent synthesizes: Design recommendations informed by references
Max decides: Final token design with context
"""

import requests
import sys
import time
import urllib3
from typing import Dict, Any, List, Set

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"
ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306"
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


def get_character_data(character_name: str) -> Dict[str, Any]:
    """Get complete character data including database fields."""
    url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB_ID}/query"
    payload = {
        "filter": {
            "property": "Name",
            "title": {"equals": character_name}
        }
    }
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code != 200 or not response.json().get("results"):
        return None
    
    char_page = response.json()["results"][0]
    props = char_page.get("properties", {})
    
    # Extract character database fields
    character_id = char_page["id"]
    
    # Tier (select property)
    tier_prop = props.get("Tier", {}).get("select")
    tier = tier_prop.get("name") if tier_prop else "Unknown"
    
    # Goal cluster from name prefix
    prefix_mapping = {
        "E": "JUSTICE",
        "R": "RECOVERY",
        "P": "COVERUP",
        "S": "PRAGMATIC"
    }
    prefix = character_name.split(" - ")[0].strip() if " - " in character_name else ""
    goal_cluster = prefix_mapping.get(prefix, "Unknown")
    
    # Character database "given circumstances" fields
    logline = safe_get_text(props.get("Character Logline", {}))
    overview = safe_get_text(props.get("Overview & Key Relationships", {}))
    emotion = safe_get_text(props.get("Emotion towards CEO & others", {}))
    primary_action = safe_get_text(props.get("Primary Action", {}))
    
    # Owned Elements relation (for existing tokens)
    owned_elements = props.get("Owned Elements", {}).get("relation", [])
    
    # Events relation (timeline events)
    events = props.get("Events", {}).get("relation", [])
    
    return {
        "id": character_id,
        "name": character_name,
        "tier": tier,
        "goal_cluster": goal_cluster,
        "logline": logline,
        "overview": overview,
        "emotion": emotion,
        "primary_action": primary_action,
        "owned_elements_ids": [elem["id"] for elem in owned_elements],
        "events_ids": [event["id"] for event in events],
        "owned_elements_count": len(owned_elements),
        "events_count": len(events)
    }


def get_existing_tokens(element_ids: List[str]) -> List[Dict[str, Any]]:
    """Get existing memory tokens owned by character."""
    tokens = []
    
    for elem_id in element_ids:
        url = f"https://api.notion.com/v1/pages/{elem_id}"
        response = requests.get(url, headers=HEADERS, verify=False)
        time.sleep(0.35)
        
        if response.status_code != 200:
            continue
        
        elem_data = response.json()
        props = elem_data.get("properties", {})
        
        # Check if this is a memory token
        basic_type = props.get("Basic Type", {}).get("select")
        if not basic_type:
            continue
        
        type_name = basic_type.get("name", "")
        if "Memory Token" not in type_name:
            continue
        
        # Extract token info
        name = safe_get_text(props.get("Name", {}), "title")
        
        # Get narrative threads
        threads = props.get("Narrative Threads", {}).get("multi_select", [])
        thread_names = [t.get("name", "") for t in threads]
        
        tokens.append({
            "name": name,
            "type": type_name,
            "threads": thread_names,
            "id": elem_id
        })
    
    return tokens


def get_timeline_events_summary(character_name: str, event_ids: List[str]) -> List[Dict[str, Any]]:
    """Get summary of character's timeline events."""
    events = []
    
    for event_id in event_ids[:10]:  # Limit to 10 most relevant
        url = f"https://api.notion.com/v1/pages/{event_id}"
        response = requests.get(url, headers=HEADERS, verify=False)
        time.sleep(0.35)
        
        if response.status_code != 200:
            continue
        
        event_data = response.json()
        props = event_data.get("properties", {})
        
        # Get event description
        description = safe_get_text(props.get("Description", {}), "title")
        
        # Get date
        date_prop = props.get("Date", {}).get("date", {})
        date = date_prop.get("start", "No date") if date_prop else "No date"
        
        # Get other characters
        chars_relation = props.get("Characters Involved", {}).get("relation", [])
        
        # Get evidence count
        evidence_relation = props.get("Memory/Evidence", {}).get("relation", [])
        evidence_count = len(evidence_relation)
        
        events.append({
            "description": description,
            "date": date,
            "other_characters_count": len(chars_relation) - 1,  # Exclude main character
            "evidence_count": evidence_count
        })
    
    return events


def extract_trust_pairs_from_overview(overview_text: str) -> List[str]:
    """Extract potential trust pair mentions from Overview field."""
    # Simple extraction - look for common trust/relationship indicators
    trust_indicators = []
    
    # This is a simple heuristic - in production might use NLP
    # Look for character name patterns in overview
    lines = overview_text.split(".")
    for line in lines:
        if any(keyword in line.lower() for keyword in ["trust", "friend", "close", "ally", "partner"]):
            trust_indicators.append(line.strip())
    
    return trust_indicators


def get_thread_candidates(character_data: Dict[str, Any], tokens: List[Dict[str, Any]]) -> Dict[str, str]:
    """Identify thread candidates based on character context."""
    threads = {
        "Funding & Espionage": "Unlikely",
        "Marriage Troubles": "Unlikely",
        "Memory Drug": "Unlikely",
        "Underground Parties": "Unlikely",
        "Advanced Technology": "Unlikely"
    }
    
    # Check existing tokens for thread assignments
    existing_threads = set()
    for token in tokens:
        existing_threads.update(token["threads"])
    
    # Mark threads with existing content
    for thread in existing_threads:
        if thread in threads:
            threads[thread] = "Active (has tokens)"
    
    # Heuristic checks based on character name and context
    name = character_data["name"]
    overview = character_data["overview"].lower()
    cluster = character_data["goal_cluster"]
    
    # Funding & Espionage heuristics
    if any(keyword in overview for keyword in ["vc", "investor", "funding", "bizai", "neurai", "competition", "rival"]):
        if threads["Funding & Espionage"] == "Unlikely":
            threads["Funding & Espionage"] = "Strong candidate"
    
    # Marriage Troubles heuristics
    if "sarah" in name.lower() or "marcus" in overview or any(keyword in overview for keyword in ["marriage", "spouse", "divorce", "husband", "wife"]):
        if threads["Marriage Troubles"] == "Unlikely":
            threads["Marriage Troubles"] = "Strong candidate"
    
    # Memory Drug heuristics
    if "derek" in name.lower() or any(keyword in overview for keyword in ["drug", "dealer", "memory", "extraction"]):
        if threads["Memory Drug"] == "Unlikely":
            threads["Memory Drug"] = "Strong candidate"
    
    # Underground Parties heuristics
    if "derek" in name.lower() or any(keyword in overview for keyword in ["party", "parties", "underground", "community"]):
        if threads["Underground Parties"] == "Unlikely":
            threads["Underground Parties"] = "Strong candidate"
    
    # Advanced Technology heuristics
    if any(keyword in overview for keyword in ["ai", "algorithm", "technical", "research", "innovation", "technology"]):
        if threads["Advanced Technology"] == "Unlikely":
            threads["Advanced Technology"] = "Strong candidate"
    
    return threads


def generate_token_design_context(character_name: str):
    """Output complete context for token design."""
    
    print("=" * 80)
    print(f"TOKEN DESIGN CONTEXT: {character_name}")
    print("=" * 80)
    print()
    
    # Get character data
    char_data = get_character_data(character_name)
    
    if not char_data:
        print(f"ERROR: Character not found: {character_name}")
        print()
        print("Please check character name format. Examples:")
        print("  - 'E - Ashe Motoko'")
        print("  - 'S - Sarah Blackwood'")
        print("  - 'P - Oliver Sterling'")
        return
    
    # Section 1: Character Database "Given Circumstances"
    print("=" * 80)
    print("CHARACTER DATABASE FIELDS (Design Intent Layer)")
    print("=" * 80)
    print()
    print("These fields are 'head canon' that guide token design decisions:")
    print()
    
    print("CHARACTER LOGLINE:")
    if char_data["logline"]:
        print(f"  {char_data['logline']}")
    else:
        print("  [No logline documented]")
    print()
    
    print("OVERVIEW & KEY RELATIONSHIPS:")
    if char_data["overview"]:
        # Print overview with wrapping
        overview_lines = char_data["overview"].split(". ")
        for line in overview_lines:
            if line.strip():
                print(f"  {line.strip()}.")
    else:
        print("  [No overview documented]")
    print()
    
    print("EMOTION TOWARDS CEO & OTHERS:")
    if char_data["emotion"]:
        emotion_lines = char_data["emotion"].split(". ")
        for line in emotion_lines:
            if line.strip():
                print(f"  {line.strip()}.")
    else:
        print("  [No emotion documented]")
    print()
    
    print("PRIMARY ACTION (PRESENT tense gameplay):")
    if char_data["primary_action"]:
        print(f"  {char_data['primary_action']}")
    else:
        print("  [No primary action documented]")
    print()
    
    print("DESIGN IMPLICATION:")
    print("  These fields provide character voice, tone, and motivation for token content.")
    print("  Use Emotion field to guide token voice.")
    print("  Use Overview to ground token content in documented relationships.")
    print("  Use Primary Action to ensure tokens support gameplay objectives.")
    print()
    
    # Section 2: Structural Context
    print("=" * 80)
    print("STRUCTURAL CONTEXT")
    print("=" * 80)
    print()
    
    print(f"Character: {char_data['name']}")
    print(f"Tier: {char_data['tier']}")
    print(f"Goal Cluster: {char_data['goal_cluster']}")
    print()
    
    print("TIER IMPLICATIONS:")
    if char_data["tier"] == "Core":
        print("  - Coat check candidate (Act 0 scaffolding priority)")
        print("  - Players need early context for this character")
        print("  - Should have 3-5+ tokens for substantial presence")
        print("  - Timeline events should be well-grounded")
    elif char_data["tier"] == "Secondary":
        print("  - Discoverable at 15+ players")
        print("  - Should have 2-4 tokens")
        print("  - Can be puzzle rewards in Act 1-2")
        print("  - Moderate timeline grounding needed")
    elif char_data["tier"] == "Tertiary":
        print("  - Discoverable at 20+ players (full game)")
        print("  - May own ransom token (mechanically critical)")
        print("  - 1-3 tokens typical")
        print("  - Clear discovery paths essential")
    print()
    
    # Get existing tokens
    print("EXISTING TOKENS:")
    tokens = get_existing_tokens(char_data["owned_elements_ids"])
    if tokens:
        print(f"  Character owns {len(tokens)} memory token(s):")
        for i, token in enumerate(tokens, 1):
            threads_str = ", ".join(token["threads"]) if token["threads"] else "No thread assigned"
            print(f"    {i}. {token['name']}")
            print(f"       Type: {token['type']}")
            print(f"       Threads: {threads_str}")
    else:
        print("  Character owns 0 memory tokens")
        print("  ⚠️  This character needs token content!")
    print()
    
    # Timeline events summary
    print("TIMELINE EVENTS SUMMARY:")
    print(f"  Total events: {char_data['events_count']}")
    if char_data["events_count"] > 0:
        events = get_timeline_events_summary(char_data["name"], char_data["events_ids"])
        if events:
            print(f"  Showing {len(events)} most recent/relevant events:")
            for event in events[:5]:  # Show top 5
                print(f"    - {event['description'][:80]}...")
                print(f"      Date: {event['date']}, Evidence: {event['evidence_count']}")
    else:
        print("  ⚠️  No timeline events found!")
        print("  Character lacks backstory grounding.")
    print()
    
    # Trust pairs
    print("TRUST PAIRS & KEY RELATIONSHIPS:")
    trust_indicators = extract_trust_pairs_from_overview(char_data["overview"])
    if trust_indicators:
        print("  Mentioned in Overview field:")
        for indicator in trust_indicators[:5]:
            print(f"    - {indicator}")
        print()
        print("  ℹ️  Run trust_pair_verification.py to check grounding of specific pairs")
    else:
        print("  No explicit trust indicators found in Overview")
        print("  Review Overview field manually for relationship mentions")
    print()
    
    # Thread candidates
    print("THREAD CANDIDATES:")
    thread_candidates = get_thread_candidates(char_data, tokens)
    for thread, status in thread_candidates.items():
        print(f"  {thread}: {status}")
    print()
    
    print("THREAD ASSIGNMENT GUIDANCE:")
    print("  - Review narrative-threads.md for thread content patterns")
    print("  - Prioritize threads with 0 tokens (Marriage Troubles, Memory Drug, etc.)")
    print("  - Ensure character has narrative connection to thread")
    print("  - Thread assignment based on content themes, not character alone")
    print()
    
    # Section 3: Character Sheets
    print("=" * 80)
    print("CHARACTER SHEETS DOCUMENT")
    print("=" * 80)
    print()
    print("Google Drive link: https://docs.google.com/document/d/1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts")
    print()
    print("Use google_drive_fetch to read character's full sheet for:")
    print("  - Detailed backstory claims")
    print("  - Trust pair declarations")
    print("  - Character voice and personality details")
    print()
    
    # Section 4: Agent Next Steps
    print("=" * 80)
    print("AGENT NEXT STEPS FOR TOKEN DESIGN")
    print("=" * 80)
    print()
    print("1. READ REFERENCES (Essential before designing):")
    print()
    print("   a) references/goal-clusters.md")
    print(f"      - Read {char_data['goal_cluster']} cluster section")
    print("      - Review content themes for tokens")
    print("      - Check SF_ field patterns for cluster")
    print("      - Use character database field interpretation")
    print("      - Follow token design workflow")
    print()
    print("   b) references/sf-mechanics.md")
    print("      - Validate SF_MemoryType (Technical/Business/Personal)")
    print("      - Set SF_ValueRating (1-5 based on stakes)")
    print("      - Write SF_Summary for dual context")
    print("      - Check SF_Group if ransom token")
    print("      - Use validation decision trees")
    print()
    print("   c) references/narrative-threads.md")
    print("      - Check thread candidates above")
    print("      - Read relevant thread section(s)")
    print("      - Review thread assignment framework")
    print("      - Consider thread needs (gaps to fill)")
    print("      - Validate thematic fit")
    print()
    print("2. USE CHARACTER DATABASE FIELDS:")
    print("   - Emotion field guides token voice/tone")
    print("   - Overview grounds token in relationships")
    print("   - Primary Action ensures token supports gameplay")
    print("   - Logline captures character essence")
    print()
    print("3. DESIGN TOKEN(S):")
    print("   - Content aligned with goal cluster mantra")
    print("   - Voice matches Emotion field")
    print("   - Grounded in timeline events")
    print("   - SF_ fields validate per sf-mechanics.md")
    print("   - Thread assignment per narrative-threads.md")
    print()
    print("4. ITERATE WITH MAX:")
    print("   - Present design recommendations with rationale")
    print("   - Max decides final token design")
    print("   - Iterate on copy using character voice guidance")
    print("   - Validate SF_ fields and thread assignment")
    print()
    print("=" * 80)
    print("CONTEXT COMPLETE - Ready for token design")
    print("=" * 80)


def main():
    if len(sys.argv) < 2:
        print("Usage: python token_design_context_generator.py \"CHARACTER NAME\"")
        print()
        print("Examples:")
        print("  python token_design_context_generator.py \"E - Ashe Motoko\"")
        print("  python token_design_context_generator.py \"S - Sarah Blackwood\"")
        print("  python token_design_context_generator.py \"P - Oliver Sterling\"")
        sys.exit(1)
    
    character_name = sys.argv[1]
    generate_token_design_context(character_name)


if __name__ == "__main__":
    main()
