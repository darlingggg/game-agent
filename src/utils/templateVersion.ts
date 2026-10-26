/** 模板版本按数字段比较，避免把 1.10 判断成低于 1.9。 */
export function compareTemplateVersions(a: string, b: string): number {
  const parse = (version: string) =>
    version
      .trim()
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const partsA = parse(a)
  const partsB = parse(b)
  for (let index = 0; index < Math.max(partsA.length, partsB.length); index++) {
    const difference = (partsA[index] ?? 0) - (partsB[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
