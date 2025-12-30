/**
 * LangGraph Studio Entry Point
 *
 * Exports the compiled report generation graph for Studio visualization.
 * Studio expects a module with a default export of the compiled graph.
 *
 * Usage:
 *   npx @langchain/langgraph-cli dev
 *
 * @module studio/entry
 */

const { createReportGraph } = require('../workflow/graph');

// Create compiled graph with MemorySaver for Studio
// Studio handles checkpointing internally, but MemorySaver works for visualization
const graph = createReportGraph();

// Named export for LangGraph CLI (requires <file>:<export> format)
module.exports.graph = graph;

// Also export as default for ES module compatibility
module.exports.default = graph;
