import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CACHE_DIR = join(homedir(), 'Library', 'Application Support', 'Nash', 'cache');
const TERMS_CACHE_FILE = join(CACHE_DIR, 'terms-of-service.md');
const TERMS_URL = 'https://1mcp.ai/terms-of-service.md';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CachedTerms {
  content: string;
  timestamp: number;
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readCachedTerms(): CachedTerms | null {
  try {
    if (existsSync(TERMS_CACHE_FILE)) {
      const cached = JSON.parse(readFileSync(TERMS_CACHE_FILE, 'utf-8'));
      if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached;
      }
    }
  } catch (error) {
    console.error('Error reading cached terms:', error);
  }
  return null;
}

function writeTermsCache(content: string) {
  try {
    ensureCacheDir();
    writeFileSync(
      TERMS_CACHE_FILE,
      JSON.stringify({ content, timestamp: Date.now() })
    );
  } catch (error) {
    console.error('Error writing terms cache:', error);
  }
}

export async function getTermsOfService(): Promise<string> {
  // Try to get from cache first
  const cached = readCachedTerms();
  if (cached) {
    return cached.content;
  }

  try {
    // Fetch fresh terms
    const response = await fetch(TERMS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch terms: ${response.statusText}`);
    }
    const content = await response.text();

    // Cache the fresh terms
    writeTermsCache(content);
    
    return content;
  } catch (error) {
    console.error('Error fetching terms:', error);
    throw error;
  }
} 