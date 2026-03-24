import { Client } from '@notionhq/client';
import 'dotenv/config';
import logger from '../utils/logger.js';

// Initialise the Notion client once — reused across all calls
//const notion = new Client({ auth: process.env.NOTION_TOKEN });
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2022-06-28',
});

// Rate limit helper — Notion allows 3 req/sec, so we pause 350ms between bulk ops
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a single Notion page with all its properties.
 * @param {string} pageId - The Notion page ID (with or without hyphens)
 * @returns {Object} Full Notion page object
 */
async function getPage(pageId) {
  try {
    const response = await notion.pages.retrieve({
      page_id: pageId,
    });
    logger.debug(`getPage: fetched page ${pageId}`);
    return response;
  } catch (error) {
    logger.error(`getPage failed for ${pageId}: ${error.message}`);
    throw error;
  }
}

/**
 * Query a Notion database with optional filters and sorts.
 * @param {string} databaseId - The database ID
 * @param {Object} filter - Notion filter object (optional)
 * @param {Array}  sorts   - Notion sorts array (optional)
 * @returns {Object} Notion query response with .results array
 */
async function queryDatabase(databaseId, filter = {}, sorts = []) {
  try {
    const params = { database_id: databaseId };
    if (Object.keys(filter).length > 0) params.filter = filter;
    if (sorts.length > 0) params.sorts = sorts;

    const response = await notion.databases.query(params);
    logger.debug(`queryDatabase: ${response.results.length} results from ${databaseId}`);
    return response;
  } catch (error) {
    logger.error(`queryDatabase failed for ${databaseId}: ${error.message}`);
    throw error;
  }
}

/**
 * Create a new page inside a Notion database.
 * @param {string} databaseId  - Parent database ID
 * @param {Object} properties  - Notion property object (typed values)
 * @param {Array}  bodyBlocks  - Array of Notion block objects for the page body
 * @returns {string} The newly created page's ID
 */
async function createPage(databaseId, properties, bodyBlocks = []) {
  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });

    const pageId = response.id;
    logger.debug(`createPage: created page ${pageId} in database ${databaseId}`);

    // Append body blocks if provided
    // Notion's createPage doesn't support body content inline — we append separately
    if (bodyBlocks.length > 0) {
      await appendBlocks(pageId, bodyBlocks);
    }

    return pageId;
  } catch (error) {
    logger.error(`createPage failed in ${databaseId}: ${error.message}`);
    throw error;
  }
}

/**
 * Update properties of an existing Notion page.
 * @param {string} pageId     - The page to update
 * @param {Object} properties - Notion property object with new values
 * @returns {Object} Updated page object
 */
async function updatePage(pageId, properties) {
  try {
    const response = await notion.pages.update({
      page_id: pageId,
      properties,
    });
    logger.debug(`updatePage: updated page ${pageId}`);
    return response;
  } catch (error) {
    logger.error(`updatePage failed for ${pageId}: ${error.message}`);
    throw error;
  }
}

/**
 * Append block content to a Notion page body.
 * Automatically chunks into batches of 100 (Notion API limit per request).
 * Adds a 350ms delay between batches to respect rate limits.
 * @param {string} pageId - The page to append to
 * @param {Array}  blocks - Array of Notion block objects
 */
async function appendBlocks(pageId, blocks) {
  try {
    // Notion allows max 100 blocks per append call
    const BATCH_SIZE = 100;

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);

      await notion.blocks.children.append({
        block_id: pageId,
        children: batch,
      });

      logger.debug(`appendBlocks: appended batch ${Math.floor(i / BATCH_SIZE) + 1} to page ${pageId}`);

      // Rate limit pause between batches
      if (i + BATCH_SIZE < blocks.length) {
        await sleep(350);
      }
    }
  } catch (error) {
    logger.error(`appendBlocks failed for ${pageId}: ${error.message}`);
    throw error;
  }
}

export default {
  getPage,
  queryDatabase,
  createPage,
  updatePage,
  appendBlocks,
  sleep, // exported so other modules can use it for rate limiting
};
export const notionClient = { getPage, queryDatabase, createPage, updatePage, appendBlocks, sleep };