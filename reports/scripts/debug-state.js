#!/usr/bin/env node
/**
 * Debug script to inspect current workflow state
 */
require('dotenv').config();

const password = process.env.ACCESS_PASSWORD;

async function main() {
  // Login
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

  if (loginRes.status !== 200) {
    console.error('Login failed');
    return;
  }

  // Get current state
  const stateRes = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({ sessionId: '20251221', theme: 'journalist' })
  });
  const state = await stateRes.json();

  console.log('=== WORKFLOW STATE ===');
  console.log('Phase:', state.currentPhase);
  console.log('Awaiting Approval:', state.awaitingApproval);
  console.log('Approval Type:', state.approvalType);
  console.log('Arc Revision Count:', state.arcRevisionCount);

  console.log('\n=== ARCS ===');
  if (state.narrativeArcs) {
    state.narrativeArcs.forEach((arc, i) => {
      console.log(`\nArc ${i+1}: ${arc.name || arc.title || 'Untitled'}`);
      console.log(`  Emphasis: ${arc.playerEmphasis || 'N/A'}`);
      if (arc.summary) {
        console.log(`  Summary: ${arc.summary.substring(0, 120)}...`);
      }
      if (arc.charactersFeatured) {
        console.log(`  Characters: ${arc.charactersFeatured.join(', ')}`);
      }
    });
  } else {
    console.log('No arcs available');
  }

  console.log('\n=== VALIDATION ===');
  if (state.validationResults) {
    console.log('Overall Score:', state.validationResults.overallScore);
    console.log('Ready:', state.validationResults.ready);
    console.log('Feedback:', state.validationResults.feedback?.substring(0, 200));
    if (state.validationResults.issues?.length) {
      console.log('Issues:');
      state.validationResults.issues.slice(0, 5).forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }
    if (state.validationResults.criteriaScores) {
      console.log('Criteria Scores:');
      Object.entries(state.validationResults.criteriaScores).forEach(([key, val]) => {
        console.log(`  ${key}: ${val.score} - ${val.notes || ''}`);
      });
    }
  } else {
    console.log('No validation results');
  }
}

main().catch(e => console.error('Error:', e.message));
