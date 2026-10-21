# Key files

The main files of the pipeline, each with a line on what it holds.

Moved verbatim from `reports/CLAUDE.md` on 2026-10-11, when CLAUDE.md became a map. A part named in bold elsewhere in this text, such as **The map**, may now sit in another file in `docs/architecture/`; CLAUDE.md lists which file holds which part.

### Key Files

```
server.js                           # Express server + session REST API
lib/api-helpers.js                  # Shared API helpers (rollback, graph config, error responses)
lib/old-thread.js                   # A thread from before the story meeting (task 4.11): oldThreadOf and the channels it reads (PAST_THE_ARC_WRITER), the 409's body, the rollback points open to it; since phase 4b (brief 1G) a thread on an earlier shape too, phase 4's or, since brief 3E, piece 1's (isOldShapeWeave: a weave with no angles; isOldShapeMap), with its own message (OLD_SHAPES_MESSAGE), and the rollback that writes such a thread's weave fresh (oldThreadRollbackState, OLD_SHAPES_WEAVE_CHANNELS)
lib/llm/
├── index.js                        # Public API: traced sdkQuery, createProgressLogger
├── client.js                       # Raw SDK wrapper with timeouts, progress hooks, structured-output contract
├── refusal.js                      # Declined requests: SdkRefusalError, refusalOf (through .cause), the stream tracker
├── model-substitution.js           # SdkModelSubstitutionError: a call another model served fails (permanent)
├── sdk-fields.js                   # servedModelsOf (result modelUsage), hasMemoryPaths (init) — shared with the probes
└── structured-output-extractor.js  # JSON extraction + ajv validation; recovers from SDK bug #277
lib/observability/
├── index.js                        # Public exports: traceNode, progressEmitter
├── config.js                       # isTracingEnabled(), getProject()
├── constants.js                    # SDK_MESSAGE_TYPES, SSE_EVENT_TYPES
├── state-snapshot.js               # extractStateSnapshot for traces
├── node-tracer.js                  # traceNode() wrapper
├── llm-tracer.js                   # createTracedSdkQuery() with full visibility
├── progress-emitter.js             # SSE progress streaming via EventEmitter
└── progress-bridge.js              # Console + SSE formatting; sole source of progress event icons/strings
lib/notion/                         # Unified Notion data-layer core (single source of truth)
├── databases.js                    # DB IDs, query filters, RELATION_REGISTRY + ENTITY_RELATIONS
├── parse.js                        # Pure page→element parsers (emit relation IDs, not names; no Container)
└── relations.js                    # Pure registry-driven applyRelationNames join (non-mutating)
lib/cache/
├── index.js                        # Public API for Notion caching
├── cached-notion-client.js         # Cache decorator: stores relation IDs + freshness-checked name table; read-time owner join
├── freshness-checker.js            # Cache staleness detection
└── notion-cache-store.js           # Persistent cache storage (SCHEMA_VERSION bump clears stale-shape blobs)
lib/notion-client.js                # Raw (uncached) Notion API client — consumes lib/notion/ core
lib/schema-validator.js             # JSON schema validation helpers
lib/sdk-client/
└── subagents.js                    # The arc writer's system prompt and the weave's schema (WEAVE_SCHEMA), which the arc rework shares (phase 4)
lib/content-bundle-fact-check.js    # Pure programmatic article fact-check (pre-Opus gate); each finding with its place (findings), for the desk's marks
lib/hand-edit-diff.js               # The director's edits at a stop (the director's edits are final): the diffs (diffOutline, diffBundle), the standing edits, the restore after an automatic pass (settleEdits) and its report, the weave's and the map's edits
lib/photo-leave-out.js              # The photos the director leaves out (brief 4.2): leavePhotosOut, listAfterStopChoices, withExplicitExclusions, leftOutPhotosOf, and photoMappingOf, the one reading of a photo's mapping
lib/article-preview.js              # The page as the article stop and the desk preview it (task 4.3): previewOptionsOf, articlePreviewHtml, writerTrackerPrints
lib/evidence-preprocessor.js        # Evidence batch preprocessing
lib/image-preprocessor.js           # Image analysis preprocessing
lib/image-prompt-builder.js         # Image prompt construction for Haiku
lib/publish-photos.js               # The photos the page prints, published at web size (printedPhotos, publishPhotos)
lib/template-assembler.js           # Handlebars template compilation
lib/photo-spacing.js                # spacePhotos: never two photos in a row on the printed page, unless photos outnumber the blocks that can separate them
lib/template-helpers.js             # Handlebars helper registration
lib/theme-config.js                 # Theme settings: NPC definitions (the writer's entry, Nova's, with the text of Nova's session lines, `writer`), map slots (mapSlotsOf), the rules folder, the identity lines (identityLineOf, IDENTITY_CALLS); display.printsHero and printedHero, the one rule for whether a page prints a hero
lib/prompt-builder.js               # Prompt assembly for each phase
lib/rule-set.js                     # The rule set (phase 3): loadRuleSet(call, {theme}) -> {core, craft}, loadModeBlock(mode, {theme}); reads the theme's rules folder (R14), the journalist's references/rules/*.md
lib/prompt-renderers/
├── record-view.js                  # The record view: <RECORD>, every exposed document in full (never a character sheet) + the investigation's timeline, `<investigation-timeline>` (sales, exposures, adjustments on the session clock; one line formatter, one row filter)
├── session-clock.js                # The session clock: one decision per session (first exposure or sale at 5 PM or later shows AM for PM), for every logged time a prompt prints; the session's span (sessionSpanOf: its first sale or exposure to its last, which the ledger's shift reads through `session-ledger.js` `spanWithFirstSaleOf`, the span with its first sale; K7) and the time-of-day line (timeOfDayLine, phases 14 and 15, brief E, R7)
├── derived-labels.js               # Labels for machine-made material: who made it, and that the record decides
├── director-words-renderer.js      # The director's words: accusation, corrections, whiteboard, photo entries, the judges' <DIRECTOR_STOP_NOTES> (renderDirectorStopNotes; brief B); never paraphrased
├── director-notes-renderer.js      # The director's notes + corrections, <QUOTE_BANK>, <TRANSACTION_LINKS> (account, amount, time on the session clock), <EPILOGUE>
├── session-authors.js              # The article's authors (phases 14 and 15, R4 and R5): Nova's line for the session (writerSignsLine), on site Nova's names for the photo parse and enrichment (writerInPhotosLine) and the photo entries' mark (markWriterInPhoto), filled from the theme's Nova entry (theme-config.js `writer`); the guest reporters read apart (guestReportersOf, the one reading, an older thread's single comma-joined value too; phase 17), their line (guestReporterLine, the writer named from the theme's entry) and their turn-ins' mark (guestTurnInName), [], null or unchanged with none
└── settled-weave.js                # The settled weave, as the director left it at the story meeting, for every later writer, each change marked by its id in the meeting's own form (meetingChangeId, brief 4.14a); <DIRECTOR_ANSWERS> for the fact check (brief 4.5)
lib/writer-questions.js            # The weave's questions for the director (C15) and the director's answers: the shape (WEAVE_QUESTIONS_PROPERTY, WEAVE_QUESTION_KINDS, WEAVE_ANSWER_KEY), weaveQuestionsOf, isAnswered, withoutAnswers, and the carry (carriedWeaveQuestions, with pairWeaveQuestions, the one rule of sameness the carry and the meeting's marks read). The writers' old questions field and its helpers went in phase 4
lib/weave.js                        # The weave (phase 4; angles since phase 4b, piece 3): its shape constants (ANGLE_FIELDS, PICKED_KEY, QUESTION_WORD_BOUND, the meeting's bound), weaveKey, the fact check's mark, isMeetingApproved, meetingRoundOf, the views (weaveForRework, weaveForJudge), the weave checks on the writer's text (weaveFindings, checkWeave), the one reading of an id (weaveIdOf) and rule for a repeated id (repeatedIds) that the meeting's gate, the checks and the diff read, the one reading of the settled story (pickedAngleOf, settledAngleOf, and storyConnections from it), and the pick and the questions' threads after a rework (withPickFrom, withHeldQuestionThreads)
lib/meeting.js                      # The story meeting (brief 4.5): the director-side schema, the payloads (meetingResume), what the stop shows (meetingCheckpointData), and where a meeting change sits as the meeting names the line (meetingChangePlace, brief 4.14a)
lib/map.js                          # The story map (brief 4.6): its schemas (mapSchemaFor, directorMapSchemaFor), its checks (mapFindings, with the bounds of the page as it opens, MAP_WORD_BOUND with the writer's aim MAP_WORD_AIM, and with every synopsis open, MAP_OPEN_WORD_BOUND with the synopses' aim MAP_SYNOPSIS_AIM, piece 4, mapLengthOf and MAP_PAGES; and the director's share they never fail, mapDirectorsShare; phase 4b, brief 1D), the stop's payloads (mapResume) and what it shows (mapCheckpointData, with the meeting's changes by id and place, meetingChangesOf, brief 4.14a; the photo descriptions and the beats the director added, brief 1D; the legend of the settled story's threads, mapLegendOf, piece 4)
lib/word-count.js                   # wordCount, which every length reads: the planning pages', the article's (lib/content-bundle-fact-check.js) and the stops log's words shown; pageLengthOf, the one length rule the story meeting and the map keep (fix round 4)
lib/stop-pages.js                   # The pages the story meeting, the map and the desk show (task 4.12a), and the input review and the character-IDs stop (task 4.12c), as lines of the console's view models' text (meetingView, mapView, deskView; the input review's ten view models, which leave out the director's own notes, task 4.12d; characterIdCards): the e2e harness prints them, and wordsShown counts the words of what the page does not fold. The map's page is the board (piece 4): its synopses fold, and stopPage and wordsShown open them with `synopsesOpen`. PAGE_HEADINGS (each a heading its component renders), PAGE_REGIONS (a part the component names only as an aria-label, which the page does not print; task 4.12d) and the folds are the components' own, held by __tests__/unit/console-stop-pages.test.js
lib/stops-log.js                    # The stops log, data/<id>/stops.jsonl (R8; tasks 4.12a and 4.12c): a line for each pause at a new stop or a new round of one, with its words shown (at the map, `wordsOpen` too, the page with every synopsis open; piece 4), and for each director action; a fresh start's first pause is marked, and a pause after a rollback that wrote its stop again is new (rewritesStop); written by /start and lib/api-background-runner.js
lib/director-words.js               # The director's words as one list (phases 14 and 15, brief B; R1): DIRECTOR_WORDS_SOURCES (the notes, the input-review corrections, the accusation, the answers at the story meeting, the notes at the stops) and directorWordsTexts, which the judges' questions and reads, the fact check's directorText, the verdict guard and the evidence check's "notes" read
lib/accusation-verdict.js           # VERDICT_KINDS, normalizeAccusation (votes, blamesNoCharacter), directorAccusationText (the director's accusation word for word)
lib/session-ledger.js               # The ledger from the session report: Adjustment rows classified (the bonus, named by its stem, paired with a same-minute holding-account reversal, or paid in one row "To <account>" out of the holding account, 100926's shape; a transfer, whose source must be a sale's account or a Final Standings row, else its row is unclassified), account totals and sale counts, the Final Standings check (with the rows parsed, an account the standings list with a non-zero total that no row reached, or whose computed total disagrees, takes the standings' figure, and `computedTotal` keeps what the rows add up to; FINANCIAL_SUMMARY notes such an account and sums the rows; the final fix), the bonus and transfers logged off the game's clock lined up by one whole-hour shift against the span of the sales and exposures, each keeping its `loggedTime` (lineUpOffClockEvents, stamped as `ledgerCheck.clockShift` or `.offClock`; phases 14 and 15, brief C), ledgerReviewOf (the input review)
lib/director-enricher.js            # Opus director-notes enrichment: quote bank and epilogue checked against the director's words, transaction links by opaque row key
lib/evidence.js                     # The evidence underneath (phase 4b, brief 1B): what the weave and the map share. The piece's shape (EVIDENCE_PIECE_SCHEMA: sources, shows, stance, and a beat's card), its sources besides a document (EVIDENCE_SOURCES: the ledger, the evidence log, the director's notes) and what each holds, in one gloss (SOURCES_GLOSS) that the weave writer's Sources line and the article writer's map label print, the evidence check (evidenceProblems, describeEvidenceProblems), the story-terms check (storyTermsProblems, describeStoryTerms, STORY_TERMS_FIX), documentTextsOf (a document id to its quotable text), documentResolverOf and recordDocumentOf (fix round 4: the one rule for "this document is in the record", an id in any case to the record's own id and text, over the documents with text, which the evidence check, the map's card check, the article writer's card line and the article fact check's card fidelity read) and evidenceContextOf (what the checks read from a thread's state)
lib/grounding.js                    # isVerbatimIn / normalizeForGrounding: whether a text is the director's words, word for word; namedOutsideQuote: whether those words name a quote's speaker or addressee; groundQuote: the one rule for a quote's speaker and addressee, which the enricher and the notes renderer both call (the final fix); QUOTED_SPANS, what a quoted span is, which the article fact check and the story-terms check read (phase 4b, brief 1B)
lib/workflow/
├── graph.js                        # LangGraph StateGraph (44 nodes, edges)
├── state.js                        # State annotations, phases, reducers; the stop's round (stopRoundOf) and the note it was sent back with (roundNoteOf)
├── checkpoint-helpers.js           # Native interrupt() helpers (DRY)
└── nodes/
    ├── index.js                    # Node barrel export
    ├── node-helpers.js             # Shared helper functions for nodes
    ├── input-nodes.js              # Raw input parsing
    ├── fetch-nodes.js              # Notion/filesystem data loading
    ├── checkpoint-nodes.js         # Dedicated interrupt() checkpoint nodes
    ├── photo-nodes.js              # Haiku vision analysis
    ├── preprocess-nodes.js         # Batch evidence summarization
    ├── arc-specialist-nodes.js     # The arc writer: the weave in one call (analyzeArcsPlayerFocusGuided, the graph's analyzeArcs), the weave checks' node (validateArcStructure, validateArcs) and the arc rework (reviseArcs)
    ├── evaluator-nodes.js          # The two truth-only judges (the story meeting's fact check, the article judge) and the article's fact check
    ├── ai-nodes.js                 # Curation, the map writer and its rework, the article writer and its rework
    ├── map-nodes.js                # The map checks' node (checkMap; brief 4.6)
    ├── character-data-nodes.js     # Character extraction and processing
    ├── contradiction-nodes.js      # The director's sentences about Blake and the Valet, as one narrative tension
    └── template-nodes.js           # HTML assembly
lib/schemas/
├── content-bundle.schema.json      # Final article content structure (descriptions shape only, phase 3)
├── preprocessed-evidence.schema.json # Batch-summarized evidence items
└── outline.schema.json             # The story map (brief 4.6): beats and photos in the theme's slots, which lib/map.js mapSchemaFor fills in code
```

**Notion data layer (unified):** `lib/notion/` is the single source of truth — `databases.js` (DB IDs, query filters, the `RELATION_REGISTRY` + `ENTITY_RELATIONS`), `parse.js` (pure page→element parsers, emit relation IDs not names), `relations.js` (pure registry-driven `applyRelationNames` join). `NotionClient` (uncached) and `CachedNotionClient` (server-only decorator) both consume it; the standalone `journalist-report` skill scripts are thin wrappers over the uncached `NotionClient`. Resolved relation names are produced by a **read-time join**: the cache stores element relation IDs + a separately freshness-checked name table per target DB (`character` ← Characters DB), so renaming a related page (e.g. a character) is reflected on the next fetch without a manual cache clear. Add a resolved relation by adding one `RELATION_REGISTRY` entry + listing it in `ENTITY_RELATIONS`. (`Container` is intentionally not resolved — it exists in-game but is irrelevant to reports.)
