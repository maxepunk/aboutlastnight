#!/usr/bin/env python3
"""
Thread Detail Analysis - View all elements assigned to specific thread(s).

Usage: 
  python thread_detail_analysis.py "Thread Name"
  python thread_detail_analysis.py "Thread 1,Thread 2,Thread 3"

Examples:
  python thread_detail_analysis.py "Funding & Espionage"
  python thread_detail_analysis.py "Class Conflicts,Investigative Journalism"

Options:
  --tokens-only    Show only memory tokens
  --export-csv     Export results to CSV file

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
from collections import defaultdict

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

def safe_get_text(prop_data, prop_type="rich_text"):
    """Extract text from rich_text or title properties."""
    items = prop_data.get(prop_type, [])
    if not items:
        return ""
    text_parts = []
    for item in items:
        if "plain_text" in item:
            text_parts.append(item["plain_text"])
    return " ".join(text_parts)

def safe_get_select(prop_data):
    """Extract select field value."""
    select_obj = prop_data.get("select")
    return select_obj.get("name") if select_obj else ""

def safe_get_multi_select(prop_data):
    """Extract multi_select field values."""
    items = prop_data.get("multi_select", [])
    return [item.get("name") for item in items if item.get("name")]

def safe_get_relation(prop_data):
    """Extract relation IDs."""
    items = prop_data.get("relation", [])
    return [item["id"] for item in items] if items else []

def query_all(db_id):
    """Query all records from database with pagination."""
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

def get_character_map():
    """Build map of character IDs to names and clusters."""
    characters = query_all(CHARACTERS_DB_ID)
    
    char_map = {}
    for char in characters:
        char_id = char["id"]
        name = safe_get_text(char["properties"].get("Name", {}), "title")
        
        # Extract cluster from prefix
        cluster = "Unknown"
        if name.startswith("E -"):
            cluster = "JUSTICE"
        elif name.startswith("R -"):
            cluster = "RECOVERY"
        elif name.startswith("S -"):
            cluster = "PRAGMATIC"
        elif name.startswith("P -"):
            cluster = "COVERUP"
        
        char_map[char_id] = {
            "name": name,
            "cluster": cluster
        }
    
    return char_map

def parse_args():
    """Parse command line arguments."""
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    threads = sys.argv[1].split(",")
    threads = [t.strip() for t in threads]
    
    tokens_only = "--tokens-only" in sys.argv
    export_csv = "--export-csv" in sys.argv
    
    return threads, tokens_only, export_csv

def main():
    threads, tokens_only, export_csv = parse_args()
    
    print("=" * 80)
    print("THREAD DETAIL ANALYSIS")
    print("=" * 80)
    print(f"\nAnalyzing threads: {', '.join(threads)}")
    if tokens_only:
        print("Filter: Memory tokens only")
    print()
    
    # Build character map
    char_map = get_character_map()
    
    # Query all elements
    print("Querying elements...")
    elements = query_all(ELEMENTS_DB_ID)
    print(f"Retrieved {len(elements)} elements\n")
    
    # Organize elements by thread
    thread_elements = defaultdict(list)
    token_types = ["Memory Token Image", "Memory Token Audio", "Memory Token Video"]
    
    for elem in elements:
        props = elem.get("properties", {})
        
        # Get element details
        name = safe_get_text(props.get("Name", {}), "title")
        basic_type = safe_get_select(props.get("Basic Type", {}))
        description = safe_get_text(props.get("Description/Text", {}))
        
        # Get threads
        elem_threads = safe_get_multi_select(props.get("Narrative Threads", {}))
        
        # Get owner
        owner_ids = safe_get_relation(props.get("Owner", {}))
        owner_id = owner_ids[0] if owner_ids else None
        owner_info = char_map.get(owner_id, {"name": "No Owner", "cluster": "Unknown"})
        
        # Get timeline events
        timeline_ids = safe_get_relation(props.get("Timeline Event", {}))
        
        # Filter by tokens if requested
        if tokens_only and basic_type not in token_types:
            continue
        
        # Check if element belongs to any target thread
        for thread in threads:
            if thread in elem_threads:
                thread_elements[thread].append({
                    "name": name,
                    "type": basic_type,
                    "owner": owner_info["name"],
                    "cluster": owner_info["cluster"],
                    "description": description,
                    "all_threads": elem_threads,
                    "timeline_count": len(timeline_ids)
                })
    
    # Display results for each thread
    all_export_data = []
    
    for thread in threads:
        elements_list = thread_elements.get(thread, [])
        
        print("\n" + "=" * 80)
        print(f"THREAD: {thread}")
        print("=" * 80)
        print(f"\nTotal elements: {len(elements_list)}")
        
        if not elements_list:
            print("(No elements found)")
            continue
        
        # Group by type
        by_type = defaultdict(list)
        for elem in elements_list:
            by_type[elem["type"]].append(elem)
        
        # Display grouped by type
        for elem_type in sorted(by_type.keys()):
            type_elements = by_type[elem_type]
            print(f"\n{elem_type}: {len(type_elements)} elements")
            print("-" * 80)
            
            for i, elem in enumerate(sorted(type_elements, key=lambda x: x["name"]), 1):
                print(f"\n{i}. {elem['name']}")
                print(f"   Owner: {elem['owner']} ({elem['cluster']})")
                
                # Show other threads if multi-assigned
                if len(elem['all_threads']) > 1:
                    other_threads = [t for t in elem['all_threads'] if t != thread]
                    print(f"   Also in: {', '.join(other_threads)}")
                
                print(f"   Timeline events: {elem['timeline_count']}")
                
                # Show description preview
                if elem['description']:
                    preview = elem['description'][:150]
                    if len(elem['description']) > 150:
                        preview += "..."
                    print(f"   Description: {preview}")
                
                # Add to export data
                all_export_data.append({
                    "thread": thread,
                    "name": elem["name"],
                    "type": elem["type"],
                    "owner": elem["owner"],
                    "cluster": elem["cluster"],
                    "timeline_events": elem["timeline_count"],
                    "other_threads": ", ".join([t for t in elem['all_threads'] if t != thread]),
                    "description": elem["description"]
                })
    
    # Export to CSV if requested
    if export_csv and all_export_data:
        filename = "thread_detail_export.csv"
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "thread", "name", "type", "owner", "cluster", 
                "timeline_events", "other_threads", "description"
            ])
            writer.writeheader()
            writer.writerows(all_export_data)
        print(f"\n\n✓ Exported to {filename}")
    
    print("\n\n" + "=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
