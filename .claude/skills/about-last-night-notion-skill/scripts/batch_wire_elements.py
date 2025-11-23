#!/usr/bin/env python3
"""
Batch Wire Elements - Assign threads to multiple elements from CSV file.

Usage: python batch_wire_elements.py wirings.csv

CSV format (header optional):
element_search_term,thread_name

Example CSV:
element_name,new_thread
ALR002,Funding & Espionage
Diana's emails,Marriage Troubles
SAB001,Funding & Espionage

Note: If the CSV includes a header row (e.g., "element_name,new_thread"), 
it will be automatically detected and skipped.

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
import csv

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

def find_element(element_name):
    """Search for element by name. Returns (page_id, name, type, current_threads) or None."""
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
        return None
    
    results = response.json().get("results", [])
    
    if len(results) != 1:
        return None
    
    elem = results[0]
    props = elem.get("properties", {})
    name = safe_get_text(props.get("Name", {}), "title")
    element_type = safe_get_select(props.get("Basic Type", {}))
    current_threads = safe_get_multi_select(props.get("Narrative Threads", {}))
    
    return (elem["id"], name, element_type, current_threads)

def update_thread(page_id, thread_name, retry=True):
    """Update element's thread field. Returns (success, error_message)."""
    url = f"https://api.notion.com/v1/pages/{page_id}"
    payload = {
        "properties": {
            "Narrative Threads": {
                "multi_select": [
                    {"name": thread_name}
                ]
            }
        }
    }
    
    response = requests.patch(url, headers=HEADERS, json=payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code == 200:
        return (True, None)
    
    # First attempt failed - try to extract error message
    error_msg = f"HTTP {response.status_code}"
    try:
        error_data = response.json()
        if "message" in error_data:
            error_msg = f"{response.status_code}: {error_data['message']}"
    except:
        pass
    
    # Retry once if requested
    if retry:
        print(f"  ⚠ First attempt failed ({error_msg}), retrying...")
        time.sleep(2)  # Longer delay before retry
        return update_thread(page_id, thread_name, retry=False)
    
    return (False, error_msg)

if len(sys.argv) < 2:
    print("Usage: python batch_wire_elements.py wirings.csv")
    print("\nCSV format (no header):")
    print("element_search_term,thread_name")
    print("\nExample:")
    print("ALR002,Funding & Espionage")
    print("Diana's emails,Marriage Troubles")
    sys.exit(1)

csv_file = sys.argv[1]

# Read CSV
try:
    with open(csv_file, 'r') as f:
        reader = csv.reader(f)
        rows = [row for row in reader if len(row) >= 2]
        
        # Detect and skip header row
        # Common header patterns: element_name, element, name, search_term
        if rows and any(keyword in rows[0][0].lower() for keyword in ['element', 'name', 'search', 'token']):
            print(f"Detected header row, skipping: {rows[0]}")
            rows = rows[1:]
        
        wirings = [(row[0].strip(), row[1].strip()) for row in rows]
except FileNotFoundError:
    print(f"Error: File '{csv_file}' not found")
    sys.exit(1)
except Exception as e:
    print(f"Error reading CSV: {e}")
    sys.exit(1)

if not wirings:
    print("Error: No valid wirings found in CSV")
    sys.exit(1)

print(f"Processing {len(wirings)} wiring(s)...")
print("=" * 80)

results = {
    "success": [],
    "errors": []
}

for element_name, thread_name in wirings:
    print(f"\n[{element_name}] → [{thread_name}]")
    
    # Validate thread
    if thread_name not in VALID_THREADS:
        msg = f"Invalid thread name"
        print(f"  ✗ {msg}")
        results["errors"].append((element_name, msg))
        continue
    
    # Find element
    elem_data = find_element(element_name)
    if not elem_data:
        msg = f"Element not found or multiple matches"
        print(f"  ✗ {msg}")
        results["errors"].append((element_name, msg))
        continue
    
    page_id, full_name, elem_type, current_threads = elem_data
    print(f"  Found: {full_name}")
    print(f"  Type: {elem_type}")
    print(f"  Current: {', '.join(current_threads) if current_threads else '(unassigned)'}")
    
    # Update thread
    success, error_msg = update_thread(page_id, thread_name)
    if success:
        print(f"  ✓ Wired to '{thread_name}'")
        results["success"].append((full_name, thread_name))
    else:
        print(f"  ✗ Update failed: {error_msg}")
        results["errors"].append((element_name, error_msg))

# Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Successful: {len(results['success'])}")
print(f"Errors: {len(results['errors'])}")

if results["success"]:
    print("\nSuccessful wirings:")
    for name, thread in results["success"]:
        print(f"  ✓ {name} → {thread}")

if results["errors"]:
    print("\nErrors:")
    for name, error in results["errors"]:
        print(f"  ✗ {name}: {error}")
