#!/usr/bin/env python3
"""
PROPER verification of Timeline and Puzzle database schemas.
Check ACTUAL property names and data patterns, not assumptions.
"""

import requests
import urllib3
import json

# Suppress SSL warnings for clean output
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
TIMELINE_DB_ID = "1b52f33d-583f-80de-ae5a-d20020c120dd"
PUZZLES_DB_ID = "1b62f33d-583f-80cc-87cf-d7d6c4b0b265"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

def safe_get_text(prop_data, prop_type="title"):
    """Safely extract text from title or rich_text property."""
    items = prop_data.get(prop_type, [])
    if not items or len(items) == 0:
        return "[EMPTY]"
    
    first_item = items[0]
    # Try plain_text first, then text.content
    if "plain_text" in first_item:
        return first_item["plain_text"]
    elif "text" in first_item and "content" in first_item["text"]:
        return first_item["text"]["content"]
    else:
        return "[EMPTY]"

def get_database_schema(db_id: str, db_name: str):
    """Get actual database schema."""
    url = f"https://api.notion.com/v1/databases/{db_id}"
    response = requests.get(url, headers=HEADERS, verify=False)
    
    if response.status_code != 200:
        print(f"Error fetching {db_name}: {response.status_code}")
        return None
    
    return response.json()

def query_database(db_id: str, limit: int = 3):
    """Query actual database records."""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    payload = {"page_size": limit}
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    
    if response.status_code != 200:
        print(f"Error querying: {response.status_code}")
        return []
    
    return response.json().get("results", [])

def analyze_timeline():
    print("\n" + "="*80)
    print("TIMELINE DATABASE - ACTUAL SCHEMA VERIFICATION")
    print("="*80 + "\n")
    
    schema = get_database_schema(TIMELINE_DB_ID, "Timeline")
    if not schema:
        return
    
    properties = schema.get("properties", {})
    
    # Find the title property
    title_prop = None
    for name, data in properties.items():
        if data.get("type") == "title":
            title_prop = name
            print(f"✓ TITLE property is: '{name}'")
            break
    
    # List all relation properties
    print("\n📋 RELATION PROPERTIES:")
    for name, data in properties.items():
        if data.get("type") == "relation":
            related_db = data.get("relation", {}).get("database_id", "")
            # Identify which database
            db_name = "Unknown"
            if "8020" in related_db:
                db_name = "Elements"
            elif "8060" in related_db:
                db_name = "Characters"
            print(f"   - {name} → {db_name}")
    
    # List all rich_text properties
    print("\n📝 TEXT/DESCRIPTION PROPERTIES:")
    for name, data in properties.items():
        if data.get("type") in ["rich_text", "title"]:
            print(f"   - {name} (type: {data.get('type')})")
    
    # List select/multi_select properties
    print("\n🔽 SELECT PROPERTIES:")
    found_select = False
    for name, data in properties.items():
        if data.get("type") in ["select", "multi_select"]:
            found_select = True
            print(f"   - {name} (type: {data.get('type')})")
    if not found_select:
        print("   [NONE FOUND]")
    
    # Query actual records
    print("\n📊 SAMPLE RECORDS:")
    records = query_database(TIMELINE_DB_ID, limit=3)
    
    for idx, record in enumerate(records, 1):
        props = record.get("properties", {})
        
        # Get title
        title = safe_get_text(props.get(title_prop, {}), "title")
        
        # Get date
        date_data = props.get("Date", {}).get("date", {})
        date = date_data.get("start", "[NO DATE]") if date_data else "[NO DATE]"
        
        # Get relations
        chars = len(props.get("Characters Involved", {}).get("relation", []))
        elements = len(props.get("Memory/Evidence", {}).get("relation", []))
        
        # Get notes
        notes = safe_get_text(props.get("Notes", {}), "rich_text")
        notes_preview = notes[:50] + "..." if len(notes) > 50 else notes
        
        print(f"\n   {idx}. Description: {title}")
        print(f"      Date: {date}")
        print(f"      Characters: {chars}, Elements: {elements}")
        if notes != "[EMPTY]":
            print(f"      Notes: {notes_preview}")

def analyze_puzzles():
    print("\n\n" + "="*80)
    print("PUZZLE DATABASE - ACTUAL SCHEMA VERIFICATION")
    print("="*80 + "\n")
    
    schema = get_database_schema(PUZZLES_DB_ID, "Puzzles")
    if not schema:
        return
    
    properties = schema.get("properties", {})
    
    # Find the title property
    title_prop = None
    for name, data in properties.items():
        if data.get("type") == "title":
            title_prop = name
            print(f"✓ TITLE property is: '{name}'")
            break
    
    # List all relation properties
    print("\n📋 RELATION PROPERTIES:")
    for name, data in properties.items():
        if data.get("type") == "relation":
            related_db = data.get("relation", {}).get("database_id", "")
            # Identify which database
            db_name = "Unknown"
            if "8020" in related_db:
                db_name = "Elements"
            elif "8060" in related_db:
                db_name = "Characters"
            elif "80cc" in related_db:
                db_name = "Puzzles (self-reference)"
            print(f"   - {name} → {db_name}")
    
    # List all rich_text properties
    print("\n📝 TEXT/DESCRIPTION PROPERTIES:")
    for name, data in properties.items():
        if data.get("type") in ["rich_text", "title"]:
            print(f"   - {name} (type: {data.get('type')})")
    
    # List select/multi_select properties
    print("\n🔽 SELECT PROPERTIES:")
    found_select = False
    for name, data in properties.items():
        if data.get("type") in ["select", "multi_select"]:
            found_select = True
            options = data.get(data.get("type"), {}).get("options", [])
            option_names = [opt["name"] for opt in options]
            print(f"   - {name} (type: {data.get('type')})")
            if option_names:
                print(f"     Options: {option_names}")
    if not found_select:
        print("   [NONE FOUND]")
    
    # List checkbox properties
    print("\n☑ CHECKBOX PROPERTIES:")
    for name, data in properties.items():
        if data.get("type") == "checkbox":
            print(f"   - {name}")
    
    # Query actual records
    print("\n📊 SAMPLE RECORDS:")
    records = query_database(PUZZLES_DB_ID, limit=3)
    
    for idx, record in enumerate(records, 1):
        props = record.get("properties", {})
        
        # Get title
        title = safe_get_text(props.get(title_prop, {}), "title")
        
        # Get relations
        elements = len(props.get("Puzzle Elements", {}).get("relation", []))
        rewards = len(props.get("Rewards", {}).get("relation", []))
        locked = len(props.get("Locked Item", {}).get("relation", []))
        
        # Get critical path
        critical = props.get("Critical Path", {}).get("checkbox", False)
        
        # Get description
        desc = safe_get_text(props.get("Description/Solution", {}), "rich_text")
        desc_preview = desc[:50] + "..." if len(desc) > 50 else desc
        
        print(f"\n   {idx}. Puzzle: {title}")
        print(f"      Elements: {elements}, Rewards: {rewards}, Locked Item: {locked}")
        print(f"      Critical Path: {critical}")
        if desc != "[EMPTY]":
            print(f"      Description: {desc_preview}")

def main():
    print("\n🔍 PROPER SCHEMA VERIFICATION")
    print("Checking ACTUAL property names from Notion API, not assumptions\n")
    
    analyze_timeline()
    analyze_puzzles()
    
    print("\n\n" + "="*80)
    print("CRITICAL FINDINGS TO DOCUMENT:")
    print("="*80)
    print("""
Timeline Database:
✓ Title property: "Description" (NOT "Event")
✓ Text fields: "Description" (title), "Notes" (rich_text)
? SELECT fields: Check if any exist (like Narrative Thread)
✓ Relations: "Characters Involved" → Characters, "Memory/Evidence" → Elements

Puzzle Database:
✓ Title property: "Puzzle"
✓ Text fields: "Puzzle" (title), "Description/Solution" (rich_text)
? SELECT fields: Check if any exist for categorization
✓ Relations: "Puzzle Elements", "Rewards", "Locked Item" → Elements
✓ Self-reference: "Parent item", "Sub-Puzzles" → Puzzles (hierarchical)
✓ Checkbox: "Critical Path"
    """)

if __name__ == "__main__":
    main()
