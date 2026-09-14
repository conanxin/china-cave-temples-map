const EPSILON = 1e-12

export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = matrix.length
  if (!n || matrix.some((row) => row.length !== n) || rhs.length !== n) {
    throw new Error('linear system must be square')
  }

  const augmented = matrix.map((row, i) => [...row, rhs[i]])
  let scale = 0
  for (const row of matrix) for (const value of row) scale = Math.max(scale, Math.abs(value))
  const tolerance = Math.max(EPSILON, scale * 1e-12)

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col
    let pivotAbs = Math.abs(augmented[col][col])
    for (let row = col + 1; row < n; row += 1) {
      const candidate = Math.abs(augmented[row][col])
      if (candidate > pivotAbs) {
        pivotAbs = candidate
        pivotRow = row
      }
    }
    if (pivotAbs <= tolerance) throw new Error('singular or ill-conditioned control geometry')
    if (pivotRow !== col) [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]]

    const pivot = augmented[col][col]
    for (let j = col; j <= n; j += 1) augmented[col][j] /= pivot

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = augmented[row][col]
      if (Math.abs(factor) <= EPSILON) continue
      for (let j = col; j <= n; j += 1) augmented[row][j] -= factor * augmented[col][j]
    }
  }

  return augmented.map((row) => row[n])
}

export function solveLeastSquares(rows: number[][], values: number[]): number[] {
  if (!rows.length || rows.length !== values.length) throw new Error('least-squares rows and values must match')
  const columns = rows[0].length
  if (!columns || rows.some((row) => row.length !== columns)) throw new Error('least-squares matrix has inconsistent rows')
  if (rows.length < columns) throw new Error('least-squares system is underdetermined')

  const normal = Array.from({ length: columns }, () => Array(columns).fill(0)) as number[][]
  const rhs = Array(columns).fill(0) as number[]

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]
    const value = values[r]
    for (let i = 0; i < columns; i += 1) {
      rhs[i] += row[i] * value
      for (let j = 0; j < columns; j += 1) normal[i][j] += row[i] * row[j]
    }
  }

  return solveLinearSystem(normal, rhs)
}
