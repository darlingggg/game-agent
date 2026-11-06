export const PREVIEW_CHANGED_EVENT = 'project-preview-changed'
export type PreviewChangeSource = 'manual' | 'ai' | 'round'
export interface PreviewChange { projectId: number; source: PreviewChangeSource }

export function notifyPreviewChange(projectId: number | undefined, source: PreviewChangeSource = 'manual') {
  if (projectId) window.dispatchEvent(new CustomEvent<PreviewChange>(PREVIEW_CHANGED_EVENT, {
    detail: { projectId, source },
  }))
}
