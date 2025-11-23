#!/usr/bin/env python3
"""
Wire Element - Assign narrative thread to a single element.

Usage: python wire_element.py "Element Name" "Thread Name"

Example: python wire_element.py "ALR002 - Alex's Memory 2" "Funding & Espionage"

Note: If full element names with special characters fail, try:
- Using just the token code: "ALR002"
- Using a partial name: "Alex's Memory"

Valid threads:
- Funding & Espionage
- Marriage Troubles
- Memory Drug
- Underground Parties
- Advanced Technology
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

VALID_THREADS = [
    "Funding & Espionage",
    "Marriage Troubles",
    "Memory Drug",
    "Underground Parties",
    "Advanced Technology"
]

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

def safe_get_multi_select(prop_data):
    """Extract multi_select field values."""
    items = prop_data.get("multi_select", [])
    return [item.get("name") for item in items if item.get("name")]

if len(sys.argv) < 3:
    print("Usage: python wire_element.py \"Element Name\" \"Thread Name\"")
    print("\nExample: python wire_element.py \"ALR002\" \"Funding & Espionage\"")
    print("\nValid threads:")
    for thread in VALID_THREADS:
        print(f"  - {thread}")
    sys.exit(1)

element_name = sys.argv[1]
thread_name = sys.argv[2]

# Validate thread name
if thread_name not in VALID_THREADS:
    print(f"Error: '{thread_name}' is not a valid thread.")
    print("\nValid threads:")
    for thread in VALID_THREADS:
        print(f"  - {thread}")
    sys.exit(1)

# Search for element
print(f"Searching for element matching '{element_name}'...")
url = f"https://api.notion.com/v1/databases/{ELEMENTS_DB_ID}/query"
payload = {
    "filter": {
        "property": "Name",
        "title": {"contains": element_name}
    }
}

response = requests.post(url, headers=HEADERS, json=payload, verify=False)
time.sleep(0.5)

if response.status_code != 200:
    print(f"Error: API returned status {response.status_code}")
    sys.exit(1)

results = response.json().get("results", [])

if not results:
    print(f"Error: No element found matching '{element_name}'")
    sys.exit(1)

if len(results) > 1:
    print(f"Error: Multiple elements found matching '{element_name}':")
    for elem in results:
        props = elem.get("properties", {})
        name = safe_get_text(props.get("Name", {}), "title")
        print(f"  - {name}")
    print("\nPlease use a more specific search term.")
    sys.exit(1)

# Found exactly one element
elem = results[0]
elem_id = elem["id"]
props = elem.get("properties", {})
name = safe_get_text(props.get("Name", {}), "title")
element_type = safe_get_select(props.get("Basic Type", {}))
current_threads = safe_get_multi_select(props.get("Narrative Threads", {}))

print(f"\nFound element: {name}")
print(f"Type: {element_type}")
print(f"Current threads: {', '.join(current_threads) if current_threads else '(unassigned)'}")
print(f"New thread: {thread_name}")
print()

# Update the Narrative Threads field
print("Updating thread assignment...")
update_url = f"https://api.notion.com/v1/pages/{elem_id}"
update_payload = {
    "properties": {
        "Narrative Threads": {
            "multi_select": [
                {"name": thread_name}
            ]
        }
    }
}

response = requests.patch(update_url, headers=HEADERS, json=update_payload, verify=False)
time.sleep(0.5)

if response.status_code == 200:
    print(f"✓ Successfully wired '{name}' to '{thread_name}'")
else:
    # Extract error details
    error_msg = f"HTTP {response.status_code}"
    try:
        error_data = response.json()
        if "message" in error_data:
            error_msg = f"{response.status_code}: {error_data['message']}"
    except:
        pass
    
    print(f"✗ First attempt failed: {error_msg}")
    print("  Retrying...")
    time.sleep(2)
    
    # Retry once
    response = requests.patch(update_url, headers=HEADERS, json=update_payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code == 200:
        print(f"✓ Successfully wired '{name}' to '{thread_name}' on retry")
    else:
        error_msg = f"HTTP {response.status_code}"
        try:
            error_data = response.json()
            if "message" in error_data:
                error_msg = f"{response.status_code}: {error_data['message']}"
        except:
            pass
        print(f"✗ Error updating element after retry: {error_msg}")
        sys.exit(1)
