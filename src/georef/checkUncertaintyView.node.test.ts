import test from 'node:test'
import assert from 'node:assert/strict'
import { checkInterpretationDisplay, sortUncertainChecks } from './checkUncertaintyView.ts'
import type { UncertainCheckDiagnostic } from './checkUncertainty.ts'

function d(id: string, z: number, interpretation: UncertainCheckDiagnostic['interpretation']): UncertainCheckDiagnostic {
  return { controlId: id, residualM: z * 5, pixelSigmaPx: 1, groundSigmaM: 5, localMetersPerPixel: 1, effectiveSigmaM: 5, standardizedResidual: z, interpretation, calibrationSource: 'explicit-evidence' }
}

test('check interpretation labels remain diagnostic rather than pass/fail replacement', () => {
  assert.deepEqual(checkInterpretationDisplay('compatible'), { label: '≤2σ compatible', tone: 'pass' })
  assert.deepEqual(checkInterpretationDisplay('tension'), { label: '2–3σ tension', tone: 'review' })
  assert.deepEqual(checkInterpretationDisplay('inconsistent'), { label: '>3σ inconsistent', tone: 'fail' })
})

test('sorts inconsistent checks first and highest standardized residual first within status', () => {
  const sorted = sortUncertainChecks([
    d('c1', 1.2, 'compatible'),
    d('c2', 3.5, 'inconsistent'),
    d('c3', 4.8, 'inconsistent'),
    d('c4', 2.4, 'tension'),
  ])
  assert.deepEqual(sorted.map((item) => item.controlId), ['c3', 'c2', 'c4', 'c1'])
})
