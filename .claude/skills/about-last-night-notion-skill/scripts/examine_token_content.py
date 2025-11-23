#!/usr/bin/env python3
"""
Examine specific element content by name search.

Usage: python examine_token_content.py "search term"

Searches for elements whose Name contains the search term and displays their content.
Works for all element types (tokens, props, documents, set dressing, etc.)
"""

import requests
import time
import urllib3
import sys

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

def safe_get_text(prop_data, prop_type="rich_text"):
    """Extract text from rich_text or title properties."""
    items = prop_data.get(prop_type, [])
    if not items:
        return ""
    text_parts = []
    for item in items:
        if "plain_text" in item:
            text_parts.append(item["plain_text"])
    return "".join(text_parts)

def safe_get_select(prop_data):
    """Extract select field value."""
    select_obj = prop_data.get("select")
    return select_obj.get("name") if select_obj else ""

def safe_get_relation(prop_data):
    """Extract relation as list of IDs."""
    return [r.get("id") for r in prop_data.get("relation", [])]

if len(sys.argv) < 2:
    print("Usage: python examine_token_content.py \"search term\"")
    print("\nExample: python examine_token_content.py \"Taylor Chase\"")
    print("         python examine_token_content.py \"ALR002\"")
    sys.exit(1)

search_term = sys.argv[1]

# Query for elements matching search term
url = f"https://api.notion.com/v1/databases/{ELEMENTS_DB_ID}/query"
payload = {
    "filter": {
        "property": "Name",
        "title": {"contains": search_term}
    }
}

response = requests.post(url, headers=HEADERS, json=payload, verify=False)
time.sleep(0.5)

if response.status_code != 200:
    print(f"Error: API returned status {response.status_code}")
    sys.exit(1)

results = response.json().get("results", [])

if not results:
    print(f"No elements found matching '{search_term}'")
    sys.exit(0)

print(f"Found {len(results)} element(s) matching '{search_term}':")
print()

for elem in results:
    props = elem.get("properties", {})
    
    name = safe_get_text(props.get("Name", {}), "title")
    element_type = safe_get_select(props.get("Basic Type", {}))
    owner_ids = safe_get_relation(props.get("Owner", {}))
    thread = safe_get_select(props.get("Thread", {}))
    desc = safe_get_text(props.get("Description/Text", {}))
    
    # SF_ fields for memory tokens
    sf_rfid = safe_get_text(props.get("SF_RFID", {}))
    sf_value = safe_get_text(props.get("SF_ValueRating", {}))
    sf_type = safe_get_text(props.get("SF_MemoryType", {}))
    sf_group = safe_get_text(props.get("SF_Group", {}))
    sf_summary = safe_get_text(props.get("SF_Summary", {}))
    
    print("=" * 80)
    print(f"ELEMENT: {name}")
    print("=" * 80)
    print(f"Type: {element_type}")
    print(f"Thread: {thread if thread else '(unassigned)'}")
    print(f"Owner: {len(owner_ids)} relation(s)")
    print()
    
    if desc:
        print("DESCRIPTION/TEXT:")
        print(desc)
        print()
    
    # Show SF_ fields if this is a memory token
    if "Memory Token" in element_type and (sf_rfid or sf_value or sf_type or sf_summary):
        print("MEMORY TOKEN FIELDS:")
        if sf_rfid:
            print(f"SF_RFID: [{sf_rfid}]")
        if sf_value:
            print(f"SF_ValueRating: [{sf_value}]")
        if sf_type:
            print(f"SF_MemoryType: [{sf_type}]")
        if sf_group:
            print(f"SF_Group: [{sf_group}]")
        if sf_summary:
            print(f"SF_Summary: [{sf_summary}]")
        print()
    
    print()

