<!-- eslint-disable vue/block-lang -->
<script setup>
import * as Phaser from 'phaser'
import { ref, onMounted, onUnmounted } from 'vue'
import { Button as VanButton, Tag as VanTag } from 'vant'

const GAME_WIDTH = 800
const GAME_HEIGHT = 600
const PLAYER_SPEED = 220
const COIN_COUNT = 5
const PLAYER_SIZE = 32
const COIN_SIZE = 20

class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene')
    /** @type {Phaser.Types.Input.Keyboard.CursorKeys|null} */
    this.cursors = null
    /** @type {Phaser.Input.Keyboard.Key[]} */
    this.wasd = []
    /** @type {Phaser.Physics.Arcade.Sprite|null} */
    this.player = null
    /** @type {Phaser.Physics.Arcade.Group|null} */
    this.coins = null
    this.score = 0
  }

  preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    g.fillStyle(0x38bdf8, 1)
    g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
    g.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE)
    g.clear()

    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(COIN_SIZE / 2, COIN_SIZE / 2, COIN_SIZE / 2)
    g.generateTexture('coin', COIN_SIZE, COIN_SIZE)
    g.destroy()
  }

  create() {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player')
    this.player.setCollideWorldBounds(true)

    this.coins = this.physics.add.group()
    for (let i = 0; i < COIN_COUNT; i++) {
      const coin = this.coins.create(0, 0, 'coin')
      this.placeCoinRandomly(coin)
    }

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    ]

    this.physics.add.overlap(this.player, this.coins, this.handleCollectCoin, undefined, this)

    this.score = 0
    this.game.registry.get('onScoreChange')(this.score)
  }

  update() {
    if (!this.game.registry.get('getPlaying')()) {
      this.player.setVelocity(0, 0)
      return
    }

    let vx = 0
    let vy = 0
    if (this.cursors.left.isDown || this.wasd[1].isDown) vx = -1
    else if (this.cursors.right.isDown || this.wasd[3].isDown) vx = 1
    if (this.cursors.up.isDown || this.wasd[0].isDown) vy = -1
    else if (this.cursors.down.isDown || this.wasd[2].isDown) vy = 1

    const touchDirection = this.game.registry.get('getTouchDirection')()
    if (touchDirection.x !== 0 || touchDirection.y !== 0) {
      vx = touchDirection.x
      vy = touchDirection.y
    }

    if (vx !== 0 && vy !== 0) {
      const inv = Math.SQRT1_2
      vx *= inv
      vy *= inv
    }

    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
  }

  handleCollectCoin(_player, coin) {
    if (!this.game.registry.get('getPlaying')()) return

    this.score += 1
    this.game.registry.get('onScoreChange')(this.score)
    this.placeCoinRandomly(coin)
  }

  placeCoinRandomly(coin) {
    const margin = 40
    const x = Phaser.Math.Between(margin, GAME_WIDTH - margin)
    const y = Phaser.Math.Between(margin, GAME_HEIGHT - margin)
    coin.setPosition(x, y)
  }
}

function createGame(parent, options = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#0f172a',
    scene: [MainScene],
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    callbacks: {
      preBoot: (game) => {
        game.registry.set('onScoreChange', options.onScoreChange ?? (() => {}))
        game.registry.set('getPlaying', options.getPlaying ?? (() => true))
        game.registry.set('getTouchDirection', options.getTouchDirection ?? (() => ({ x: 0, y: 0 })))
      },
    },
  })
}

const status = ref('ready')
const score = ref(0)
const gameHostRef = ref(null)
const touchDirection = ref({ x: 0, y: 0 })

/** @type {import('phaser').Game|null} */
let game = null

function startGame() {
  status.value = 'playing'
}

function setTouchDirection(x, y) {
  touchDirection.value = { x, y }
}

function clearTouchDirection() {
  touchDirection.value = { x: 0, y: 0 }
}

onMounted(() => {
  game = createGame(gameHostRef.value, {
    onScoreChange: (value) => {
      score.value = value
    },
    getPlaying: () => status.value === 'playing',
    getTouchDirection: () => touchDirection.value,
  })
})

onUnmounted(() => {
  if (game) {
    game.destroy(true)
    game = null
  }
})
</script>

<template>
  <main class="game-page">
    <section class="game-shell">
      <header class="game-hud">
        <div class="game-copy">
          <h1>&#25342;&#37329;&#24065;</h1>
          <p>&#31227;&#21160;&#26041;&#22359;&#65292;&#30896;&#21040;&#37329;&#24065;&#24471;&#20998;</p>
        </div>

        <div class="score-card">
          <span>&#24471;&#20998;</span>
          <strong>{{ score }}</strong>
        </div>

        <div class="status-action">
          <VanTag v-if="status === 'playing'" type="success" class="rounded-md!">
            &#36827;&#34892;&#20013;
          </VanTag>
          <VanButton
            v-else
            type="primary"
            size="small"
            class="rounded-md!"
            @click="startGame"
          >
            &#24320;&#22987;
          </VanButton>
        </div>
      </header>

      <div class="game-frame">
        <div ref="gameHostRef" class="game-host" />
      </div>

      <footer class="control-panel">
        <p>&#25163;&#26426;&#20351;&#29992;&#26041;&#21521;&#38190;&#65292;&#30005;&#33041;&#20351;&#29992; WASD &#25110;&#26041;&#21521;&#38190;&#12290;</p>

        <div class="dpad" aria-label="&#26041;&#21521;&#38190;">
          <span />
          <button
            class="control-key"
            type="button"
            aria-label="&#21521;&#19978;"
            @pointerdown.prevent="setTouchDirection(0, -1)"
            @pointerup.prevent="clearTouchDirection"
            @pointerleave.prevent="clearTouchDirection"
            @pointercancel.prevent="clearTouchDirection"
          >
            ^
          </button>
          <span />

          <button
            class="control-key"
            type="button"
            aria-label="&#21521;&#24038;"
            @pointerdown.prevent="setTouchDirection(-1, 0)"
            @pointerup.prevent="clearTouchDirection"
            @pointerleave.prevent="clearTouchDirection"
            @pointercancel.prevent="clearTouchDirection"
          >
            &lt;
          </button>
          <button
            class="control-key control-key-stop"
            type="button"
            aria-label="&#20572;&#27490;"
            @pointerdown.prevent="clearTouchDirection"
          >
            o
          </button>
          <button
            class="control-key"
            type="button"
            aria-label="&#21521;&#21491;"
            @pointerdown.prevent="setTouchDirection(1, 0)"
            @pointerup.prevent="clearTouchDirection"
            @pointerleave.prevent="clearTouchDirection"
            @pointercancel.prevent="clearTouchDirection"
          >
            &gt;
          </button>

          <span />
          <button
            class="control-key"
            type="button"
            aria-label="&#21521;&#19979;"
            @pointerdown.prevent="setTouchDirection(0, 1)"
            @pointerup.prevent="clearTouchDirection"
            @pointerleave.prevent="clearTouchDirection"
            @pointercancel.prevent="clearTouchDirection"
          >
            v
          </button>
          <span />
        </div>
      </footer>
    </section>
  </main>
</template>
