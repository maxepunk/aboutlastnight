#!/usr/bin/env python3
"""
Element-to-Character Wiring Gap Scanner
Detects elements that mention characters in narrative text without proper database relations.
Multi-factor confidence scoring for agent interpretation.
"""

import requests
import re
import time
from collections import defaultdict
from typing import Dict, List, Set, Tuple
import urllib3

# Suppress SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

# Character names to search for (last names for specificity)
CHARACTER_LAST_NAMES = {
    "Sterling": "P - Oliver Sterling",
    "Bishara": "S - Leila Bishara",
    "Whitman": "E - James Whitman",
    "Thorn": "R - Derek Thorn",
    "Kingsley": "P - Victoria Kingsley",
    "Blackwood": "S - Sarah Blackwood",
    "Motoko": "E - Ashe Motoko",
    "Reeves": "E - Alex Reeves",
    "Nilsson": "E - Diana Nilsson",
    "Kim": "P - Skyler Iyer",
    "Iyer": "P - Skyler Iyer",
    "Sullivan": "R - Howie Sullivan",
    "Francisco": "S - Sofia Francisco",
    "Andersen": "R - Kai Andersen",
    "Woods": "R - Jamie Woods",
    "Torres": "R - Rachel Torres",
    "Kane": "E - Jessicah Kane",
    "Chase": "S - Taylor Chase",
    "Zhang": "P - Tori Zhang",
    "Reed": "P - Morgan Reed",
    "Flip": "P - Flip",
    "Marcus": "Marcus Blackwood",
    "Blake": "Blake",
    "Detective": "Detective Anondono",
    "Diana": "E - Diana Nilsson",
    "Oliver": "P - Oliver Sterling",
    "Leila": "S - Leila Bishara",
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

def build_character_id_map():
    """Build map of character IDs to names."""
    characters = query_all(CHARACTERS_DB_ID)
    
    id_map = {}
    for char in characters:
        char_id = char["id"]
        name = safe_get_text(char["properties"].get("Name", {}), "title")
        id_map[char_id] = name
    
    return id_map

def find_character_mentions(text: str) -> Set[str]:
    """Find character names mentioned in text."""
    if not text:
        return set()
    
    mentioned = set()
    text_lower = text.lower()
    
    for last_name, full_name in CHARACTER_LAST_NAMES.items():
        if last_name.lower() in text_lower:
            mentioned.add(full_name)
    
    return mentioned

def calculate_confidence(element_name: str, element_type: str, narrative_text: str, 
                        mentioned_char: str, owner_name: str) -> Tuple[float, List[str]]:
    """Calculate confidence score that this is a real wiring gap."""
    score = 0.0
    reasons = []
    
    text_lower = narrative_text.lower()
    char_last_name = mentioned_char.split()[-1].lower()
    
    # Layer 1: Mention count
    mention_count = text_lower.count(char_last_name)
    if mention_count > 1:
        score += 1.0
        reasons.append(f"Multiple mentions ({mention_count}x)")
    elif mention_count == 1:
        score += 0.5
        reasons.append("Single mention")
    
    # Layer 2: Relationship language
    relationship_terms = ["trust", "partner", "friend", "fixed point", "ally", "worked with", 
                         "colleague", "relationship", "affair", "married", "divorce"]
    for term in relationship_terms:
        if term in text_lower:
            score += 1.5
            reasons.append(f"Relationship language: '{term}'")
            break
    
    # Layer 3: Specificity
    if re.search(r'\b(19|20)\d{2}\b', narrative_text):
        score += 0.5
        reasons.append("Specific date reference")
    
    if re.search(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\b', 
                 narrative_text, re.IGNORECASE):
        score += 0.5
        reasons.append("Month reference")
    
    # Layer 4: Element type context
    if "Character Sheet" in element_name:
        score += 1.0
        reasons.append("Character sheet (trust network)")
    elif "Memory Token" in element_type:
        score += 0.5
        reasons.append("Memory token (narrative content)")
    
    # Layer 5: Owner self-reference
    if mentioned_char == owner_name:
        score = 0.0
        reasons = ["Self-reference (not a gap)"]
    
    return score, reasons

def scan_elements_for_character_gaps():
    """Scan all elements for character mention wiring gaps."""
    print("Querying all elements...")
    elements = query_all(ELEMENTS_DB_ID)
    print(f"Retrieved {len(elements)} elements\n")
    
    print("Building character ID map...")
    char_id_map = build_character_id_map()
    
    gaps = []
    
    print("Analyzing element narratives...\n")
    for elem in elements:
        props = elem.get("properties", {})
        
        elem_name = safe_get_text(props.get("Name", {}), "title")
        basic_type = props.get("Basic Type", {}).get("select", {})
        type_name = basic_type.get("name", "Unknown") if basic_type else "Unknown"
        
        desc_text = safe_get_text(props.get("Description/Text", {}))
        if not desc_text:
            continue
        
        owner_relation = props.get("Owner", {}).get("relation", [])
        owner_id = owner_relation[0]["id"] if owner_relation else None
        owner_name = char_id_map.get(owner_id, "Unknown") if owner_id else "Unknown"
        
        associated_relation = props.get("Associated Characters", {}).get("relation", [])
        associated_ids = [rel["id"] for rel in associated_relation]
        associated_names = [char_id_map.get(aid, "") for aid in associated_ids]
        
        mentioned_chars = find_character_mentions(desc_text)
        
        for mentioned_char in mentioned_chars:
            if mentioned_char == owner_name or mentioned_char in associated_names:
                continue
            
            context_start = desc_text.lower().find(mentioned_char.split()[-1].lower())
            context_snippet = desc_text[max(0, context_start-50):context_start+100] if context_start >= 0 else desc_text[:150]
            
            score, reasons = calculate_confidence(
                elem_name, type_name, desc_text, mentioned_char, owner_name
            )
            
            if score > 0.5:
                gaps.append({
                    "element_name": elem_name,
                    "element_type": type_name,
                    "owner": owner_name,
                    "mentioned_character": mentioned_char,
                    "current_associated": associated_names,
                    "context": context_snippet,
                    "confidence": score,
                    "reasons": reasons
                })
    
    return gaps

def print_gaps_report(gaps: List[Dict]):
    """Print formatted gaps report for agent interpretation."""
    gaps_sorted = sorted(gaps, key=lambda x: x["confidence"], reverse=True)
    
    high = [g for g in gaps_sorted if g["confidence"] >= 3.0]
    medium = [g for g in gaps_sorted if 1.5 <= g["confidence"] < 3.0]
    low = [g for g in gaps_sorted if g["confidence"] < 1.5]
    
    print("=" * 80)
    print("ELEMENT-TO-CHARACTER WIRING GAP ANALYSIS")
    print("=" * 80)
    print("\nElements mentioning characters without proper database relations\n")
    
    print(f"Total Potential Gaps: {len(gaps)}")
    print(f"  HIGH confidence (≥3.0): {len(high)}")
    print(f"  MEDIUM confidence (1.5-2.9): {len(medium)}")
    print(f"  LOW confidence (<1.5): {len(low)}")
    
    if high:
        print("\n" + "=" * 80)
        print("HIGH CONFIDENCE GAPS (≥3.0)")
        print("=" * 80)
        
        for idx, gap in enumerate(high[:10], 1):
            print(f"\n{idx}. Element: {gap['element_name']}")
            print(f"   Type: {gap['element_type']}")
            print(f"   Owner: {gap['owner']}")
            print(f"   Mentioned: {gap['mentioned_character']}")
            print(f"   Current Associated: {gap['current_associated'] if gap['current_associated'] else 'None'}")
            print(f"   Confidence: {gap['confidence']:.1f}")
            print(f"   Factors: {', '.join(gap['reasons'])}")
            print(f"   Context: ...{gap['context']}...")
        
        if len(high) > 10:
            print(f"\n   ... and {len(high) - 10} more high-confidence gaps")
    
    if medium:
        print("\n" + "=" * 80)
        print("MEDIUM CONFIDENCE GAPS (1.5-2.9)")
        print("=" * 80)
        
        for idx, gap in enumerate(medium[:5], 1):
            print(f"\n{idx}. Element: {gap['element_name']}")
            print(f"   Mentioned: {gap['mentioned_character']}")
            print(f"   Owner: {gap['owner']}")
            print(f"   Confidence: {gap['confidence']:.1f}")
            print(f"   Context: ...{gap['context']}...")
        
        if len(medium) > 5:
            print(f"\n   ... and {len(medium) - 5} more medium-confidence gaps")
    
    print("\n" + "=" * 80)
    print("PATTERN SUMMARY")
    print("=" * 80)
    
    mentioned_counts = defaultdict(int)
    for gap in gaps_sorted:
        mentioned_counts[gap["mentioned_character"]] += 1
    
    print("\nMost frequently mentioned without relations:")
    for char, count in sorted(mentioned_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {char}: {count} gaps")
    
    type_counts = defaultdict(int)
    for gap in gaps_sorted:
        type_counts[gap["element_type"]] += 1
    
    print("\nElement types with most gaps:")
    for etype, count in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {etype}: {count} gaps")

def main():
    gaps = scan_elements_for_character_gaps()
    print_gaps_report(gaps)
    
    print("\n" + "=" * 80)
    print("INTERPRETATION GUIDE")
    print("=" * 80)
    print("""
HIGH confidence gaps are likely real wiring issues:
  - Character sheets documenting trust pairs
  - Memory tokens with relationship language
  - Multiple specific mentions

MEDIUM confidence gaps need review:
  - Single mentions that may or may not be significant
  - Cross-reference with character backgrounds

LOW confidence gaps are often:
  - Casual references
  - May not need wiring
    """)

if __name__ == "__main__":
    main()
