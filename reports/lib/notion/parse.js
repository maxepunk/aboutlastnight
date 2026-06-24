/**
 * notion/parse — pure Notion page -> parsed element. Single source of parsing
 * for both NotionClient and CachedNotionClient. Emits relation IDs (ownerIds),
 * NOT resolved names; resolution is a separate read-time join (notion/relations).
 * Container is intentionally NOT parsed (dropped from the report pipeline).
 */
function extractRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(t => t.plain_text || '').join('');
}

function parseSFFields(descText) {
  const result = { fullDescription: '', tokenId: '', summary: '', valueRating: '', memoryType: '', group: '' };
  if (!descText) return result;
  const sfIndex = descText.indexOf('SF_');
  if (sfIndex > 0) result.fullDescription = descText.substring(0, sfIndex).trim();
  else if (sfIndex === -1) result.fullDescription = descText.trim();
  const rfid = descText.match(/SF_RFID:\s*\[([^\]]*)\]/i);
  if (rfid) result.tokenId = rfid[1].trim().toLowerCase();
  const summary = descText.match(/SF_Summary:\s*\[([^\]]*)\]/i);
  if (summary) result.summary = summary[1].trim();
  const rating = descText.match(/SF_ValueRating:\s*\[([^\]]*)\]/i);
  if (rating) result.valueRating = rating[1].trim();
  const type = descText.match(/SF_MemoryType:\s*\[([^\]]*)\]/i);
  if (type) result.memoryType = type[1].trim();
  const group = descText.match(/SF_Group:\s*\[([^\]]*)\]/i);
  if (group) result.group = group[1].trim();
  return result;
}

function parseTokenPage(page) {
  const props = page.properties || {};
  const name = extractRichText(props['Name']?.title);
  const descText = extractRichText(props['Description/Text']?.rich_text);
  const basicType = props['Basic Type']?.select?.name || '';
  const sf = parseSFFields(descText);
  if (!sf.tokenId) return null;
  return {
    notionId: page.id,
    tokenId: sf.tokenId,
    name,
    fullDescription: sf.fullDescription,
    summary: sf.summary,
    valueRating: sf.valueRating,
    memoryType: sf.memoryType,
    group: sf.group,
    basicType,
    ownerIds: props['Owner']?.relation?.map(r => r.id) || []
  };
}

function parseEvidencePage(page, { includeFiles = true } = {}) {
  const props = page.properties || {};
  const item = {
    notionId: page.id,
    name: extractRichText(props['Name']?.title),
    basicType: props['Basic Type']?.select?.name || '',
    description: extractRichText(props['Description/Text']?.rich_text),
    narrativeThreads: props['Narrative Threads']?.multi_select?.map(s => s.name) || [],
    ownerIds: props['Owner']?.relation?.map(r => r.id) || []
  };
  if (includeFiles && props['Files & media']?.files) {
    item.files = props['Files & media'].files.map(f => ({
      name: f.name, type: f.type,
      url: f.type === 'external' ? f.external?.url : f.file?.url
    }));
  }
  return item;
}

module.exports = { extractRichText, parseSFFields, parseTokenPage, parseEvidencePage };
