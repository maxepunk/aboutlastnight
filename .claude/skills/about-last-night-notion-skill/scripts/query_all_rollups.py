#!/usr/bin/env python3
"""
Query all 4 databases to identify ALL rollup properties and their aggregation logic.
Get firsthand understanding of complete schema including rollups.
"""

import requests
import urllib3
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"

DATABASE_IDS = {
    "Characters": "18c2f33d-583f-8060-a6ab-de32ff06bca2",
    "Elements": "18c2f33d-583f-8020-91bc-d84c7dd94306",
    "Timeline": "1b52f33d-583f-80de-ae5a-d20020c120dd",
    "Puzzles": "1b62f33d-583f-80cc-87cf-d7d6c4b0b265"
}

headers = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

def get_database_schema(db_id, db_name):
    """Retrieve database schema and identify rollup properties."""
    url = f"https://api.notion.com/v1/databases/{db_id}"
    response = requests.get(url, headers=headers, verify=False)
    
    if response.status_code != 200:
        print(f"Error retrieving {db_name}: {response.status_code}")
        return None
    
    db = response.json()
    properties = db.get("properties", {})
    
    print(f"\n{'='*80}")
    print(f"{db_name.upper()} DATABASE - ALL ROLLUP PROPERTIES")
    print(f"{'='*80}\n")
    
    rollup_count = 0
    for prop_name, prop_data in properties.items():
        if prop_data.get("type") == "rollup":
            rollup_count += 1
            rollup_config = prop_data.get("rollup", {})
            
            print(f"Rollup #{rollup_count}: {prop_name}")
            print(f"  Relation Property: {rollup_config.get('relation_property_name')}")
            print(f"  Rollup Property: {rollup_config.get('rollup_property_name')}")
            print(f"  Function: {rollup_config.get('function')}")
            
            # Determine target database from relation
            relation_id = rollup_config.get('relation_property_id')
            if relation_id and relation_id in properties:
                relation_config = properties[relation_id].get('relation', {})
                target_db = relation_config.get('database_id')
                # Find which database this points to
                for db_name_target, db_id_target in DATABASE_IDS.items():
                    if db_id_target == target_db:
                        print(f"  Target Database: {db_name_target}")
                        break
            print()
    
    if rollup_count == 0:
        print("  [No rollup properties found]\n")
    
    print(f"Total Rollups: {rollup_count}\n")
    return rollup_count

# Query all databases
for db_name, db_id in DATABASE_IDS.items():
    get_database_schema(db_id, db_name)

print("\n" + "="*80)
print("SCHEMA QUERY COMPLETE")
print("="*80)
