# Orphan Detection System - Complete Specification

## Purpose
Identify elements with rich narrative content that lack proper database relationship wiring (threads, associated characters, timeline events). Distinguish between "wiring gaps" (content exists, needs connection) vs "content gaps" (truly missing content).

## Why Multi-Factor Analysis, Not Keyword Search

**Problem with naive keyword search:**
- Finds 26+ "tech" mentions but can't prioritize
- Misses semantic patterns (SF_MemoryType alignment, character motivations)
- Doesn't understand element purposes (containers are mechanical, not narrative)
- Can't detect relationship orphans (character mentions without relations)
- No confidence scoring (all matches treated equally)

## Detection Layers

### Layer 1: Element Type Context
**Not all element types need threads equally:**

```python
def get_thread_expectation(basic_type):
    """Determine if element type typically needs thread assignment"""
    
    # High priority - player-facing narrative
    if "Memory Token" in basic_type:
        return "REQUIRED"  # Scannable story moments need themes
    
    if basic_type in ["Prop", "Document"]:
        return "HIGH"  # Discoverable narrative content
    
    if basic_type == "Set Dressing":
        return "MEDIUM"  # Environmental narrative
    
    if basic_type in ["Container", "Physical"]:
        return "LOW"  # Often mechanical, legitimately unthreaded
    
    return "UNKNOWN"
```

### Layer 2: Memory Token SF_MemoryType Signals

```python
def get_sf_type_thread_affinity(sf_memory_type):
    """Map SF_MemoryType to likely threads"""
    
    affinities = {
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
    
    return affinities.get(sf_memory_type, [])
```

### Layer 3: Character Context (Owner + Goal Cluster)

```python
def get_owner_cluster_thread_affinity(owner_cluster):
    """Map goal cluster to thread preferences"""
    
    affinities = {
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
    
    return affinities.get(owner_cluster, [])
```

### Layer 4: Timeline Event Clustering

Elements sharing timeline events should often share threads. If 80%+ siblings have Thread X, flag remainder as orphans.

### Layer 5: Associated Characters Network

Elements with multiple Associated Characters may belong to multiple threads based on where those characters have content.

### Layer 6: Keyword Semantic Analysis

Thread-specific keyword taxonomies provide baseline scoring but are weighted lower than other factors.

### Layer 7: Relationship Orphans

Find elements mentioning character names in Description/Text without proper Owner or Associated Characters relations.

## Multi-Factor Confidence Scoring

Score = Sum of:
- SF_MemoryType alignment (0-2.0 points)
- Owner cluster alignment (0-1.5 points)
- Timeline sibling bonus (0-1.5 points)
- Associated characters network (0-1.0 points)
- Keyword matches (0-1.0 points, weighted lower)

Confidence Levels:
- HIGH: Score >= 4.0 (recommend immediate assignment)
- MEDIUM: Score 2.5-3.9 (recommend Max review)
- LOW: Score 1.0-2.4 (FYI only)

## Output Format

Structured report with:
- High/Medium/Low confidence orphans
- Multi-thread candidates
- Relationship orphans
- Timeline clustering patterns
- Wiring vs content problem assessment
- Actionable recommendations

## Success Criteria

Agent distinguishes:
- Thread with orphans → Wire existing content first
- Thread without orphans → Design new content
- Character mentions without relations → Fix database wiring
- Timeline siblings pattern → Systematic assignment
