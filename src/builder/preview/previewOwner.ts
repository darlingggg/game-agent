/** 新面板先取得归属，旧面板稍后的卸载回调不能停止它的预览。 */
let activeOwner: symbol | null = null

export function claimPreviewOwner(): symbol {
  const owner = Symbol('preview-panel')
  activeOwner = owner
  return owner
}

export function releasePreviewOwner(owner: symbol): boolean {
  if (activeOwner !== owner) return false
  activeOwner = null
  return true
}
