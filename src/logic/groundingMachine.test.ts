import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUNDING_STEPS,
  GUIDED_AUDIO_SCRIPTS,
  HAPTIC_PATTERNS,
  triggerHaptic,
  formatDuration,
  createStartedEvent,
  createStepCompletedEvent,
  createAudioPlayedEvent,
  createToolCompletedEvent,
  calculateSummaryMetrics,
  calculateAverageDwellTime,
  calculateSomaticShift,
  getDistressLabel,
  StepRecord,
  AnchorActivation,
} from './groundingMachine';

test('GROUNDING_STEPS includes succinct scripts and clinical cues for all 5 steps', () => {
  assert.equal(GROUNDING_STEPS.length, 5);
  for (const step of GROUNDING_STEPS) {
    assert.ok(step.guidedAudioScript, `Step ${step.stepNumber} should have guided audio script`);
    assert.equal(step.guidedAudioScript, GUIDED_AUDIO_SCRIPTS[step.stepNumber]);
    assert.ok(step.clinicalCue, 'Should have clinicalCue');
  }
});

test('calculateAverageDwellTime computes accurate dwell intervals or fallback', () => {
  const activations: AnchorActivation[] = [
    { stepNumber: 5, nodeIndex: 0, timestamp: 1000 },
    { stepNumber: 5, nodeIndex: 1, timestamp: 6000 }, // 5s dwell
    { stepNumber: 5, nodeIndex: 2, timestamp: 11000 }, // 5s dwell
    { stepNumber: 5, nodeIndex: 3, timestamp: 16000 }, // 5s dwell
  ];
  const avg = calculateAverageDwellTime(activations, 25, 4);
  assert.equal(avg, 5.0);

  // Fallback case with single activation
  const singleActivation: AnchorActivation[] = [
    { stepNumber: 5, nodeIndex: 0, timestamp: 1000 },
  ];
  const fallbackAvg = calculateAverageDwellTime(singleActivation, 20, 4);
  assert.equal(fallbackAvg, 5.0);
});

test('calculateSomaticShift accurately derives distress reduction and badge', () => {
  const activations: AnchorActivation[] = [
    { stepNumber: 5, nodeIndex: 0, timestamp: 1000 },
    { stepNumber: 5, nodeIndex: 1, timestamp: 5800 }, // 4.8s dwell
    { stepNumber: 5, nodeIndex: 2, timestamp: 10800 }, // 5.0s dwell
  ];

  const shiftCalmer = calculateSomaticShift(4, 'Calmer 🌿', activations, 50, 10);
  assert.equal(shiftCalmer.initialDistress, 4);
  assert.ok(shiftCalmer.deltaReduction > 1.5, 'Should indicate significant reduction');
  assert.equal(shiftCalmer.vagalStatusBadge, 'Parasympathetic Downregulation');
  assert.ok(shiftCalmer.isPacingOptimal, 'Dwell between 4-6s is optimal');

  const shiftSame = calculateSomaticShift(3, 'Same ⚖️', activations, 30, 8);
  assert.equal(shiftSame.vagalStatusBadge, 'Autonomic Stabilization');
});

test('HAPTIC_PATTERNS defines calm subtle vibration sequences', () => {
  assert.ok(Array.isArray(HAPTIC_PATTERNS.tap));
  assert.ok(Array.isArray(HAPTIC_PATTERNS.chipToggle));
  assert.ok(Array.isArray(HAPTIC_PATTERNS.buttonPress));
  assert.ok(Array.isArray(HAPTIC_PATTERNS.stepComplete));
  assert.ok(Array.isArray(HAPTIC_PATTERNS.sessionComplete));

  for (const [key, pattern] of Object.entries(HAPTIC_PATTERNS)) {
    for (const duration of pattern) {
      assert.ok(duration <= 60, `Haptic pulse in ${key} should remain calm and subtle (<= 60ms)`);
    }
  }
});

test('triggerHaptic returns false safely in non-browser or disabled contexts', () => {
  assert.equal(triggerHaptic('tap', false), false);
  assert.equal(triggerHaptic('chipToggle', true), false);
});

test('formatDuration formats seconds correctly into readable mm:ss or seconds', () => {
  assert.equal(formatDuration(14), '14s');
  assert.equal(formatDuration(60), '1m 0s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.equal(formatDuration(0.4), '1s');
});

test('getDistressLabel maps 1-5 correctly to clinical labels', () => {
  assert.match(getDistressLabel(1), /Mild/);
  assert.match(getDistressLabel(5), /Overwhelming/);
});

test('calculateSummaryMetrics accurately computes completed, skipped, audio-guided, and total items', () => {
  const records: StepRecord[] = [
    {
      stepNumber: 5,
      senseKey: 'sight',
      senseName: 'Sight',
      targetCount: 5,
      itemsNoticed: ['Lamp', 'Window', 'Hands', 'Wall', 'Desk'],
      skipped: false,
      durationSeconds: 22,
      guidedAudioPlayed: true,
    },
    {
      stepNumber: 4,
      senseKey: 'touch',
      senseName: 'Touch',
      targetCount: 4,
      itemsNoticed: ['Feet on floor', 'Chair support'],
      skipped: false,
      durationSeconds: 15,
      guidedAudioPlayed: false,
    },
    {
      stepNumber: 3,
      senseKey: 'sound',
      senseName: 'Sound',
      targetCount: 3,
      itemsNoticed: [],
      skipped: true,
      durationSeconds: 5,
      guidedAudioPlayed: false,
    },
    {
      stepNumber: 2,
      senseKey: 'smell',
      senseName: 'Smell',
      targetCount: 2,
      itemsNoticed: ['Fresh air', 'Coffee'],
      skipped: false,
      durationSeconds: 10,
      guidedAudioPlayed: true,
    },
    {
      stepNumber: 1,
      senseKey: 'taste',
      senseName: 'Taste',
      targetCount: 1,
      itemsNoticed: ['Mint'],
      skipped: false,
      durationSeconds: 8,
      guidedAudioPlayed: true,
    },
  ];

  const metrics = calculateSummaryMetrics(records);
  assert.equal(metrics.completedCount, 4);
  assert.equal(metrics.skippedCount, 1);
  assert.equal(metrics.totalItems, 10);
  assert.equal(metrics.audioGuidedStepsCount, 3);
  assert.equal(metrics.allStepsCount, 5);
});
