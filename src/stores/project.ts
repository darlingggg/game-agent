import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { projectItem } from '@/http/project'

/** 项目 Store，管理项目列表与当前编辑项目 */
export const useProjectStore = defineStore(
  'project',
  () => {
    /** 项目列表 */
    const projectList = ref<projectItem[]>([])

    /** 当前正在编辑的项目 */
    const currentProject = ref<projectItem | null>(null)

    /** 当前项目目录绝对路径 */
    const projectDirPath = computed(() => currentProject.value?.dirPath ?? '')

    /**
     * 设置项目列表
     * @param list 项目列表
     */
    function setProjectList(list: projectItem[]) {
      projectList.value = list
    }

    /**
     * 设置当前项目
     * @param project 项目信息，传 null 表示清空
     */
    function setCurrentProject(project: projectItem | null) {
      currentProject.value = project
    }

    /**
     * 根据 ID 从列表中查找项目
     * @param id 项目 ID
     */
    function getProjectById(id: number) {
      return projectList.value.find((item) => item.id === id)
    }

    /**
     * 获取当前项目目录，未就绪时抛出错误
     */
    function requireProjectDirPath(): string {
      const dirPath = projectDirPath.value
      if (!dirPath) {
        throw new Error('项目目录未就绪')
      }
      return dirPath
    }

    /**
     * 更新列表与当前项目中的项目信息
     * @param id 项目 ID
     * @param payload 待更新的字段
     */
    function patchProject(id: number, payload: Pick<projectItem, 'title' | 'desc'>) {
      const target = projectList.value.find((item) => item.id === id)
      if (target) {
        target.title = payload.title
        target.desc = payload.desc
      }

      if (currentProject.value?.id === id) {
        currentProject.value = {
          ...currentProject.value,
          title: payload.title,
          desc: payload.desc,
        }
      }
    }

    /**
     * 更新列表与当前项目中的部署信息
     * @param id 项目 ID
     * @param payload 待更新的字段
     */
    function patchProjectDeploy(
      id: number,
      payload: Pick<projectItem, 'link' | 'currentVersion'>,
    ) {
      const target = projectList.value.find((item) => item.id === id)
      if (target) {
        target.link = payload.link
        target.currentVersion = payload.currentVersion
      }

      if (currentProject.value?.id === id) {
        currentProject.value = {
          ...currentProject.value,
          link: payload.link,
          currentVersion: payload.currentVersion,
        }
      }
    }

    return {
      projectList,
      currentProject,
      projectDirPath,
      setProjectList,
      setCurrentProject,
      getProjectById,
      requireProjectDirPath,
      patchProject,
      patchProjectDeploy,
    }
  },
  {
    persist: {
      key: 'project-store',
      pick: ['projectList'],
    },
  },
)
