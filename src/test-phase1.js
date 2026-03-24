/**
 * Phase 1 Smoke Test
 * Run: node src/test-phase1.js
 *
 * Tests:
 *   1. notionClient — queries Decision Log DB (should return 0 results initially)
 *   2. claudeClient — sends a hello world prompt, verifies response
 *   3. logger — verifies log output appears
 */

import 'dotenv/config';
import notionClient from './clients/notionClient.js';
import claudeClient from './clients/claudeClient.js';
import logger from './utils/logger.js';

async function testLogger() {
  console.log('\n--- Test 1: Logger ---');
  logger.info('Logger is working ✓');
  logger.debug('Debug level message (only visible if LOG_LEVEL=debug)');
  logger.warn('Warn level message');
  console.log('Logger test passed ✓\n');
}

async function testNotionClient() {
  console.log('--- Test 2: Notion Client ---');

  if (!process.env.NOTION_DECISION_LOG_DB) {
    console.log('⚠️  NOTION_DECISION_LOG_DB not set in .env — skipping Notion test');
    return;
  }

  try {
    const result = await notionClient.queryDatabase(
      process.env.NOTION_DECISION_LOG_DB,
      {} // no filter — returns all rows
    );
    console.log(`✓ Notion connection successful`);
    console.log(`  Found ${result.results.length} decision(s) in Decision Log`);
    console.log('Notion client test passed ✓\n');
  } catch (error) {
    console.error(`✗ Notion client test failed: ${error.message}`);
    console.error('  Check your NOTION_TOKEN and NOTION_DECISION_LOG_DB in .env');
    console.error('  Also check that your integration is connected to the database\n');
  }
}

async function testClaudeClient() {
  console.log('--- Test 3: Claude Client ---');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY not set in .env — skipping Claude test');
    return;
  }

  try {
    const response = await claudeClient.analyze(
      'You are a helpful assistant. Respond only in plain text, no markdown.',
      'Say exactly: "Claude client is working correctly." and nothing else.'
    );
    console.log(`✓ Claude response: "${response.trim()}"`);
    console.log('Claude client test passed ✓\n');
  } catch (error) {
    console.error(`✗ Claude client test failed: ${error.message}`);
    console.error('  Check your ANTHROPIC_API_KEY in .env\n');
  }
}

async function testClaudeJson() {
  console.log('--- Test 4: Claude JSON parsing ---');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY not set in .env — skipping JSON test');
    return;
  }

  try {
    const result = await claudeClient.analyzeJson(
      'You are a helpful assistant. Respond ONLY with valid JSON, no markdown, no explanation.',
      'Return this exact JSON: {"status": "ok", "message": "JSON parsing works"}'
    );
    console.log(`✓ Parsed JSON:`, result);
    console.log('Claude JSON test passed ✓\n');
  } catch (error) {
    console.error(`✗ Claude JSON test failed: ${error.message}\n`);
  }
}

// Run all tests
async function runAll() {
  console.log('========================================');
  console.log('  Phase 1 Smoke Test');
  console.log('========================================\n');

  await testLogger();
  await testNotionClient();
  await testClaudeClient();
  await testClaudeJson();

  console.log('========================================');
  console.log('  Smoke test complete');
  console.log('========================================');
}

runAll();
