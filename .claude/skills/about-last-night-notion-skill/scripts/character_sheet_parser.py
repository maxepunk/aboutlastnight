#!/usr/bin/env python3
"""
Character Sheet Parser - Shared Module

Flexible parser for character sheets from Google Drive.
Extracts raw character sheet text for agent interpretation.

Design Principles:
- Flexible section detection (find name, get content until next name)
- Resilient to document edits/refinements
- Returns raw text for agent analysis (not rigid parsing)
- Handles name discrepancies between Google Drive (truth) and Notion

Usage:
    from character_sheet_parser import CharacterSheetParser
    
    parser = CharacterSheetParser()
    sheet_text = parser.get_character_sheet("Ashe Motoko")
    # Returns raw text of that character's section
"""

import re
from typing import Dict, List, Optional, Tuple


# Google Drive document ID for character sheets (SOURCE OF TRUTH)
CHARACTER_SHEETS_DOC_ID = "1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts"


class CharacterSheetParser:
    """
    Flexible parser for character sheets from Google Drive.
    
    The character sheets document contains sections for each character.
    This parser finds character sections and returns raw text for agent interpretation.
    """
    
    def __init__(self):
        """Initialize parser."""
        self.doc_id = CHARACTER_SHEETS_DOC_ID
        self.doc_url = f"https://docs.google.com/document/d/{self.doc_id}"
        self._cached_content = None
        self._cached_sections = None
    
    def _fetch_document_content(self) -> str:
        """
        Fetch character sheets document from Google Drive.
        
        NOTE: This requires the google_drive_fetch tool to be called first
        by Claude to load the document into context. This function extracts
        the content from that context.
        
        Returns:
            Raw document text content
        """
        # This is a placeholder for document fetching
        # In actual use, Claude will have called google_drive_fetch first
        # and the document content will be available in context
        
        if self._cached_content is not None:
            return self._cached_content
        
        # Placeholder: Document needs to be fetched via google_drive_fetch tool
        # Claude should call: google_drive_fetch([CHARACTER_SHEETS_DOC_ID])
        # Then this content will be available
        
        return ""
    
    def _extract_character_sections(self, content: str) -> Dict[str, str]:
        """
        Extract character sections from document content.
        
        Strategy: Find character names (typically in bold or as headers),
        then extract content until the next character name appears.
        
        This is flexible and resilient to document formatting changes.
        
        Args:
            content: Raw document text
            
        Returns:
            Dictionary mapping character names to their section text
        """
        if self._cached_sections is not None:
            return self._cached_sections
        
        sections = {}
        
        # Common patterns for character section headers:
        # - All caps name
        # - Name with prefix (E-, P-, R-, S-)
        # - Bold text followed by content
        # - Line breaks separating sections
        
        # Split by double line breaks to find potential sections
        potential_sections = re.split(r'\n\n+', content)
        
        current_character = None
        current_content = []
        
        for section in potential_sections:
            # Check if this looks like a character name header
            # Patterns: "ASHE MOTOKO", "E - Ashe Motoko", "Ashe Motoko"
            name_match = re.match(r'^([A-Z\s\-]+)$', section.strip())
            prefix_match = re.match(r'^([EPRS])\s*-\s*(.+)$', section.strip())
            
            is_character_header = False
            detected_name = None
            
            if name_match:
                # All caps - likely a character name
                detected_name = name_match.group(1).strip()
                is_character_header = True
            elif prefix_match:
                # Has prefix (E-, P-, R-, S-)
                detected_name = prefix_match.group(2).strip()
                is_character_header = True
            elif len(section.strip()) < 50 and section.strip().istitle():
                # Short title-case text - might be character name
                detected_name = section.strip()
                is_character_header = True
            
            if is_character_header and detected_name:
                # Save previous character's content
                if current_character and current_content:
                    sections[current_character] = '\n\n'.join(current_content)
                
                # Start new character section
                current_character = detected_name
                current_content = []
            else:
                # Add content to current character
                if current_character:
                    current_content.append(section)
        
        # Save last character
        if current_character and current_content:
            sections[current_character] = '\n\n'.join(current_content)
        
        self._cached_sections = sections
        return sections
    
    def get_all_character_names(self) -> List[str]:
        """
        Get list of all character names found in document.
        
        Returns:
            List of character names (as they appear in Google Drive doc)
        """
        content = self._fetch_document_content()
        if not content:
            return []
        
        sections = self._extract_character_sections(content)
        return list(sections.keys())
    
    def get_character_sheet(self, character_name: str) -> Optional[str]:
        """
        Get raw character sheet text for a specific character.
        
        Args:
            character_name: Character name (flexible matching)
                           Can be: "Ashe Motoko", "E - Ashe Motoko", "ASHE MOTOKO", etc.
        
        Returns:
            Raw text of character's sheet section, or None if not found
        """
        content = self._fetch_document_content()
        if not content:
            return None
        
        sections = self._extract_character_sections(content)
        
        # Try exact match first
        if character_name in sections:
            return sections[character_name]
        
        # Try fuzzy matching (case-insensitive, ignore prefix)
        normalized_input = character_name.lower()
        # Remove prefix if present
        normalized_input = re.sub(r'^[eprs]\s*-\s*', '', normalized_input).strip()
        
        for name, sheet_text in sections.items():
            normalized_name = name.lower()
            normalized_name = re.sub(r'^[eprs]\s*-\s*', '', normalized_name).strip()
            
            if normalized_name == normalized_input:
                return sheet_text
        
        # Still not found - try partial matching
        for name, sheet_text in sections.items():
            if normalized_input in name.lower() or name.lower() in normalized_input:
                return sheet_text
        
        return None
    
    def get_character_name_mapping(self) -> Dict[str, str]:
        """
        Get mapping between Google Drive names (truth) and Notion names.
        
        Returns:
            Dictionary mapping Google Drive name -> Notion name
            
        Note: This requires manual configuration since names may differ.
        Example: "Jamie Volt" (Google Drive) -> "R - Jamie Woods" (Notion)
        """
        # Known name discrepancies between Google Drive (truth) and Notion
        # Update this mapping as discrepancies are discovered
        
        mapping = {
            # Google Drive name: Notion name
            "Jamie Volt": "R - Jamie Woods",
            # Add other discrepancies as they're found
        }
        
        return mapping
    
    def find_notion_name_for_sheet_name(self, sheet_name: str) -> Optional[str]:
        """
        Find the corresponding Notion database name for a Google Drive sheet name.
        
        Args:
            sheet_name: Name as it appears in Google Drive character sheets
            
        Returns:
            Notion database name with prefix, or None if not found
        """
        mapping = self.get_character_name_mapping()
        
        # Check direct mapping
        if sheet_name in mapping:
            return mapping[sheet_name]
        
        # Check case-insensitive
        for drive_name, notion_name in mapping.items():
            if drive_name.lower() == sheet_name.lower():
                return notion_name
        
        # No known discrepancy - assume names match (just add prefix if needed)
        # Most characters will have matching names
        return None  # Let calling code handle this case
    
    def parse_sheet_structure(self, sheet_text: str) -> Dict[str, any]:
        """
        Parse character sheet text into structured components.
        
        This provides LIGHT structure extraction while keeping raw text available.
        Agent still does heavy interpretation.
        
        Args:
            sheet_text: Raw character sheet text
            
        Returns:
            Dictionary with structured components (all optional):
                - raw_text: Full raw text
                - logline: Character logline/title (if found)
                - memory_inventory: Memory bullet points (if found)
                - trust_declaration: Trust pair text (if found)
                - goal_mantra: Goal cluster mantra (if found)
        """
        result = {
            "raw_text": sheet_text,
            "logline": None,
            "memory_inventory": [],
            "trust_declaration": None,
            "goal_mantra": None
        }
        
        # Extract logline (typically first line or short description)
        lines = sheet_text.strip().split('\n')
        if lines:
            # First non-empty line might be logline
            for line in lines:
                if line.strip() and len(line.strip()) < 100:
                    result["logline"] = line.strip()
                    break
        
        # Extract memory inventory bullets (lines starting with •, -, or *)
        bullet_pattern = re.compile(r'^[\s]*[•\-\*]\s*(.+)$', re.MULTILINE)
        bullets = bullet_pattern.findall(sheet_text)
        result["memory_inventory"] = bullets
        
        # Extract trust declaration (contains "you know you can trust")
        trust_pattern = re.compile(r'you know you can trust\s+([^\n\.]+)', re.IGNORECASE)
        trust_match = trust_pattern.search(sheet_text)
        if trust_match:
            result["trust_declaration"] = trust_match.group(0).strip()
        
        # Extract goal mantra (typically last bullet or emphasized text)
        # Common patterns: "Someone needs to answer...", "They took something...", etc.
        mantra_patterns = [
            r'someone needs to answer[^\.]*\.',
            r'they took something[^\.]*\.',
            r'something (?:that )?must stay hidden[^\.]*\.',
            r'the past is only worth[^\.]*\.'
        ]
        
        for pattern in mantra_patterns:
            mantra_match = re.search(pattern, sheet_text, re.IGNORECASE)
            if mantra_match:
                result["goal_mantra"] = mantra_match.group(0).strip()
                break
        
        return result
    
    def extract_relationship_mentions(self, sheet_text: str) -> List[Tuple[str, str]]:
        """
        Extract relationship mentions from character sheet text.
        
        Looks for patterns like:
        - "dated [Name]"
        - "worked with [Name]"
        - "friend of [Name]"
        - etc.
        
        Args:
            sheet_text: Raw character sheet text
            
        Returns:
            List of tuples: (relationship_type, character_name)
            Example: [("dated", "Alex Reeves"), ("friend", "Diana Nilsson")]
        """
        relationships = []
        
        # Common relationship patterns
        patterns = [
            (r'dated\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'dated'),
            (r'married\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'married'),
            (r'worked\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'worked_with'),
            (r'friend\s+(?:of|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'friend'),
            (r'partner\s+(?:of|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'partner'),
            (r'rival\s+(?:of|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'rival'),
            (r'fired\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'fired_by'),
            (r'hired\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'hired_by'),
        ]
        
        for pattern, rel_type in patterns:
            matches = re.findall(pattern, sheet_text, re.IGNORECASE)
            for match in matches:
                relationships.append((rel_type, match))
        
        return relationships


# Convenience functions for direct use

def get_character_sheet(character_name: str) -> Optional[str]:
    """
    Convenience function to get character sheet text.
    
    Args:
        character_name: Character name (flexible matching)
        
    Returns:
        Raw character sheet text or None
    """
    parser = CharacterSheetParser()
    return parser.get_character_sheet(character_name)


def get_all_character_names() -> List[str]:
    """
    Convenience function to get all character names.
    
    Returns:
        List of character names from Google Drive doc
    """
    parser = CharacterSheetParser()
    return parser.get_all_character_names()


def parse_character_sheet(character_name: str) -> Optional[Dict]:
    """
    Convenience function to get parsed character sheet.
    
    Args:
        character_name: Character name (flexible matching)
        
    Returns:
        Parsed sheet structure or None
    """
    parser = CharacterSheetParser()
    sheet_text = parser.get_character_sheet(character_name)
    if sheet_text:
        return parser.parse_sheet_structure(sheet_text)
    return None


# Module-level note about usage
def usage_note():
    """
    Print usage note for this module.
    """
    print("""
Character Sheet Parser Module
=============================

This module provides flexible parsing of character sheets from Google Drive.

IMPORTANT: Before using this module, Claude must call:
    google_drive_fetch(["{doc_id}"])

Then the module can extract character sheet content.

Usage Examples:
    
    # Get raw character sheet text
    sheet_text = get_character_sheet("Ashe Motoko")
    
    # Get all character names
    names = get_all_character_names()
    
    # Get parsed structure
    parsed = parse_character_sheet("Ashe Motoko")
    print(parsed['logline'])
    print(parsed['memory_inventory'])
    print(parsed['trust_declaration'])

Design Philosophy:
    - Flexible section detection (resilient to document edits)
    - Returns raw text for agent interpretation
    - Light structure extraction available but not rigid
    - Handles name discrepancies between Google Drive and Notion
    """.format(doc_id=CHARACTER_SHEETS_DOC_ID))


if __name__ == "__main__":
    usage_note()
