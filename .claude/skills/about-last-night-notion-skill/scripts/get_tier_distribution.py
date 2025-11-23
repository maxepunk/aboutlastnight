#!/usr/bin/env python3
"""
Get actual tier distribution from Characters database.
"""

import requests
import urllib3
import time

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"
TIMELINE_DB_ID = "1b52f33d-583f-80de-ae5a-d20020c120dd"

headers = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

# Get Timeline rollups
print("\n" + "="*80)
print("TIMELINE DATABASE - ROLLUP PROPERTIES")
print("="*80 + "\n")

url = f"https://api.notion.com/v1/databases/{TIMELINE_DB_ID}"
response = requests.get(url, headers=headers, verify=False)

if response.status_code == 200:
    db = response.json()
    properties = db.get("properties", {})
    rollup_count = 0
    
    for prop_name, prop_data in properties.items():
        if prop_data.get("type") == "rollup":
            rollup_count += 1
            rollup_config = prop_data.get("rollup", {})
            print(f"Rollup #{rollup_count}: {prop_name}")
            print(f"  Relation Property: {rollup_config.get('relation_property_name')}")
            print(f"  Rollup Property: {rollup_config.get('rollup_property_name')}")
            print(f"  Function: {rollup_config.get('function')}\n")
    
    if rollup_count == 0:
        print("  [No rollup properties found]\n")
    print(f"Total Rollups: {rollup_count}\n")
else:
    print(f"Error: {response.status_code}\n")

time.sleep(0.5)

# Get character tier distribution
print("="*80)
print("CHARACTER TIER DISTRIBUTION")
print("="*80 + "\n")

url = f"https://api.notion.com/v1/databases/{CHARACTERS_DB_ID}/query"
response = requests.post(url, headers=headers, json={}, verify=False)

if response.status_code == 200:
    data = response.json()
    
    tier_counts = {"Core": 0, "Secondary": 0, "Tertiary": 0, "Unknown": 0}
    characters_by_tier = {"Core": [], "Secondary": [], "Tertiary": [], "Unknown": []}
    
    for char in data.get("results", []):
        # Get name
        name_prop = char.get("properties", {}).get("Name", {})
        name = "Unknown"
        if name_prop.get("title"):
            name = name_prop["title"][0]["text"]["content"]
        
        # Get tier
        tier_prop = char.get("properties", {}).get("Tier", {})
        tier = tier_prop.get("select", {}).get("name", "Unknown") if tier_prop.get("select") else "Unknown"
        
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        characters_by_tier[tier].append(name)
    
    print("Tier Distribution:")
    for tier, count in tier_counts.items():
        if count > 0:
            print(f"  {tier}: {count} characters")
    
    print(f"\nTotal Characters: {sum(tier_counts.values())}")
    
    print("\n" + "-"*80)
    print("CHARACTER LISTS BY TIER")
    print("-"*80 + "\n")
    
    for tier in ["Core", "Secondary", "Tertiary"]:
        if characters_by_tier[tier]:
            print(f"{tier} ({len(characters_by_tier[tier])}):")
            for name in sorted(characters_by_tier[tier]):
                print(f"  - {name}")
            print()
else:
    print(f"Error: {response.status_code}")

