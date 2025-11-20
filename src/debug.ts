/**
 * Debug logging utilities for sloppy-parser
 * 
 * Usage:
 *   import { setDebugLevel, debug } from './debug';
 *   
 *   setDebugLevel('verbose'); // or 'basic' or 'silent'
 *   debug.basic('parser', 'Starting parse');
 *   debug.verbose('tokenizer', 'Token:', token);
 */

export type DebugLevel = 'silent' | 'basic' | 'verbose';

let currentLevel: DebugLevel = 'silent';

/**
 * Set the global debug level
 */
export function setDebugLevel(level: DebugLevel): void {
  currentLevel = level;
}

/**
 * Get current debug level
 */
export function getDebugLevel(): DebugLevel {
  return currentLevel;
}

/**
 * Check if a level should log
 */
function shouldLog(level: DebugLevel): boolean {
  if (currentLevel === 'silent') return false;
  if (currentLevel === 'verbose') return true;
  // currentLevel === 'basic'
  return level === 'basic';
}

/**
 * Basic logging - high-level operations
 */
function logBasic(component: string, ...args: any[]): void {
  if (shouldLog('basic')) {
    console.log(`[${component.toUpperCase()}]`, ...args);
  }
}

/**
 * Verbose logging - detailed internal operations
 */
function logVerbose(component: string, ...args: any[]): void {
  if (shouldLog('verbose')) {
    console.log(`[${component.toUpperCase()}]`, ...args);
  }
}

/**
 * Debug object with logging methods
 */
export const debug = {
  basic: logBasic,
  verbose: logVerbose,
};

/**
 * Initialize debug level from environment variable if present
 */
if (typeof process !== 'undefined' && process.env) {
  const envLevel = process.env.SLOPPY_DEBUG;
  if (envLevel === 'basic' || envLevel === 'verbose') {
    setDebugLevel(envLevel);
  }
}

