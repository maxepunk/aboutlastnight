/**
 * TemplateAssembler Unit Tests
 *
 * Tests the Handlebars-based template assembly system.
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const path = require('path');
const { TemplateAssembler, createTemplateAssembler, _testing } = require('../../lib/template-assembler');

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
