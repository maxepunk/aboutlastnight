#!/usr/bin/env python3
"""
Bird's Eye Analysis - Top-down view of game data across all databases.
Provides structured data for agent interpretation, not prescriptive recommendations.
"""

import requests
import time
from collections import defaultdict
import urllib3

# Suppress SSL warnings for cleaner output
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API Configuration
NOTION_TOKEN = "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"
NOTION_VERSION = "2022-06-28"
ELEMENTS_DB_ID = "18c2f33d-583f-8020-91bc-d84c7dd94306"
CHARACTERS_DB_ID = "18c2f33d-583f-8060-a6ab-de32ff06bca2"
TIMELINE_DB_ID = "1b52f33d-583f-80de-ae5a-d20020c120dd"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
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

def get_character_name_map():
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

def analyze_elements():
    """Analyze all elements with thread and character breakdown."""
    print("Querying all elements...")
    elements = query_all(ELEMENTS_DB_ID)
    print(f"Retrieved {len(elements)} elements\n")
    
    # Build character map
    char_map = get_character_name_map()
    
    # Aggregate data
    type_counts = defaultdict(int)
    thread_elements = defaultdict(list)
    unthreaded = []
    memory_tokens = []
    
    for elem in elements:
        props = elem.get("properties", {})
        
        # Basic type
        basic_type = props.get("Basic Type", {}).get("select", {})
        type_name = basic_type.get("name", "Unknown") if basic_type else "Unknown"
        type_counts[type_name] += 1
        
        # Get owner
        owner_relation = props.get("Owner", {}).get("relation", [])
        owner_id = owner_relation[0]["id"] if owner_relation else None
        owner_info = char_map.get(owner_id, {"name": "Unknown", "cluster": "Unknown"})
        
        # Element name
        elem_name = safe_get_text(props.get("Name", {}), "title")
        
        elem_data = {
            "name": elem_name,
            "type": type_name,
            "owner": owner_info["name"],
            "cluster": owner_info["cluster"],
            "is_token": "Memory Token" in type_name
        }
        
        # Narrative threads
        threads = props.get("Narrative Threads", {}).get("multi_select", [])
        if threads:
            for thread in threads:
                thread_elements[thread["name"]].append(elem_data)
        else:
            unthreaded.append(elem_data)
        
        # Memory token details
        if "Memory Token" in type_name:
            memory_tokens.append(elem_data)
    
    return {
        "total": len(elements),
        "type_counts": dict(type_counts),
        "thread_elements": dict(thread_elements),
        "unthreaded": unthreaded,
        "memory_tokens": memory_tokens
    }

def analyze_characters():
    """Analyze all characters with element/event counts."""
    characters = query_all(CHARACTERS_DB_ID)
    
    by_cluster = defaultdict(list)
    
    for char in characters:
        props = char.get("properties", {})
        
        name = safe_get_text(props.get("Name", {}), "title")
        if not name:
            continue
        
        # Determine cluster
        cluster = "NPC"
        if name.startswith("E -"):
            cluster = "JUSTICE"
        elif name.startswith("R -"):
            cluster = "RECOVERY"
        elif name.startswith("S -"):
            cluster = "PRAGMATIC"
        elif name.startswith("P -"):
            cluster = "COVERUP"
        
        # Get tier
        tier = props.get("Tier", {}).get("select", {})
        tier_name = tier.get("name", "Unknown") if tier else "Unknown"
        
        # Counts
        owned = len(props.get("Owned Elements", {}).get("relation", []))
        events = len(props.get("Events", {}).get("relation", []))
        
        by_cluster[cluster].append({
            "name": name,
            "tier": tier_name,
            "elements": owned,
            "events": events
        })
    
    return dict(by_cluster)

def print_thread_breakdown(thread_name, elements):
    """Print detailed breakdown of a thread's composition."""
    print(f"\n{thread_name}: {len(elements)} elements")
    
    # Cluster distribution
    cluster_counts = defaultdict(int)
    for elem in elements:
        cluster_counts[elem["cluster"]] += 1
    
    print(f"  Clusters: ", end="")
    print(", ".join([f"{k}({v})" for k, v in sorted(cluster_counts.items())]))
    
    # Token vs non-token
    tokens = sum(1 for e in elements if e["is_token"])
    non_tokens = len(elements) - tokens
    print(f"  Content: {tokens} tokens, {non_tokens} non-tokens")
    
    # Top owners (characters with most elements)
    owner_counts = defaultdict(int)
    for elem in elements:
        owner_counts[elem["owner"]] += 1
    
    top_owners = sorted(owner_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    print(f"  Top owners: ", end="")
    print(", ".join([f"{name}({count})" for name, count in top_owners]))

def main():
    print("=" * 80)
    print("ABOUT LAST NIGHT - BIRD'S EYE ANALYSIS")
    print("=" * 80)
    print("\nTop-down view of game data for agent interpretation\n")
    
    # ===== ELEMENTS =====
    print("=" * 80)
    print("ELEMENTS OVERVIEW")
    print("=" * 80)
    
    elem_data = analyze_elements()
    
    print(f"\nTotal Elements: {elem_data['total']}")
    
    print(f"\nElement Types:")
    for type_name, count in sorted(elem_data['type_counts'].items(), key=lambda x: x[1], reverse=True):
        print(f"  {type_name}: {count}")
    
    # Thread coverage
    threaded = sum(len(elems) for elems in elem_data['thread_elements'].values())
    unthreaded_count = len(elem_data['unthreaded'])
    coverage_pct = (threaded / elem_data['total'] * 100) if elem_data['total'] > 0 else 0
    
    print(f"\nThread Assignment:")
    print(f"  Assigned: {threaded}/{elem_data['total']} ({coverage_pct:.1f}%)")
    print(f"  Unassigned: {unthreaded_count}/{elem_data['total']} ({100-coverage_pct:.1f}%)")
    
    # ===== THREAD DETAILS =====
    print("\n" + "=" * 80)
    print("NARRATIVE THREADS - DETAILED COMPOSITION")
    print("=" * 80)
    
    # Sort threads by element count
    sorted_threads = sorted(elem_data['thread_elements'].items(), 
                           key=lambda x: len(x[1]), 
                           reverse=True)
    
    for thread_name, elements in sorted_threads:
        print_thread_breakdown(thread_name, elements)
    
    # ===== MEMORY TOKENS =====
    print("\n" + "=" * 80)
    print("MEMORY TOKENS SUMMARY")
    print("=" * 80)
    
    tokens = elem_data['memory_tokens']
    print(f"\nTotal Memory Tokens: {len(tokens)}")
    
    # By cluster
    token_clusters = defaultdict(int)
    for token in tokens:
        token_clusters[token["cluster"]] += 1
    
    print(f"\nCluster Distribution:")
    for cluster in ["JUSTICE", "RECOVERY", "PRAGMATIC", "COVERUP"]:
        count = token_clusters.get(cluster, 0)
        print(f"  {cluster}: {count} tokens")
    
    # ===== CHARACTERS =====
    print("\n" + "=" * 80)
    print("CHARACTERS BY GOAL CLUSTER")
    print("=" * 80)
    
    char_data = analyze_characters()
    
    for cluster in ["JUSTICE", "RECOVERY", "PRAGMATIC", "COVERUP", "NPC"]:
        if cluster not in char_data:
            continue
        
        chars = char_data[cluster]
        print(f"\n{cluster} ({len(chars)} characters):")
        
        # Sort by element count
        for char in sorted(chars, key=lambda x: x['elements'], reverse=True):
            tier_marker = f"[{char['tier']}]" if char['tier'] != "Unknown" else ""
            print(f"  {char['name']:30} {tier_marker:12} {char['elements']:2} elements, {char['events']:2} events")
    
    # ===== TIMELINE =====
    print("\n" + "=" * 80)
    print("TIMELINE OVERVIEW")
    print("=" * 80)
    
    timeline = query_all(TIMELINE_DB_ID)
    print(f"\nTotal Backstory Events: {len(timeline)}")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
