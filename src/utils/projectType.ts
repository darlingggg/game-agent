import type { ProjectType } from '@/http/project'

/** 合法项目类型集合 */
const PROJECT_TYPES: readonly ProjectType[] = ['tool', '2d', '3d']

/**
 * 将任意值解析为项目类型，非法或空则兜底为 tool
 * @param value 接口或本地可能缺失的 type
 */
export function resolveProjectType(value: unknown): ProjectType {
  if (typeof value === 'string' && (PROJECT_TYPES as readonly string[]).includes(value)) {
    return value as ProjectType
  }
  return 'tool'
}

/** 项目类型中文/短文案 */
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  tool: '工具',
  '2d': '2D游戏',
  '3d': '3D游戏',
}

/** 列表卡片修饰 class（色条 / 图标底色 / 标签） */
export const PROJECT_TYPE_CLASS: Record<ProjectType, string> = {
  tool: 'project-type--tool',
  '2d': 'project-type--2d',
  '3d': 'project-type--3d',
}
