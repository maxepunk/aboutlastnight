#!/usr/bin/env python3
"""Quick script to check all memory tokens and their thread assignments."""

import requests
import time
import urllib3

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
    items = prop_data.get(prop_type, [])
    if not items:
        return ""
    text_parts = []
    for item in items:
        if "plain_text" in item:
            text_parts.append(item["plain_text"])
    return " ".join(text_parts)

# Query all elements
url = f"https://api.notion.com/v1/databases/{ELEMENTS_DB_ID}/query"
all_elements = []
has_more = True
start_cursor = None

print("Querying all memory tokens...")
while has_more:
    payload = {"page_size": 100}
    if start_cursor:
        payload["start_cursor"] = start_cursor
    
    response = requests.post(url, headers=HEADERS, json=payload, verify=False)
    time.sleep(0.5)
    
    if response.status_code != 200:
        break
    
    data = response.json()
    all_elements.extend(data.get("results", []))
    has_more = data.get("has_more", False)
    start_cursor = data.get("next_cursor")

# Filter to memory tokens and analyze
tokens_with_threads = []
tokens_without_threads = []

for elem in all_elements:
    props = elem.get("properties", {})
    
    # Check if memory token
    basic_type = props.get("Basic Type", {}).get("select")
    if not basic_type:
        continue
    
    type_name = basic_type.get("name", "")
    if "Memory Token" not in type_name:
        continue
    
    # Get token info
    name = safe_get_text(props.get("Name", {}), "title")
    
    # Get owner
    owner_relation = props.get("Owner", {}).get("relation", [])
    owner_id = owner_relation[0]["id"] if owner_relation else None
    
    # Get threads
    threads = props.get("Narrative Threads", {}).get("multi_select", [])
    thread_names = [t.get("name", "") for t in threads]
    
    token_data = {
        "name": name,
        "type": type_name,
        "owner_id": owner_id,
        "threads": thread_names
    }
    
    if thread_names:
        tokens_with_threads.append(token_data)
    else:
        tokens_without_threads.append(token_data)

# Get owner names for tokens without threads
print("Getting owner names for unthreaded tokens...")
for token in tokens_without_threads:
    if token["owner_id"]:
        owner_url = f"https://api.notion.com/v1/pages/{token['owner_id']}"
        response = requests.get(owner_url, headers=HEADERS, verify=False)
        time.sleep(0.35)
        
        if response.status_code == 200:
            owner_props = response.json().get("properties", {})
            owner_name = safe_get_text(owner_props.get("Name", {}), "title")
            token["owner_name"] = owner_name
        else:
            token["owner_name"] = "Unknown"
    else:
        token["owner_name"] = "No owner"

# Get owner names for tokens with threads
print("Getting owner names for threaded tokens...")
for token in tokens_with_threads:
    if token["owner_id"]:
        owner_url = f"https://api.notion.com/v1/pages/{token['owner_id']}"
        response = requests.get(owner_url, headers=HEADERS, verify=False)
        time.sleep(0.35)
        
        if response.status_code == 200:
            owner_props = response.json().get("properties", {})
            owner_name = safe_get_text(owner_props.get("Name", {}), "title")
            token["owner_name"] = owner_name
        else:
            token["owner_name"] = "Unknown"
    else:
        token["owner_name"] = "No owner"

# Output results
print("\n" + "=" * 80)
print("MEMORY TOKEN THREAD ASSIGNMENT ANALYSIS")
print("=" * 80)
print()

total = len(tokens_with_threads) + len(tokens_without_threads)
print(f"Total Memory Tokens: {total}")
print(f"Tokens WITH thread assignment: {len(tokens_with_threads)} ({len(tokens_with_threads)/total*100:.1f}%)")
print(f"Tokens WITHOUT thread assignment: {len(tokens_without_threads)} ({len(tokens_without_threads)/total*100:.1f}%)")
print()

print("=" * 80)
print("TOKENS WITH THREAD ASSIGNMENTS")
print("=" * 80)
print()
for token in sorted(tokens_with_threads, key=lambda x: x["owner_name"]):
    print(f"{token['owner_name']}: {token['name']}")
    print(f"  Threads: {', '.join(token['threads'])}")
    print()

print("=" * 80)
print("TOKENS WITHOUT THREAD ASSIGNMENTS (WIRING GAP!)")
print("=" * 80)
print()

# Group by owner
by_owner = {}
for token in tokens_without_threads:
    owner = token["owner_name"]
    if owner not in by_owner:
        by_owner[owner] = []
    by_owner[owner].append(token)

for owner in sorted(by_owner.keys()):
    tokens = by_owner[owner]
    print(f"{owner}: {len(tokens)} token(s) without threads")
    for token in tokens:
        print(f"  - {token['name']}")
    print()

