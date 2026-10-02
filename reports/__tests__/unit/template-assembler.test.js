/**
 * TemplateAssembler Unit Tests
 *
 * Tests the Handlebars-based template assembly system.
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const path = require('path');
const { TemplateAssembler, createTemplateAssembler, _testing } = require('../../lib/template-assembler');
const { sectionsFrom, notationOf } = require('../../lib/__tests__/fixtures/photo-runs');

// Load valid fixture for testing
const validBundle = require('../fixtures/content-bundles/valid-journalist.json');

describe('TemplateAssembler', () => {
  describe('constructor', () => {
    it('creates assembler with default settings', () => {
      const assembler = new TemplateAssembler('journalist');
      expect(assembler.theme).toBe('journalist');
      expect(assembler.initialized).toBe(false);
      expect(assembler.validateSchema).toBe(true);
    });

    it('accepts custom template directory', () => {
      const customDir = '/custom/templates';
      const assembler = new TemplateAssembler('journalist', { templateDir: customDir });
      expect(assembler.templateDir).toBe(customDir);
    });

    it('allows disabling schema validation', () => {
      const assembler = new TemplateAssembler('journalist', { validateSchema: false });
      expect(assembler.validateSchema).toBe(false);
    });
  });

  describe('initialize', () => {
    it('loads templates and partials', async () => {
      const assembler = new TemplateAssembler('journalist');
      await assembler.initialize();

      expect(assembler.initialized).toBe(true);
      expect(assembler.mainTemplate).toBeDefined();
    });

    it('is idempotent (safe to call multiple times)', async () => {
      const assembler = new TemplateAssembler('journalist');
      await assembler.initialize();
      await assembler.initialize(); // Should not throw

      expect(assembler.initialized).toBe(true);
    });

    it('registers partials recursively', async () => {
      const assembler = new TemplateAssembler('journalist');
      await assembler.initialize();

      const partials = assembler.getRegisteredPartials();
      expect(partials).toContain('navigation');
      expect(partials).toContain('header');
      expect(partials).toContain('content-blocks/paragraph');
      expect(partials).toContain('sidebar/financial-tracker');
    });
  });

  describe('assemble', () => {
    let assembler;

    beforeAll(async () => {
      assembler = new TemplateAssembler('journalist');
      await assembler.initialize();
    });

    it('produces valid HTML from ContentBundle', async () => {
      const html = await assembler.assemble(validBundle);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('includes headline in output', async () => {
      const html = await assembler.assemble(validBundle);

      expect(html).toContain(validBundle.headline.main);
    });

    it('includes inline CSS by default', async () => {
      const html = await assembler.assemble(validBundle);

      // With inline CSS enabled (default), CSS content is embedded in <style> block
      expect(html).toContain('<style>');
      expect(html).toContain('--nn-'); // CSS variables prefix from variables.css
    });

    it('includes NovaNews brand', async () => {
      const html = await assembler.assemble(validBundle);

      expect(html).toContain('Nova<span>News</span>');
    });

    it('renders sections from ContentBundle', async () => {
      const html = await assembler.assemble(validBundle);

      // Check that sections are rendered
      validBundle.sections.forEach(section => {
        expect(html).toContain(`id="${section.id}"`);
      });
    });

    it('throws on invalid ContentBundle', async () => {
      const invalidBundle = { headline: 'not an object' };

      await expect(assembler.assemble(invalidBundle)).rejects.toThrow('Invalid ContentBundle');
    });

    it('skips validation when skipValidation is true', async () => {
      const invalidBundle = { headline: { main: 'Test' } }; // Missing required sections

      // Should not throw when validation is skipped
      const html = await assembler.assemble(invalidBundle, { skipValidation: true });
      expect(html).toContain('Test');
    });
  });

  describe('buildContext', () => {
    let assembler;

    beforeAll(async () => {
      assembler = new TemplateAssembler('journalist');
      await assembler.initialize();
    });

    it('adds inline CSS by default for standalone HTML', async () => {
      const context = await assembler.buildContext(validBundle);

      // With inlineCss enabled (default), css is null and inlineCss has content
      expect(context.inlineCss).toBeDefined();
      expect(typeof context.inlineCss).toBe('string');
      expect(context.inlineCss.length).toBeGreaterThan(0);
      expect(context.css).toBeNull();
    });

    it('adds external CSS configuration when inline disabled', async () => {
      const externalCssAssembler = new TemplateAssembler('journalist', { inlineCss: false });
      await externalCssAssembler.initialize();
      const context = await externalCssAssembler.buildContext(validBundle);

      expect(context.css).toBeDefined();
      expect(context.css.files).toBeInstanceOf(Array);
      expect(context.css.files.length).toBeGreaterThan(0);
      expect(context.inlineCss).toBeNull();
    });

    it('adds computed boolean flags', async () => {
      const context = await assembler.buildContext(validBundle);

      expect(typeof context.hasFinancialTracker).toBe('boolean');
      expect(typeof context.hasPullQuotes).toBe('boolean');
      expect(typeof context.hasEvidenceCards).toBe('boolean');
    });

    it('builds section navigation', async () => {
      const context = await assembler.buildContext(validBundle);

      expect(context.sectionNav).toBeInstanceOf(Array);
      context.sectionNav.forEach(item => {
        expect(item.id).toBeDefined();
        expect(item.label).toBeDefined();
        expect(item.href).toMatch(/^#/);
      });
    });

    // Phase 3 (3.2; M2): the tracker prints itself from the ledger. It used to print
    // only when the writer had filled financialTracker.entries, which the assembler
    // then replaced from the ledger anyway, so a writer no longer asked for entries
    // would have lost the tracker from every article.
    it('prints the money tracker from the ledger when the writer gave no entries', async () => {
      const { financialTracker, ...noTracker } = validBundle;
      const ledger = [{ name: 'Ember', total: 250000, tokenCount: 2 }, { name: 'Gone', total: 0, tokenCount: 0 }];
      const context = await assembler.buildContext(noTracker, 'test', ledger);
      expect(context.hasFinancialTracker).toBe(true);
      expect(context.financialTracker.entries.map((e) => [e.description, e.amount])).toEqual([['Ember', '$250,000']]);

      const html = await assembler.assemble(noTracker, { shellAccounts: ledger });
      expect(html).toContain('financial-tracker');
    });

    it('prints no tracker when no account has a positive total and the writer gave no entries', async () => {
      const { financialTracker, ...noTracker } = validBundle;
      const context = await assembler.buildContext(noTracker, 'test', [{ name: 'Gone', total: 0, tokenCount: 0 }]);
      expect(context.hasFinancialTracker).toBe(false);
    });

    it('passes through original ContentBundle data', async () => {
      const context = await assembler.buildContext(validBundle);

      expect(context.headline).toEqual(validBundle.headline);
      expect(context.sections).toEqual(validBundle.sections);
      expect(context.metadata).toEqual(validBundle.metadata);
    });
  });

  describe('getRegisteredPartials', () => {
    it('returns list of partial names', async () => {
      const assembler = new TemplateAssembler('journalist');
      await assembler.initialize();

      const partials = assembler.getRegisteredPartials();

      expect(Array.isArray(partials)).toBe(true);
      expect(partials.length).toBeGreaterThan(0);
    });
  });

  describe('isInitialized', () => {
    it('returns false before initialization', () => {
      const assembler = new TemplateAssembler('journalist');
      expect(assembler.isInitialized()).toBe(false);
    });

    it('returns true after initialization', async () => {
      const assembler = new TemplateAssembler('journalist');
      await assembler.initialize();
      expect(assembler.isInitialized()).toBe(true);
    });
  });
});

describe('createTemplateAssembler', () => {
  it('creates assembler instance', () => {
    const assembler = createTemplateAssembler('journalist');
    expect(assembler).toBeInstanceOf(TemplateAssembler);
    expect(assembler.theme).toBe('journalist');
  });

  it('passes options through', () => {
    const assembler = createTemplateAssembler('detective', { validateSchema: false });
    expect(assembler.theme).toBe('detective');
    expect(assembler.validateSchema).toBe(false);
  });
});

describe('detective theme', () => {
  let assembler;

  beforeAll(async () => {
    assembler = new TemplateAssembler('detective');
    await assembler.initialize();
  });

  it('initializes with detective templates', () => {
    expect(assembler.initialized).toBe(true);
    expect(assembler.theme).toBe('detective');
  });

  it('registers detective partials', () => {
    const partials = assembler.getRegisteredPartials();
    expect(partials).toContain('header');
    expect(partials).toContain('content-blocks/paragraph');
    expect(partials).toContain('content-blocks/evidence-card');
    expect(partials).toContain('content-blocks/quote');
    expect(partials).toContain('content-blocks/list');
    expect(partials).toContain('content-blocks/photo');
  });

  it('assembles detective report from ContentBundle', async () => {
    const detectiveBundle = {
      headline: { main: 'Case #1221' },
      metadata: { theme: 'detective', sessionId: '1221' },
      sections: [
        {
          id: 'executiveSummary',
          type: 'narrative',
          heading: 'Executive Summary',
          content: [
            { type: 'paragraph', text: 'Marcus Blackwood is dead.' }
          ]
        }
      ],
      evidenceCards: [],
      pullQuotes: [],
      photos: [],
      financialTracker: null
    };

    const html = await assembler.assemble(detectiveBundle, { skipValidation: true });

    expect(html).toContain('Marcus Blackwood is dead.');
    expect(html).toContain('Case Report 1221'); // Title uses sessionId
    expect(html).toContain('report-container');
    expect(html).toContain('Det. Anondono');
    expect(html).not.toContain('NovaNews');
    expect(html).not.toContain('Nova<span>News</span>');
  });

  it('includes detective inline CSS with --det- variables', async () => {
    const detectiveBundle = {
      headline: { main: 'Test' },
      metadata: { theme: 'detective' },
      sections: [],
      evidenceCards: [],
      pullQuotes: [],
      photos: [],
      financialTracker: null
    };

    const html = await assembler.assemble(detectiveBundle, { skipValidation: true });

    expect(html).toContain('<style>');
    expect(html).toContain('--det-'); // Detective CSS variables prefix
  });

  it('includes inline JS', async () => {
    const detectiveBundle = {
      headline: { main: 'Test' },
      metadata: { theme: 'detective' },
      sections: [],
      evidenceCards: [],
      pullQuotes: [],
      photos: [],
      financialTracker: null
    };

    const html = await assembler.assemble(detectiveBundle, { skipValidation: true });

    expect(html).toContain('<script>');
    expect(html).toContain('EvidenceItems');
  });
});

// Never two photos in a row (spec 2026-10-02 section 9; brief F3). buildContext spaces
// the photos of what prints, for both themes, so the publish step, the article stop's
// preview and scripts/assemble-article.js all print the spaced order. The stored
// bundle keeps the writer's order. The rule itself is tested in
// lib/__tests__/photo-spacing.test.js.
describe('photo spacing in what prints', () => {
  // 0926262's first draft from THE PLAYERS on, with the hero printed above the lede.
  const DRAFT = '[the-players] P PH1 P P PH2 PH3 [whats-missing] PH4 P [closing] P quote PH5 P P P';
  const SPACED = '[the-players] P PH1 P P PH2 [whats-missing] P PH3 [closing] P PH4 quote PH5 P P P';
  const journalistDraft = () => ({
    ...JSON.parse(JSON.stringify(validBundle)),
    heroImage: { filename: 'hero.jpg', caption: 'The hero.' },
    sections: sectionsFrom(DRAFT)
  });

  it('spaces the sections of the template context and leaves the bundle as the writer ordered it', async () => {
    const assembler = new TemplateAssembler('journalist');
    const bundle = journalistDraft();
    const stored = JSON.parse(JSON.stringify(bundle));

    const context = await assembler.buildContext(bundle, '010126');

    expect(notationOf(context.sections)).toBe(SPACED);
    expect(context.sections[1].content[1]).toEqual({
      type: 'photo', filename: 'ph3.jpg', caption: 'Photo 3.', src: 'sessionphotos/010126/ph3.jpg'
    });
    expect(bundle).toEqual(stored);
  });

  it('counts the journalist hero as a photo just above the lede, when the bundle has one', async () => {
    const assembler = new TemplateAssembler('journalist');
    const lede = { ...JSON.parse(JSON.stringify(validBundle)), sections: sectionsFrom('[lede] PH1 P P') };

    const withHero = await assembler.buildContext({ ...lede, heroImage: { filename: 'hero.jpg' } }, '010126');
    expect(notationOf(withHero.sections)).toBe('[lede] P PH1 P');

    const withoutHero = await assembler.buildContext(lede, '010126');
    expect(notationOf(withoutHero.sections)).toBe('[lede] PH1 P P');
  });

  it('prints the spaced order on the page', async () => {
    const assembler = new TemplateAssembler('journalist');
    const html = await assembler.assemble(journalistDraft(), { sessionId: '010126' });
    const printed = ['ph2.jpg', 'Paragraph whats-missing 2.', 'ph3.jpg', 'Paragraph closing 1.', 'ph4.jpg', 'Quote closing 2.', 'ph5.jpg'];
    printed.forEach((marker) => expect(html).toContain(marker));
    expect([...printed].sort((a, b) => html.indexOf(a) - html.indexOf(b))).toEqual(printed);
  });

  it('on the detective page, which prints no hero, leaves a photo that opens the report and still spaces a run', async () => {
    const assembler = new TemplateAssembler('detective');
    const bundle = {
      headline: { main: 'Case #1221' },
      metadata: { theme: 'detective', sessionId: '1221' },
      heroImage: { filename: 'hero.jpg', caption: 'The hero.' },
      sections: sectionsFrom('[case-summary] PH1 P P PH2 PH3 P')
    };

    const context = await assembler.buildContext(bundle, '1221');
    expect(notationOf(context.sections)).toBe('[case-summary] PH1 P P PH2 P PH3');

    const html = await assembler.assemble(bundle, { skipValidation: true, sessionId: '1221' });
    expect(html).not.toContain('hero.jpg');
  });
});

// Note: overrideFinancialTracker now generates entries authoritatively from
// shellAccounts rather than merging with LLM data. Tests for the new contract
// live in lib/__tests__/template-assembler-financial.test.js.
// The prior tests here documented the OLD broken behavior (lookup by entry.name,
// which the content-bundle schema doesn't permit) and have been replaced.

describe('_testing exports', () => {
  it('exports DEFAULT_TEMPLATE_DIR', () => {
    expect(_testing.DEFAULT_TEMPLATE_DIR).toBeDefined();
    expect(_testing.DEFAULT_TEMPLATE_DIR).toContain('templates');
  });

  it('exports DEFAULT_CSS_PATHS', () => {
    expect(_testing.DEFAULT_CSS_PATHS).toBeDefined();
    expect(_testing.DEFAULT_CSS_PATHS.journalist).toBeDefined();
    expect(_testing.DEFAULT_CSS_PATHS.journalist.files).toBeInstanceOf(Array);
  });

  it('exports DEFAULT_JS_PATHS', () => {
    expect(_testing.DEFAULT_JS_PATHS).toBeDefined();
    expect(_testing.DEFAULT_JS_PATHS.journalist).toBeDefined();
    expect(_testing.DEFAULT_JS_PATHS.journalist.files).toBeInstanceOf(Array);
  });
});
