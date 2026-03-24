// tests/notionFormatters.test.js
// Tests for src/utils/notionFormatters.js
// Pure functions — no mocking needed.

import {
  // Property formatters
  notionTitle,
  notionRichText,
  notionNumber,
  notionSelect,
  notionDate,
  notionRelation,
  // Block constructors
  headingBlock,
  paragraphBlock,
  calloutBlock,
  dividerBlock,
  bulletBlock,
  chunkParagraphs,
  buildAuditBlocks,
} from '../src/utils/notionFormatters.js';

// ---------------------------------------------------------------------------
// Property formatters
// ---------------------------------------------------------------------------

describe('notionTitle', () => {
  test('wraps text in title format', () => {
    const result = notionTitle('My Decision');
    expect(result).toEqual({
      title: [{ text: { content: 'My Decision' } }],
    });
  });

  test('handles null/undefined gracefully', () => {
    expect(notionTitle(null).title[0].text.content).toBe('');
    expect(notionTitle(undefined).title[0].text.content).toBe('');
  });
});

describe('notionRichText', () => {
  test('wraps text in rich_text format', () => {
    const result = notionRichText('Some context');
    expect(result).toEqual({
      rich_text: [{ text: { content: 'Some context' } }],
    });
  });

  test('truncates text to 2000 characters', () => {
    const long = 'x'.repeat(3000);
    const result = notionRichText(long);
    expect(result.rich_text[0].text.content).toHaveLength(2000);
  });

  test('handles null gracefully', () => {
    expect(notionRichText(null).rich_text[0].text.content).toBe('');
  });
});

describe('notionNumber', () => {
  test('wraps a number correctly', () => {
    expect(notionNumber(7)).toEqual({ number: 7 });
    expect(notionNumber(0)).toEqual({ number: 0 });
  });

  test('returns null for missing value', () => {
    expect(notionNumber(null)).toEqual({ number: null });
    expect(notionNumber(undefined)).toEqual({ number: null });
  });
});

describe('notionSelect', () => {
  test('wraps a name in select format', () => {
    expect(notionSelect('Engineering')).toEqual({
      select: { name: 'Engineering' },
    });
  });

  test('returns null select for falsy values', () => {
    expect(notionSelect('')).toEqual({ select: null });
    expect(notionSelect(null)).toEqual({ select: null });
  });
});

describe('notionDate', () => {
  test('wraps a YYYY-MM-DD string correctly', () => {
    expect(notionDate('2026-03-24')).toEqual({
      date: { start: '2026-03-24' },
    });
  });

  test('accepts a Date object and converts to YYYY-MM-DD', () => {
    const d = new Date('2026-06-15T12:00:00Z');
    const result = notionDate(d);
    expect(result.date.start).toBe('2026-06-15');
  });

  test('returns null date for falsy values', () => {
    expect(notionDate(null)).toEqual({ date: null });
    expect(notionDate('')).toEqual({ date: null });
  });
});

describe('notionRelation', () => {
  test('wraps a single ID in relation format', () => {
    expect(notionRelation('abc123')).toEqual({
      relation: [{ id: 'abc123' }],
    });
  });

  test('wraps an array of IDs', () => {
    expect(notionRelation(['abc', 'def'])).toEqual({
      relation: [{ id: 'abc' }, { id: 'def' }],
    });
  });

  test('filters out falsy values from the array', () => {
    const result = notionRelation(['abc', null, '', 'def']);
    expect(result.relation).toHaveLength(2);
    expect(result.relation[0].id).toBe('abc');
    expect(result.relation[1].id).toBe('def');
  });
});

// ---------------------------------------------------------------------------
// Block constructors
// ---------------------------------------------------------------------------

describe('headingBlock', () => {
  test('creates a heading_2 block by default', () => {
    const block = headingBlock('My Heading');
    expect(block.object).toBe('block');
    expect(block.type).toBe('heading_2');
    expect(block.heading_2.rich_text[0].text.content).toBe('My Heading');
  });

  test('creates heading_1 when level is 1', () => {
    const block = headingBlock('Top Level', 1);
    expect(block.type).toBe('heading_1');
    expect(block.heading_1).toBeDefined();
  });

  test('creates heading_3 when level is 3', () => {
    const block = headingBlock('Sub', 3);
    expect(block.type).toBe('heading_3');
    expect(block.heading_3).toBeDefined();
  });
});

describe('paragraphBlock', () => {
  test('creates a paragraph block with correct structure', () => {
    const block = paragraphBlock('Hello world');
    expect(block.object).toBe('block');
    expect(block.type).toBe('paragraph');
    expect(block.paragraph.rich_text[0].text.content).toBe('Hello world');
  });
});

describe('calloutBlock', () => {
  test('creates a callout block with default emoji', () => {
    const block = calloutBlock('Key insight here');
    expect(block.type).toBe('callout');
    expect(block.callout.rich_text[0].text.content).toBe('Key insight here');
    expect(block.callout.icon.emoji).toBe('💡');
  });

  test('accepts a custom emoji', () => {
    const block = calloutBlock('Warning', '⚠️');
    expect(block.callout.icon.emoji).toBe('⚠️');
  });
});

describe('dividerBlock', () => {
  test('creates a valid divider block', () => {
    const block = dividerBlock();
    expect(block.object).toBe('block');
    expect(block.type).toBe('divider');
    // Notion requires the `divider` key to exist (even as empty object)
    expect(block.divider).toBeDefined();
    expect(block.divider).toEqual({});
  });
});

describe('bulletBlock', () => {
  test('creates a bulleted list item block', () => {
    const block = bulletBlock('List item text');
    expect(block.object).toBe('block');
    expect(block.type).toBe('bulleted_list_item');
    expect(block.bulleted_list_item.rich_text[0].text.content).toBe('List item text');
  });
});

// ---------------------------------------------------------------------------
// chunkParagraphs
// ---------------------------------------------------------------------------

describe('chunkParagraphs', () => {
  test('returns a single paragraph block for short text', () => {
    const blocks = chunkParagraphs('Short text');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].paragraph.rich_text[0].text.content).toBe('Short text');
  });

  test('returns a single empty paragraph for null/undefined', () => {
    expect(chunkParagraphs(null)).toHaveLength(1);
    expect(chunkParagraphs(undefined)).toHaveLength(1);
    expect(chunkParagraphs('')).toHaveLength(1);
  });

  test('splits text longer than 2000 chars into multiple blocks', () => {
    const long = 'x'.repeat(5000);
    const blocks = chunkParagraphs(long);
    expect(blocks.length).toBeGreaterThan(1);
    // Every block must be a paragraph
    blocks.forEach(b => expect(b.type).toBe('paragraph'));
  });

  test('each chunk is at most 2000 characters', () => {
    const long = 'x'.repeat(5000);
    const blocks = chunkParagraphs(long);
    blocks.forEach(b => {
      const content = b.paragraph.rich_text[0].text.content;
      expect(content.length).toBeLessThanOrEqual(2000);
    });
  });

  test('no text is lost when splitting', () => {
    // Use a repeating word so we can measure total content accurately
    const word = 'hello ';
    const long = word.repeat(1000); // 6000 chars
    const blocks = chunkParagraphs(long);
    const combined = blocks.map(b => b.paragraph.rich_text[0].text.content).join('');
    // Combined length should equal original (trim artefacts may differ by a few chars)
    expect(combined.replace(/\s/g, '').length).toBe(long.replace(/\s/g, '').length);
  });

  test('splits on sentence boundary when possible', () => {
    // Build a string that crosses 2000 chars at a sentence boundary
    const sentence = 'This is a sentence. ';
    const long = sentence.repeat(110); // ~2200 chars
    const blocks = chunkParagraphs(long);
    // First block should end with a period (split at sentence boundary)
    const firstContent = blocks[0].paragraph.rich_text[0].text.content;
    expect(firstContent.endsWith('.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAuditBlocks — smoke test (structure, not content)
// ---------------------------------------------------------------------------

describe('buildAuditBlocks', () => {
  const mockAudit = {
    process_score: 7,
    outcome_score: 5,
    verdict: 'Mixed',
    key_insight: 'Timeline assumptions were too optimistic.',
    failed_assumptions: ['Migration would take 2 weeks', 'Zero downtime was achievable'],
    validated_assumptions: ['Team had sufficient SQL knowledge'],
    what_went_well: 'Code quality was high.',
    what_went_wrong: 'Onboarding took 3x longer than expected.',
    recommendation: 'Triple all learning curve estimates.',
    full_narrative: 'The decision was made in good faith but...',
  };

  test('returns an array of blocks', () => {
    const blocks = buildAuditBlocks(mockAudit);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  test('every block has object: "block" and a type', () => {
    const blocks = buildAuditBlocks(mockAudit);
    blocks.forEach(b => {
      expect(b.object).toBe('block');
      expect(typeof b.type).toBe('string');
    });
  });

  test('every block has a matching content key for its type', () => {
    const blocks = buildAuditBlocks(mockAudit);
    blocks.forEach(b => {
      // The block must have a key matching its type (Notion API requirement)
      expect(b[b.type]).toBeDefined();
    });
  });

  test('includes failed assumptions as bullet blocks', () => {
    const blocks = buildAuditBlocks(mockAudit);
    const bullets = blocks.filter(b => b.type === 'bulleted_list_item');
    const contents = bullets.map(b => b.bulleted_list_item.rich_text[0].text.content);
    expect(contents).toContain('Migration would take 2 weeks');
    expect(contents).toContain('Zero downtime was achievable');
  });

  test('handles missing optional fields without crashing', () => {
    const minimalAudit = {
      process_score: 5,
      outcome_score: 5,
      verdict: 'Mixed',
    };
    expect(() => buildAuditBlocks(minimalAudit)).not.toThrow();
  });
});
