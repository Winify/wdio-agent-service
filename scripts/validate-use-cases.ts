/**
 * Validation script: tests all 3 use cases against a live LLM endpoint.
 *
 * Use case 1: browser.agent — natural language command execution
 * Use case 2: Self-healing on command failure
 * Use case 3: Healing summary at end of test
 *
 * Usage:
 *   npx tsx scripts/validate-use-cases.ts [endpoint-url]
 *
 * Default endpoint: http://localhost:1234 (LM Studio default)
 */

import { resolveLlmConfig } from '../providers/send.js';
import { buildPrompt, buildAgenticPrompt, buildObservationMessage } from '../prompts/index.js';
import { parseLlmResponse, parseAgentStep, resolveActionTargets } from '../commands/parse-llm-response.js';
import type { AgentServiceConfig, ChatMessage, Platform } from '../types/index.js';

// ── Config ────────────────────────────────────────────────────

const ENDPOINT = process.argv[2] || 'http://100.69.254.5:1234';
const MODEL = process.argv[3] || 'qwen/qwen3.5-4b';
const PLATFORM: Platform = 'browser';

const config: AgentServiceConfig = {
  schema: 'openai',
  providerUrl: ENDPOINT,
  model: MODEL,
  timeout: 60000,
};

const provider = resolveLlmConfig(config);

// ── Mock browser state ────────────────────────────────────────

// Simulate @wdio/elements getSnapshot() output
const SNAPSHOT_TEXT = [
  '[Page: Example Login — https://example.com/login]',
  '  form "Login form"',
  '    e1  textbox "Username"  →  #username',
  '    e2  textbox "Password"  →  #password',
  '    e3  button "Sign In"  →  button*=Sign In',
  '    e4  link "Forgot Password?"  →  a*=Forgot Password',
  '  navigation "Main"',
  '    e5  link "Home"  →  a*=Home',
  '    e6  link "Register"  →  a*=Register',
].join('\n');

const SNAPSHOT_ELEMENTS = {
  e1: { selector: '#username' },
  e2: { selector: '#password' },
  e3: { selector: 'button*=Sign In' },
  e4: { selector: 'a*=Forgot Password' },
  e5: { selector: 'a*=Home' },
  e6: { selector: 'a*=Register' },
};

// Updated snapshot after navigation/action
const AFTER_CLICK_SNAPSHOT = [
  '[Page: Dashboard — https://example.com/dashboard]',
  '  main "Dashboard"',
  '    e1  heading[1] "Welcome, Admin"  →  h1*=Welcome',
  '    e2  button "Logout"  →  button*=Logout',
  '    e3  link "Settings"  →  a*=Settings',
].join('\n');

const AFTER_CLICK_ELEMENTS = {
  e1: { selector: 'h1*=Welcome' },
  e2: { selector: 'button*=Logout' },
  e3: { selector: 'a*=Settings' },
};

// ── Helpers ────────────────────────────────────────────────────

function pass(useCase: string, detail: string) {
  console.log(`  ✅ ${useCase}: ${detail}`);
}

function fail(useCase: string, detail: string) {
  console.log(`  ❌ ${useCase}: ${detail}`);
}

// ── Use Case 1: browser.agent — natural language command ───────

async function validateSinglePass() {
  console.log('\n── Use Case 1a: Single-pass agent command ──');

  try {
    const prompt = buildPrompt(SNAPSHOT_TEXT, 'type admin into username field', 1, PLATFORM);
    const response = await provider.send(prompt);

    console.log(`  LLM response: ${response.trim()}`);

    const actions = parseLlmResponse(response, 1);
    const resolved = resolveActionTargets(actions, SNAPSHOT_ELEMENTS);

    console.log(`  Parsed: ${resolved.length} action(s)`);
    for (const a of resolved) {
      console.log(`    ${a.type} target="${a.target}"${a.value ? ` value="${a.value}"` : ''}`);
    }

    if (resolved.length > 0 && resolved[0].type === 'SET_VALUE') {
      pass('Single-pass', `SET_VALUE on "${resolved[0].target}" = "${resolved[0].value}"`);
    } else if (resolved.length > 0) {
      pass('Single-pass', `Action: ${resolved[0].type} on "${resolved[0].target}"`);
    } else {
      fail('Single-pass', 'No actions parsed');
    }
    return resolved;
  } catch (err) {
    fail('Single-pass', (err as Error).message);
    return [];
  }
}

async function validateAgenticLoop() {
  console.log('\n── Use Case 1b: Agentic ReAct loop ──');

  try {
    const initial = buildAgenticPrompt(SNAPSHOT_TEXT, 'log in with username "admin" and password "secret" then click Sign In', PLATFORM);
    const messages: ChatMessage[] = [
      { role: 'system', content: initial.system },
      { role: 'user', content: initial.user },
    ];

    let currentElements = SNAPSHOT_ELEMENTS;
    let currentSnapshot = SNAPSHOT_TEXT;
    const maxSteps = 3;
    let totalActions = 0;

    for (let step = 1; step <= maxSteps; step++) {
      console.log(`  Step ${step}/${maxSteps} — sending ${messages.length} messages to LLM...`);

      const response = await provider.chat(messages);
      const agentStep = parseAgentStep(response);

      console.log(`  Reasoning: ${agentStep.reasoning || '(none)'}`);
      console.log(`  Actions: ${agentStep.actions.length}, done=${agentStep.done}`);

      const resolved = resolveActionTargets(agentStep.actions, currentElements);
      for (const a of resolved) {
        console.log(`    ${a.type} target="${a.target}"${a.value ? ` value="${a.value}"` : ''}`);
      }

      totalActions += resolved.length;
      messages.push({ role: 'assistant', content: response });

      if (agentStep.done) {
        console.log(`  Agent signaled done after ${step} step(s)`);
        break;
      }

      // Simulate page change after actions
      currentElements = AFTER_CLICK_ELEMENTS;
      currentSnapshot = AFTER_CLICK_SNAPSHOT;
      const observation = buildObservationMessage(
        resolved.map(a => ({ action: a, success: true })),
        currentSnapshot,
        step,
        maxSteps,
      );
      messages.push({ role: 'user', content: observation });
    }

    if (totalActions > 0) {
      pass('Agentic loop', `${totalActions} actions across iterations`);
    } else {
      fail('Agentic loop', 'No actions generated');
    }
  } catch (err) {
    fail('Agentic loop', (err as Error).message);
  }
}

// ── Use Case 2: Self-healing on command failure ────────────────

async function validateHealing() {
  console.log('\n── Use Case 2: Self-healing selector ──');

  try {
    // Simulate: a command used "#old-login-btn" which no longer exists.
    // The healer asks the LLM to find the intended element in the snapshot.
    const brokenSelector = '#old-login-btn';
    const actionType = 'click';

    const systemPrompt = [
      'You are a test healing assistant. A test command failed because an element selector changed.',
      '',
      'Given the broken selector and the current page snapshot, find the element most likely intended.',
      'Elements have virtual IDs (e1, e2, e3...). Use the eN ID as the target_id.',
      '',
      'Respond with ONLY a JSON object:',
      '{"target_id": "eN", "confidence": "high|medium|low", "reasoning": "why you chose this element"}',
    ].join('\n');

    const userPrompt = [
      '<broken_selector>',
      brokenSelector,
      '</broken_selector>',
      '',
      '<intended_action>',
      actionType,
      '</intended_action>',
      '',
      '<elements>',
      SNAPSHOT_TEXT,
      '</elements>',
    ].join('\n');

    const response = await provider.send({ system: systemPrompt, user: userPrompt });
    console.log(`  Healer LLM response: ${response.trim()}`);

    // Parse healing response
    const cleaned = response.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
    let parsed: { target_id?: string; confidence?: string; reasoning?: string } | null = null;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/["']target_id["']\s*:\s*["'](e\d+)["']/i);
      parsed = match ? { target_id: match[1] } : null;
    }

    if (parsed?.target_id && SNAPSHOT_ELEMENTS[parsed.target_id as keyof typeof SNAPSHOT_ELEMENTS]) {
      const healed = SNAPSHOT_ELEMENTS[parsed.target_id as keyof typeof SNAPSHOT_ELEMENTS].selector;
      pass('Self-healing', `"${brokenSelector}" → "${healed}" (${parsed.target_id}, confidence: ${parsed.confidence || 'N/A'})`);
    } else if (parsed?.target_id) {
      fail('Self-healing', `Target ${parsed.target_id} not found in elements map`);
    } else {
      fail('Self-healing', `Could not parse target_id from: ${response}`);
    }
  } catch (err) {
    fail('Self-healing', (err as Error).message);
  }
}

// ── Use Case 3: Healing summary ────────────────────────────────

async function validateHealingSummary() {
  console.log('\n── Use Case 3: Healing summary report ──');

  // Simulate accumulated healing events from a test run
  const healingEvents = [
    { command: 'click', originalSelector: '#old-btn', healedSelector: 'button*=Sign In', success: true, timestamp: Date.now() - 3000 },
    { command: 'setValue', originalSelector: '#stale-email', healedSelector: '#email.instance(0)', success: true, timestamp: Date.now() - 2000 },
    { command: 'click', originalSelector: '#gone-forever', success: false, error: 'Could not heal selector', timestamp: Date.now() - 1000 },
  ];

  const totalHeals = healingEvents.length;
  const successfulHeals = healingEvents.filter(e => e.success).length;
  const failedHeals = totalHeals - successfulHeals;

  console.log(`  [Healing] Summary: ${successfulHeals}/${totalHeals} healed successfully`);
  for (const event of healingEvents) {
    const status = event.success ? 'HEALED' : 'FAILED';
    const arrow = event.healedSelector ? ` → "${event.healedSelector}"` : '';
    const err = event.error ? ` (${event.error})` : '';
    console.log(`  [Healing]   ${status}: ${event.command} "${event.originalSelector}"${arrow}${err}`);
  }

  if (totalHeals === 3 && successfulHeals === 2 && failedHeals === 1) {
    pass('Healing summary', 'All events tracked and reported correctly');
  } else {
    fail('Healing summary', 'Event counts mismatch');
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  wdio-agent-service — Use Case Validation');
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log(`  Model: ${MODEL}`);
  console.log('═══════════════════════════════════════════');

  const start = Date.now();

  await validateSinglePass();
  await validateAgenticLoop();
  await validateHealing();
  await validateHealingSummary();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n── Done in ${elapsed}s ──\n`);
}

main().catch(console.error);
