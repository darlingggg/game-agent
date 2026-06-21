/** 文件后缀与 Monaco 语言标识映射 */
const FILE_EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.vue': 'html',
  '.json': 'json',
  '.html': 'html',
  '.md': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.yaml': 'yaml',
  '.yml': 'yaml',
}

/**
 * 根据文件路径获取 Monaco 语言标识
 * @param filePath 文件相对路径
 */
export function getMonacoLanguage(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) return 'plaintext'

  const extension = filePath.slice(dotIndex).toLowerCase()
  return FILE_EXTENSION_LANGUAGE_MAP[extension] ?? 'plaintext'
}
