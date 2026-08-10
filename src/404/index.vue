<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue'
import { computed, reactive } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

defineOptions({ name: 'NotFoundPage' })

const route = useRoute()
const pointer = reactive({ x: 50, y: 50 })
const pointerStyle = computed(() => ({
  '--pointer-x': `${pointer.x}%`,
  '--pointer-y': `${pointer.y}%`,
  '--pointer-shift-x': `${(pointer.x - 50) * 0.08}px`,
  '--pointer-shift-y': `${(pointer.y - 50) * 0.08}px`,
}))

function trackPointer(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  pointer.x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))
  pointer.y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))
}
</script>

<template>
  <main class="not-found-page" :style="pointerStyle" @pointermove="trackPointer">
    <header class="not-found-header">
      <RouterLink class="brand-lockup" to="/" aria-label="AI Agent 主页">
        <span class="brand-mark"><span class="brand-mark-svg" /></span>
        <span class="brand-copy"><strong>AI Agent</strong><small>Project workspace</small></span>
      </RouterLink>
      <div class="route-state"><span /> Route unresolved</div>
    </header>

    <section class="error-stage" aria-labelledby="not-found-title">
      <div class="stage-rail stage-rail--top"><span>ERROR / ROUTE COORDINATE</span><span>HTTP 404</span></div>

      <div class="error-code" aria-label="404">
        <span class="error-digit">4</span>
        <span class="missing-node" aria-hidden="true">
          <i class="corner corner--tl" />
          <i class="corner corner--tr" />
          <i class="corner corner--br" />
          <i class="corner corner--bl" />
          <span class="node-axis node-axis--x" />
          <span class="node-axis node-axis--y" />
          <span class="node-core"><span class="node-logo" /></span>
        </span>
        <span class="error-digit">4</span>
      </div>

      <div class="error-content">
        <div>
          <p class="error-kicker">The requested node is outside this workspace.</p>
          <h1 id="not-found-title">这个页面没有被构建</h1>
        </div>
        <div class="error-action-copy">
          <p>当前地址无法匹配到可用页面。返回项目主页，继续你的工作。</p>
          <RouterLink class="home-link" to="/">
            <el-icon><ArrowLeft /></el-icon>
            返回主页
          </RouterLink>
        </div>
      </div>

      <div class="stage-rail stage-rail--bottom">
        <span class="route-path" :title="route.fullPath">{{ route.fullPath }}</span>
        <span>X {{ pointer.x.toFixed(0).padStart(3, '0') }} / Y {{ pointer.y.toFixed(0).padStart(3, '0') }}</span>
      </div>
    </section>

    <footer class="not-found-footer"><span>Workspace online</span><span>Recovery route available</span></footer>
  </main>
</template>

<style scoped>
.not-found-page {
  --error-bg: #f4f6f8;
  --error-ink: #15171c;
  --error-muted: #777f8c;
  --error-line: rgba(21, 23, 28, 0.16);
  --error-blue: #315efb;
  --error-green: #11865b;
  position: relative;
  min-height: 100svh;
  overflow: hidden;
  background-color: var(--error-bg);
  background-image: linear-gradient(rgba(21, 23, 28, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(21, 23, 28, 0.055) 1px, transparent 1px);
  background-size: 48px 48px;
  color: var(--error-ink);
  font-family: Arial, 'Microsoft YaHei', sans-serif;
}

.not-found-header,
.not-found-footer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(100% - 48px, 1280px);
  margin: 0 auto;
}

.not-found-header {
  min-height: 72px;
  border-bottom: 1px solid var(--error-line);
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--error-ink);
  border-radius: 6px;
  background: #fff;
}

.brand-mark-svg,
.node-logo {
  display: block;
  background: currentColor;
  mask: url('/svgs/ai-agent.svg') center / contain no-repeat;
}

.brand-mark-svg {
  width: 25px;
  height: 25px;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.brand-copy strong {
  font-size: 15px;
  line-height: 1.2;
}

.brand-copy small,
.route-state,
.stage-rail,
.not-found-footer {
  font-family: Consolas, 'Courier New', monospace;
  text-transform: uppercase;
}

.brand-copy small {
  color: var(--error-muted);
  font-size: 10px;
}

.route-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--error-muted);
  font-size: 10px;
  font-weight: 700;
}

.route-state span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--error-blue);
  box-shadow: 0 0 0 4px rgba(49, 94, 251, 0.12);
}

.error-stage {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100% - 48px, 1280px);
  min-height: calc(100svh - 144px);
  margin: 0 auto;
  grid-template-rows: auto minmax(280px, 1fr) auto auto;
}

.error-stage::before {
  position: absolute;
  z-index: -1;
  top: 0;
  bottom: 0;
  left: var(--pointer-x);
  width: 1px;
  background: rgba(49, 94, 251, 0.22);
  content: '';
  pointer-events: none;
  transform: translateX(-0.5px);
}

.stage-rail {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  color: var(--error-muted);
  font-size: 10px;
  font-weight: 700;
}

.stage-rail--top {
  border-bottom: 1px solid var(--error-line);
}

.stage-rail--bottom {
  border-top: 1px solid var(--error-line);
}

.route-path {
  max-width: min(60vw, 720px);
  overflow: hidden;
  color: var(--error-blue);
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.error-code {
  display: grid;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 4vw, 64px);
  grid-template-columns: auto clamp(112px, 16vw, 220px) auto;
  user-select: none;
}

.error-digit {
  color: var(--error-ink);
  font-family: 'Arial Black', Impact, sans-serif;
  font-size: clamp(128px, 22vw, 320px);
  font-weight: 900;
  line-height: 0.78;
}

.missing-node {
  position: relative;
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  transform: translate(var(--pointer-shift-x), var(--pointer-shift-y));
  transition: transform 0.18s ease-out;
}

.node-axis {
  position: absolute;
  background: var(--error-line);
}

.node-axis--x {
  right: -24%;
  left: -24%;
  height: 1px;
}

.node-axis--y {
  top: -24%;
  bottom: -24%;
  width: 1px;
}

.node-core {
  position: relative;
  display: grid;
  width: 48%;
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid var(--error-blue);
  border-radius: 8px;
  background: #fff;
  box-shadow: 8px 8px 0 var(--error-ink);
  color: var(--error-blue);
  animation: node-pulse 2.4s steps(2, end) infinite;
}

.node-logo {
  width: 58%;
  height: 58%;
}

.corner {
  position: absolute;
  width: 24%;
  height: 24%;
  border-color: var(--error-blue);
}

.corner--tl {
  top: 0;
  left: 0;
  border-top: 2px solid;
  border-left: 2px solid;
}

.corner--tr {
  top: 0;
  right: 0;
  border-top: 2px solid;
  border-right: 2px solid;
}

.corner--br {
  right: 0;
  bottom: 0;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.corner--bl {
  bottom: 0;
  left: 0;
  border-bottom: 2px solid;
  border-left: 2px solid;
}

.error-content {
  display: grid;
  gap: 48px;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.55fr);
  padding: 32px 0 40px;
  border-top: 1px solid var(--error-line);
}

.error-kicker {
  margin-bottom: 10px;
  color: var(--error-blue);
  font-family: Consolas, 'Courier New', monospace;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.error-content h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 46px);
  font-weight: 760;
  line-height: 1.08;
}

.error-action-copy {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 22px;
}

.error-action-copy p {
  max-width: 430px;
  margin: 0;
  color: var(--error-muted);
  font-size: 14px;
  line-height: 1.7;
}

.home-link {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border: 1px solid var(--error-ink);
  border-radius: 6px;
  background: var(--error-blue);
  box-shadow: 5px 5px 0 var(--error-ink);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition:
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background-color 0.18s ease;
}

.home-link:hover {
  background: #2247d4;
  box-shadow: 2px 2px 0 var(--error-ink);
  transform: translate(3px, 3px);
}

.home-link:focus-visible,
.brand-lockup:focus-visible {
  outline: 3px solid rgba(49, 94, 251, 0.32);
  outline-offset: 4px;
}

.not-found-footer {
  min-height: 72px;
  color: var(--error-muted);
  font-size: 9px;
}

.not-found-footer span:first-child::before {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--error-green);
  content: '';
}

@keyframes node-pulse {
  50% {
    color: var(--error-ink);
  }
}

@media (max-width: 760px) {
  .not-found-header,
  .not-found-footer,
  .error-stage {
    width: min(100% - 32px, 1280px);
  }

  .error-stage {
    min-height: calc(100svh - 128px);
    grid-template-rows: auto minmax(260px, 1fr) auto auto;
  }

  .error-code {
    gap: 14px;
    grid-template-columns: auto minmax(88px, 25vw) auto;
  }

  .error-digit {
    font-size: clamp(96px, 31vw, 190px);
  }

  .error-content {
    gap: 24px;
    grid-template-columns: 1fr;
    padding: 26px 0 32px;
  }

  .error-action-copy {
    gap: 18px;
  }
}

@media (max-width: 460px) {
  .brand-copy small,
  .route-state {
    display: none;
  }

  .not-found-header {
    min-height: 64px;
  }

  .error-stage {
    min-height: calc(100svh - 120px);
  }

  .stage-rail {
    font-size: 9px;
  }

  .error-code {
    min-width: 0;
  }

  .node-core {
    border-radius: 5px;
    box-shadow: 5px 5px 0 var(--error-ink);
  }

  .not-found-footer span:last-child {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .missing-node,
  .home-link {
    transition: none;
  }

  .node-core {
    animation: none;
  }
}

:global(html.dark) .not-found-page {
  --error-bg: #111419;
  --error-ink: #edf0f5;
  --error-muted: #8f98a6;
  --error-line: rgba(237, 240, 245, 0.16);
  --error-blue: #6f98ff;
  --error-green: #4dcc98;
}

:global(html.dark) .brand-mark,
:global(html.dark) .node-core {
  background: #191d24;
}
</style>
