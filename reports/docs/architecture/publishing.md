# Templates and publishing

The Handlebars templates, the photo spacing rule, and what publishing writes.

Moved verbatim from `reports/CLAUDE.md` on 2026-10-11, when CLAUDE.md became a map. A part named in bold elsewhere in this text, such as **The map**, may now sit in another file in `docs/architecture/`; CLAUDE.md lists which file holds which part.

### Template System

```
templates/journalist/
├── layouts/article.hbs         # Main article layout (multi-column with sidebar)
└── partials/
    ├── header.hbs, navigation.hbs
    ├── content-blocks/         # paragraph, quote, list, evidence-reference
    └── sidebar/                # financial-tracker, evidence-card, pull-quote

templates/detective/
├── layouts/article.hbs         # Single-column case report layout
└── partials/
    ├── header.hbs              # Case metadata box
    └── content-blocks/         # paragraph, evidence-card, quote, list, photo
```

**Photo spacing** (spec 2026-10-02 section 9): the page never prints two photos in a row, except when the photos outnumber the blocks that can separate them. `TemplateAssembler.buildContext` passes the sections through `spacePhotos` (`lib/photo-spacing.js`, whose header states the whole rule) before it maps them and builds the section nav, for both themes, so the publish step, the article stop's `htmlPreview` and `scripts/assemble-article.js` print one order. Only a photo that would follow a photo moves, to the next paragraph the writer did not follow with a photo: a heading separates nothing, and a printed hero counts as a photo above the first block. Every other photo stays where the writer put it, so photos can print out of the writer's order, and no other block moves. A section with no blocks prints no heading and no nav link: one the spacing empties, and one the director emptied at the desk by deleting its blocks (task 4.14c), in the page, the preview and the published report alike. Only what prints is spaced. The stored and approved bundles and the console's editors keep the writer's order, so the article stop's editor can show two photos together that its preview prints apart.

**Publishing** (`assembleHtml`, after the article stop; the fixes before phase 4, F2 and FB). The report goes to `outputs/report-<id>.html` and its photos to `outputs/sessionphotos/<id>/`, both committed to a public repository and read by the players, often on a phone. `assembleHtml` resolves the theme once, the thread's before the config's, for both rendering and publishing. `lib/publish-photos.js` publishes exactly the photos the page prints (`printedPhotos`: the printed hero, then every photo block, each filename once), so an excluded photo and the whiteboard stay out of the public folder. Whether a page prints a hero is one rule, `printedHero` in `lib/theme-config.js`, which the assembler reads too: the theme's layout prints one (`display.printsHero`: the journalist's does, the detective's does not), and the hero names a file. Each photo goes out at web size (`PUBLISHED_PHOTO`, the settings used by hand for 0926262) under its own name, since the HTML names it verbatim. A printed photo missing from `data/<id>/photos` throws, naming it, before the report is written, and its message tells the director to put the file back and retry the publish: Retry resumes the run, while a rollback to the article stop writes the article again. `photosCopied` is the count published, and `photosNotPrinted` names each file the session's published folder holds that the page does not print, such as a photo an earlier publish wrote that the director has since left out or deleted: publish deletes nothing, the folder is public once committed, and the completion screen lists them for the director to remove before committing (`lib/publish-photos.js` `filesNotPrinted`, `console/session-start-logic.js` `notPrintedPhotosView`; the director's ruling, 2026-10-04). A printed photo replaces its namesake in the published folder, and every other file there stays as it is. The image preprocessor turns a photo upright before it resizes it, because the page prints the preprocessor's copy for a custom photos folder or a `.jpeg`.
