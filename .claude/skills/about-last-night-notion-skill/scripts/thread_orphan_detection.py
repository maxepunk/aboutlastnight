#!/usr/bin/env python3
"""
Thread Orphan Detection - Multi-Factor Analysis
Identifies elements with rich narrative content lacking thread assignment.
Uses 7-layer confidence scoring for agent interpretation.

Output designed for agent-in-the-loop: provides structured data, agent interprets.
"""

import requests
import re
import time
from collections import defaultdict
from typing import Dict, List, Set, Tuple
import urllib3

# Suppress SSL warnings
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

# Active narrative threads
ACTIVE_THREADS = [
    "Funding & Espionage",
    "Marriage Troubles",
    "Memory Drug",
    "Underground Parties",
    "Advanced Technology"
]

# Layer 2: SF_MemoryType → Thread Affinity
SF_TYPE_AFFINITIES = {
    "Technical": [
        ("Advanced Technology", 2.0),
        ("Funding & Espionage", 1.0),
    ],
    "Business": [
        ("Funding & Espionage", 2.0),
        ("Advanced Technology", 0.5),
    ],
    "Personal": [
        ("Marriage Troubles", 1.5),
        ("Underground Parties", 1.0),
        ("Memory Drug", 1.0),
    ]
}

# Layer 3: Owner Cluster → Thread Affinity  
CLUSTER_AFFINITIES = {
    "JUSTICE": [
        ("Funding & Espionage", 1.5),
        ("Memory Drug", 1.0),
    ],
    "RECOVERY": [
        ("Memory Drug", 1.5),
        ("Underground Parties", 0.5),
    ],
    "PRAGMATIC": [
        ("Funding & Espionage", 1.5),
    ],
    "COVERUP": [
        ("Marriage Troubles", 1.5),
        ("Funding & Espionage", 1.0),
        ("Advanced Technology", 1.0),
    ]
}

# Layer 6: Thread-Specific Keywords (weighted lower)
THREAD_KEYWORDS = {
    "Advanced Technology": [
        "neural", "AI", "algorithm", "technical", "system", "code", "software",
        "data", "interface", "technology", "computing", "processor"
    ],
    "Funding & Espionage": [
        "investor", "funding", "equity", "stock", "venture", "capital", "deal",
        "partnership", "acquisition", "spy", "corporate", "business", "financial"
    ],
    "Marriage Troubles": [
        "marriage", "divorce", "affair", "spouse", "relationship", "trust",
        "betrayal", "infidelity", "wedding", "separation"
    ],
    "Memory Drug": [
        "memory", "extraction", "drug", "chemical", "dose", "neural",
        "consciousness", "mind", "recall", "forget", "remember"
    ],
    "Underground Parties": [
        "party", "parties", "underground", "venue", "event", "gathering",
        "social", "celebration", "club", "crowd"
    ]
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

def get_timeline_event_map():
    """Build map of timeline event IDs to character lists."""
    timeline_events = query_all(TIMELINE_DB_ID)
    
    event_map = {}
    for event in timeline_events:
        event_id = event["id"]
        chars_involved = event["properties"].get("Characters Involved", {}).get("relation", [])
        char_ids = [rel["id"] for rel in chars_involved]
        event_map[event_id] = char_ids
    
    return event_map

def extract_sf_memorytype(desc_text: str) -> str:
    """Extract SF_MemoryType from memory token description."""
    if "SF_MemoryType: Technical" in desc_text:
        return "Technical"
    elif "SF_MemoryType: Business" in desc_text:
        return "Business"
    elif "SF_MemoryType: Personal" in desc_text:
        return "Personal"
    return None

def count_keyword_matches(text: str, keywords: List[str]) -> int:
    """Count how many thread keywords appear in text."""
    if not text:
        return 0
    
    text_lower = text.lower()
    count = 0
    for keyword in keywords:
        if keyword.lower() in text_lower:
            count += 1
    return count

def calculate_thread_confidence(element_data: Dict, thread: str, 
                               timeline_sibling_threads: Dict[str, List[str]],
                               char_map: Dict) -> Tuple[float, List[str]]:
    """Calculate confidence score that element belongs to this thread."""
    score = 0.0
    factors = []
    
    # Layer 1: Element Type Context
    elem_type = element_data["type"]
    if "Memory Token" in elem_type:
        # Tokens REQUIRE threads
        type_bonus = 1.0
        factors.append(f"Memory token (requires thread)")
    elif elem_type in ["Prop", "Document"]:
        type_bonus = 0.5
        factors.append(f"{elem_type} (narrative content)")
    elif elem_type in ["Container", "Physical"]:
        # Containers often legitimately unthreaded
        type_bonus = -0.5
        factors.append(f"{elem_type} (often mechanical)")
    else:
        type_bonus = 0.0
    
    # Don't score containers/physical negatively overall
    if type_bonus >= 0:
        score += type_bonus
    
    # Layer 2: SF_MemoryType Alignment
    sf_type = element_data.get("sf_memorytype")
    if sf_type and sf_type in SF_TYPE_AFFINITIES:
        for thread_name, affinity_score in SF_TYPE_AFFINITIES[sf_type]:
            if thread_name == thread:
                score += affinity_score
                factors.append(f"SF_MemoryType: {sf_type} → {thread} (+{affinity_score})")
                break
    
    # Layer 3: Owner Cluster Alignment
    owner_cluster = element_data.get("owner_cluster")
    if owner_cluster and owner_cluster in CLUSTER_AFFINITIES:
        for thread_name, affinity_score in CLUSTER_AFFINITIES[owner_cluster]:
            if thread_name == thread:
                score += affinity_score
                factors.append(f"Owner cluster: {owner_cluster} → {thread} (+{affinity_score})")
                break
    
    # Layer 4: Timeline Event Sibling Clustering
    timeline_event_id = element_data.get("timeline_event_id")
    if timeline_event_id and timeline_event_id in timeline_sibling_threads:
        sibling_threads = timeline_sibling_threads[timeline_event_id]
        if sibling_threads:
            thread_count = sibling_threads.count(thread)
            total_siblings = len(sibling_threads)
            if total_siblings > 0:
                percentage = thread_count / total_siblings
                if percentage >= 0.8:  # 80%+ siblings have this thread
                    bonus = 1.5
                    score += bonus
                    factors.append(f"Timeline siblings: {thread_count}/{total_siblings} have {thread} (+{bonus})")
    
    # Layer 5: Associated Characters Network
    associated_count = element_data.get("associated_count", 0)
    if associated_count >= 3:
        # Multiple associated characters suggests narrative richness
        bonus = 0.5
        score += bonus
        factors.append(f"Multiple associated characters ({associated_count}) (+{bonus})")
    
    # Layer 6: Keyword Semantic Analysis (weighted lower)
    keywords = THREAD_KEYWORDS.get(thread, [])
    keyword_matches = count_keyword_matches(element_data.get("desc_text", ""), keywords)
    if keyword_matches > 0:
        # Cap at 1.0 even with many matches (keywords weighted lower)
        keyword_bonus = min(keyword_matches * 0.25, 1.0)
        score += keyword_bonus
        factors.append(f"Keywords: {keyword_matches} matches (+{keyword_bonus:.2f})")
    
    return score, factors

def analyze_orphan_elements():
    """Analyze all unthreaded elements for thread assignment candidates."""
    print("Querying all elements...")
    elements = query_all(ELEMENTS_DB_ID)
    print(f"Retrieved {len(elements)} elements\n")
    
    print("Building character map...")
    char_map = get_character_map()
    
    print("Building timeline event map...")
    event_map = get_timeline_event_map()
    
    # First pass: collect sibling thread data
    print("Analyzing timeline event clustering...\n")
    timeline_sibling_threads = defaultdict(list)
    for elem in elements:
        props = elem.get("properties", {})
        threads = props.get("Narrative Threads", {}).get("multi_select", [])
        timeline_event = props.get("Timeline Event", {}).get("relation", [])
        
        if threads and timeline_event:
            event_id = timeline_event[0]["id"]
            for thread in threads:
                timeline_sibling_threads[event_id].append(thread["name"])
    
    # Second pass: analyze orphans
    orphan_candidates = defaultdict(list)
    unassigned_count = 0
    total_count = len(elements)
    
    for elem in elements:
        props = elem.get("properties", {})
        
        # Check if element has threads assigned
        threads = props.get("Narrative Threads", {}).get("multi_select", [])
        if threads:
            continue  # Not an orphan
        
        unassigned_count += 1
        
        # Extract element data
        elem_name = safe_get_text(props.get("Name", {}), "title")
        basic_type = props.get("Basic Type", {}).get("select", {})
        type_name = basic_type.get("name", "Unknown") if basic_type else "Unknown"
        desc_text = safe_get_text(props.get("Description/Text", {}))
        
        # Owner info
        owner_relation = props.get("Owner", {}).get("relation", [])
        owner_id = owner_relation[0]["id"] if owner_relation else None
        owner_info = char_map.get(owner_id, {"name": "Unknown", "cluster": "Unknown"})
        
        # Timeline event
        timeline_event = props.get("Timeline Event", {}).get("relation", [])
        timeline_event_id = timeline_event[0]["id"] if timeline_event else None
        
        # Associated characters count
        associated = props.get("Associated Characters", {}).get("relation", [])
        associated_count = len(associated)
        
        # SF_MemoryType for tokens
        sf_memorytype = None
        if "Memory Token" in type_name:
            sf_memorytype = extract_sf_memorytype(desc_text)
        
        element_data = {
            "name": elem_name,
            "type": type_name,
            "owner": owner_info["name"],
            "owner_cluster": owner_info["cluster"],
            "timeline_event_id": timeline_event_id,
            "associated_count": associated_count,
            "sf_memorytype": sf_memorytype,
            "desc_text": desc_text
        }
        
        # Calculate confidence for each thread
        for thread in ACTIVE_THREADS:
            confidence, factors = calculate_thread_confidence(
                element_data, thread, timeline_sibling_threads, char_map
            )
            
            if confidence >= 1.0:  # Minimum threshold
                orphan_candidates[thread].append({
                    "element": element_data,
                    "confidence": confidence,
                    "factors": factors
                })
    
    return orphan_candidates, unassigned_count, total_count

def print_orphan_report(orphan_candidates: Dict, unassigned_count: int, total_count: int):
    """Print formatted orphan report for agent interpretation."""
    print("=" * 80)
    print("THREAD ORPHAN DETECTION - MULTI-FACTOR ANALYSIS")
    print("=" * 80)
    print()
    print(f"Total Elements: {total_count}")
    
    if total_count == 0:
        print("\n⚠️  No elements retrieved. Check API connection.")
        return
    
    print(f"Unassigned Elements: {unassigned_count} ({unassigned_count/total_count*100:.1f}%)")
    print(f"Assigned Elements: {total_count - unassigned_count} ({(total_count - unassigned_count)/total_count*100:.1f}%)")
    print()
    
    # Print per-thread reports
    for thread in ACTIVE_THREADS:
        candidates = orphan_candidates.get(thread, [])
        if not candidates:
            continue
        
        candidates_sorted = sorted(candidates, key=lambda x: x["confidence"], reverse=True)
        
        high = [c for c in candidates_sorted if c["confidence"] >= 4.0]
        medium = [c for c in candidates_sorted if 2.5 <= c["confidence"] < 4.0]
        low = [c for c in candidates_sorted if 1.0 <= c["confidence"] < 2.5]
        
        print("=" * 80)
        print(f"{thread.upper()} THREAD - ORPHAN CANDIDATES")
        print("=" * 80)
        print()
        print(f"HIGH Confidence (≥4.0): {len(high)} elements")
        print(f"MEDIUM Confidence (2.5-3.9): {len(medium)} elements")
        print(f"LOW Confidence (1.0-2.4): {len(low)} elements")
        print()
        
        # Print HIGH confidence orphans
        if high:
            print(f"--- HIGH CONFIDENCE ORPHANS ---")
            print()
            for i, candidate in enumerate(high, 1):
                elem = candidate["element"]
                print(f"{i}. Element: {elem['name']}")
                print(f"   Type: {elem['type']}")
                print(f"   Owner: {elem['owner']} ({elem['owner_cluster']})")
                print(f"   Confidence: {candidate['confidence']:.1f}")
                print(f"   Factors:")
                for factor in candidate["factors"]:
                    print(f"     - {factor}")
                
                if elem["sf_memorytype"]:
                    print(f"   SF_MemoryType: {elem['sf_memorytype']}")
                if elem["associated_count"] > 0:
                    print(f"   Associated Characters: {elem['associated_count']}")
                
                # Context snippet
                if elem["desc_text"]:
                    snippet = elem["desc_text"][:150]
                    if len(elem["desc_text"]) > 150:
                        snippet += "..."
                    print(f"   Context: {snippet}")
                print()
        
        # Print MEDIUM confidence orphans (full details - need review)
        if medium:
            print(f"--- MEDIUM CONFIDENCE ORPHANS ---")
            print()
            for i, candidate in enumerate(medium, 1):
                elem = candidate["element"]
                print(f"{i}. Element: {elem['name']}")
                print(f"   Type: {elem['type']}")
                print(f"   Owner: {elem['owner']} ({elem['owner_cluster']})")
                print(f"   Confidence: {candidate['confidence']:.1f}")
                print(f"   Factors:")
                for factor in candidate["factors"]:
                    print(f"     - {factor}")
                
                if elem["sf_memorytype"]:
                    print(f"   SF_MemoryType: {elem['sf_memorytype']}")
                if elem["associated_count"] > 0:
                    print(f"   Associated Characters: {elem['associated_count']}")
                print()
        
        # Print LOW confidence summary with progressive disclosure
        if low:
            print(f"--- LOW CONFIDENCE ORPHANS ---")
            print()
            print(f"{len(low)} elements with scores 1.0-2.4 (likely keyword noise)")
            print()
            
            # Show top 3 candidates for context
            if len(low) > 0:
                print("Top candidates (if investigation needed):")
                for i, candidate in enumerate(low[:3], 1):
                    elem = candidate["element"]
                    print(f"  {i}. \"{elem['name']}\" ({elem['type']}, Owner: {elem['owner']}, Score: {candidate['confidence']:.1f})")
                print()
            
            print("Investigation workflow:")
            print("  - For character-specific investigation: character_wiring_audit.py \"<character>\"")
            print("  - For element coverage analysis: character_element_coverage.py \"<character>\"")
            print("  - Most LOW confidence scores are keyword noise, not true thread matches")
            print()

def main():
    """Main execution."""
    orphan_candidates, unassigned_count, total_count = analyze_orphan_elements()
    print_orphan_report(orphan_candidates, unassigned_count, total_count)
    
    print("=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)
    print()
    print("This data is for agent interpretation.")
    print("Agent should synthesize findings and present actionable insights.")

if __name__ == "__main__":
    main()
