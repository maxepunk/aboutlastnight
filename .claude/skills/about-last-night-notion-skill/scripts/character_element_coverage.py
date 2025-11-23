#!/usr/bin/env python3
"""
Character Element Coverage Analysis

Shows COMPLETE narrative coverage for a character:
1. Elements they OWN (their POV/possession)
2. Elements where they're ASSOCIATED (involved in backstory but not owner)
3. Elements mentioning them in Description/Text (narrative mentions)

This reveals the full picture of a character's narrative presence.
"""

import requests
import time
import urllib3
import sys

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

CHARACTERS_DB = "18c2f33d-583f-8060-a6ab-de32ff06bca2"
ELEMENTS_DB = "18c2f33d-583f-8020-91bc-d84c7dd94306"

def safe_get_select(prop):
    """Safely extract select property value"""
    if prop and prop.get("select"):
        return prop["select"].get("name", "Unknown")
    return "Unknown"

def safe_get_rich_text(prop):
    """Safely extract rich text property value"""
    if prop and prop.get("rich_text"):
        return "".join([text.get("plain_text", "") for text in prop["rich_text"]])
    return ""

def safe_get_rollup(prop):
    """Safely extract rollup property value"""
    if prop and prop.get("rollup"):
        rollup = prop["rollup"]
        rollup_type = rollup.get("type")
        
        if rollup_type == "array":
            array_items = rollup.get("array", [])
            values = []
            for item in array_items:
                if item.get("type") == "select":
                    select_val = item.get("select", {})
                    if select_val:
                        values.append(select_val.get("name", "Unknown"))
            return values
    return []

def query_character_by_name(name_contains):
    """Query for a character by name"""
    url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB}/query"
    payload = {
        "filter": {
            "property": "Name",
            "title": {
                "contains": name_contains
            }
        }
    }
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code == 200:
        results = response.json().get("results", [])
        return results[0] if results else None
    return None

def query_all_elements():
    """Query all elements"""
    url = f"https://api.notion.com/v1/databases/{ELEMENTS_DB}/query"
    results = []
    has_more = True
    start_cursor = None
    
    while has_more:
        payload = {"page_size": 100}
        if start_cursor:
            payload["start_cursor"] = start_cursor
        
        response = requests.post(url, headers=HEADERS, json=payload, verify=False)
        time.sleep(0.5)
        
        if response.status_code == 200:
            data = response.json()
            results.extend(data.get("results", []))
            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")
        else:
            break
    
    return results

def get_page(page_id):
    """Get a single page"""
    url = f"https://api.notion.com/v1/pages/{page_id}"
    response = requests.get(url, headers=HEADERS, verify=False)
    time.sleep(0.5)
    
    if response.status_code == 200:
        return response.json()
    return None

def analyze_character_elements(char_name_contains):
    """Analyze all elements for a character"""
    
    # Get character
    character = query_character_by_name(char_name_contains)
    
    if not character:
        print(f"Character '{char_name_contains}' not found")
        return
    
    char_props = character.get("properties", {})
    char_name_prop = char_props.get("Name", {}).get("title", [])
    char_full_name = char_name_prop[0].get("plain_text", "Unknown") if char_name_prop else "Unknown"
    
    char_id = character.get("id")
    
    # Extract character name parts for text search
    name_parts = char_full_name.replace("E - ", "").replace("R - ", "").replace("S - ", "").replace("P - ", "").split()
    search_terms = name_parts  # Will search for first name, last name
    
    print("=" * 80)
    print(f"CHARACTER ELEMENT COVERAGE: {char_full_name}")
    print("=" * 80)
    
    # Get all elements
    print("\nQuerying all elements (this may take a moment)...")
    all_elements = query_all_elements()
    print(f"Retrieved {len(all_elements)} total elements\n")
    
    # Categorize elements
    owned_elements = []
    associated_elements = []
    mentioned_elements = []
    
    for element in all_elements:
        props = element.get("properties", {})
        
        # Get element name
        name_prop = props.get("Name", {}).get("title", [])
        elem_name = name_prop[0].get("plain_text", "Unnamed") if name_prop else "Unnamed"
        
        # Get basic type
        basic_type = safe_get_select(props.get("Basic Type", {}))
        
        # Get description
        description = safe_get_rich_text(props.get("Description/Text", {}))
        
        # Check if owned
        owner_relation = props.get("Owner", {}).get("relation", [])
        is_owned = any(rel.get("id") == char_id for rel in owner_relation)
        
        # Check if associated (via rollup of Associated Characters)
        associated_chars = safe_get_rollup(props.get("Associated Characters", {}))
        is_associated = char_full_name in associated_chars
        
        # Check if mentioned in description
        is_mentioned = any(term.lower() in description.lower() for term in search_terms) if description else False
        
        elem_data = {
            "name": elem_name,
            "type": basic_type,
            "description_preview": description[:100] + "..." if len(description) > 100 else description
        }
        
        if is_owned:
            owned_elements.append(elem_data)
        
        if is_associated and not is_owned:
            associated_elements.append(elem_data)
        
        if is_mentioned and not is_owned and not is_associated:
            mentioned_elements.append(elem_data)
    
    # Display results
    print("=" * 80)
    print("1. OWNED ELEMENTS (Character's POV/Possession)")
    print("=" * 80)
    print(f"Count: {len(owned_elements)}\n")
    
    for elem in owned_elements:
        print(f"• {elem['name']} ({elem['type']})")
        if elem['description_preview']:
            print(f"  Preview: {elem['description_preview']}\n")
    
    if not owned_elements:
        print("⚠ No owned elements found\n")
    
    print("=" * 80)
    print("2. ASSOCIATED ELEMENTS (Character Involved But Not Owner)")
    print("=" * 80)
    print(f"Count: {len(associated_elements)}\n")
    
    if associated_elements:
        print("These elements involve this character in their backstory event,")
        print("even though someone else owns them. They still provide narrative coverage.\n")
        
        for elem in associated_elements:
            print(f"• {elem['name']} ({elem['type']})")
            if elem['description_preview']:
                print(f"  Preview: {elem['description_preview']}\n")
    else:
        print("No associated elements found\n")
    
    print("=" * 80)
    print("3. NARRATIVE MENTIONS (Character Named in Description)")
    print("=" * 80)
    print(f"Count: {len(mentioned_elements)}\n")
    
    if mentioned_elements:
        print("These elements mention this character in their narrative text")
        print("but don't have them as owner or associated character (potential orphans).\n")
        
        for elem in mentioned_elements:
            print(f"• {elem['name']} ({elem['type']})")
            if elem['description_preview']:
                print(f"  Preview: {elem['description_preview']}\n")
    else:
        print("No additional narrative mentions found\n")
    
    # Summary
    print("=" * 80)
    print("COMPLETE NARRATIVE COVERAGE SUMMARY")
    print("=" * 80)
    
    total_coverage = len(owned_elements) + len(associated_elements) + len(mentioned_elements)
    
    print(f"\nOwned Elements: {len(owned_elements)}")
    print(f"Associated Elements: {len(associated_elements)}")
    print(f"Narrative Mentions: {len(mentioned_elements)}")
    print(f"TOTAL NARRATIVE PRESENCE: {total_coverage} elements")
    
    print(f"\n--- Assessment ---")
    
    if len(owned_elements) > 0:
        owned_types = {}
        for elem in owned_elements:
            owned_types[elem['type']] = owned_types.get(elem['type'], 0) + 1
        print(f"\nOwned Element Distribution:")
        for elem_type, count in sorted(owned_types.items(), key=lambda x: x[1], reverse=True):
            print(f"  {elem_type}: {count}")
    
    if len(associated_elements) > 0:
        print(f"\n✓ Character appears in {len(associated_elements)} other characters' stories")
        print(f"  This provides narrative coverage beyond owned elements")
    
    if len(mentioned_elements) > 0:
        print(f"\n⚠ {len(mentioned_elements)} elements mention character without proper relations")
        print(f"  These are potential orphans - should they be owned or associated?")
    
    if total_coverage < 5:
        print(f"\n⚠ Thin overall narrative presence ({total_coverage} total elements)")
    else:
        print(f"\n✓ Reasonable narrative presence ({total_coverage} total elements)")

def main():
    """Run character element coverage analysis"""
    if len(sys.argv) < 2:
        print("Usage: python character_element_coverage.py <character_name>")
        print("\nExamples:")
        print("  python character_element_coverage.py 'Oliver Sterling'")
        print("  python character_element_coverage.py 'Derek'")
        sys.exit(1)
    
    name = " ".join(sys.argv[1:])
    analyze_character_elements(name)

if __name__ == "__main__":
    main()
