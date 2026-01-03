import './style.css'
import * as THREE from 'three'
import * as CANNON from 'cannon'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/*
  Make sure the HUD text and canvas exist.
  If they’re missing, create them dynamically.
*/
function ensureHudAndCanvas() {
  let hud = document.getElementById('hud')
  if (!hud) {
    hud = document.createElement('div')
    hud.id = 'hud'
    hud.textContent =
      'Reactive Zone • Hover ball = highlight • Click ball = push • S: drop sphere • B: drop box • R: reset'
    document.body.appendChild(hud)
  }

  let canvas = document.querySelector('canvas.webgl')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.className = 'webgl'
    document.body.appendChild(canvas)
  }

  return canvas
}

const canvas = ensureHudAndCanvas()

/*
  Basic scene setup
*/
const scene = new THREE.Scene()
scene.background = new THREE.Color('#0b0f16')

/*
  Screen sizes
*/
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

/*
  Camera setup
*/
const camera = new THREE.PerspectiveCamera(
  60,
  sizes.width / sizes.height,
  0.1,
  200
)
camera.position.set(8, 6, 10)
scene.add(camera)

/*
  Renderer
*/
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true

/*
  Orbit controls for camera movement
*/
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.target.set(0, 1, 0)

/*
  Helpers
  Grid is kept for orientation.
  Axis helper was removed to clean up the view.
*/
scene.add(new THREE.GridHelper(30, 30))
// scene.add(new THREE.AxesHelper(3))

/*
  Lighting
*/
scene.add(new THREE.AmbientLight('#ffffff', 0.45))

const dirLight = new THREE.DirectionalLight('#ffffff', 0.9)
dirLight.position.set(6, 10, 5)
dirLight.castShadow = true
dirLight.shadow.mapSize.set(1024, 1024)
scene.add(dirLight)

/*
  Visual floor
*/
const floorMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({
    color: '#2b2f3a',
    roughness: 0.95,
    metalness: 0
  })
)
floorMesh.rotation.x = -Math.PI * 0.5
floorMesh.receiveShadow = true
scene.add(floorMesh)

/*
  Physics world setup
*/
const world = new CANNON.World()
world.gravity.set(0, -9.82, 0)
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true

const defaultMaterial = new CANNON.Material('default')
world.defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: 0.25,
    restitution: 0.55
  }
)

/*
  Physics floor
*/
const floorBody = new CANNON.Body({
  mass: 0,
  material: defaultMaterial
})
floorBody.addShape(new CANNON.Plane())
floorBody.quaternion.setFromAxisAngle(
  new CANNON.Vec3(-1, 0, 0),
  Math.PI * 0.5
)
world.addBody(floorBody)

/*
  Red balls with physics + raycasting
*/
const balls = [] // stores mesh, body, and base color
const ballRadius = 0.45
const ballGeo = new THREE.SphereGeometry(ballRadius, 24, 24)

function spawnBall(pos) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    roughness: 0.35,
    metalness: 0.05
  })

  const mesh = new THREE.Mesh(ballGeo, mat)
  mesh.position.set(pos.x, pos.y, pos.z)
  mesh.castShadow = true
  scene.add(mesh)

  const body = new CANNON.Body({
    mass: 1,
    material: defaultMaterial
  })
  body.addShape(new CANNON.Sphere(ballRadius))
  body.position.set(pos.x, pos.y, pos.z)
  world.addBody(body)

  body.velocity.set(
    (Math.random() - 0.5) * 2.5,
    0,
    (Math.random() - 0.5) * 2.5
  )

  balls.push({
    mesh,
    body,
    baseColor: new THREE.Color(0xff0000)
  })
}

function resetBalls() {
  for (const b of balls) {
    world.removeBody(b.body)
    scene.remove(b.mesh)
  }
  balls.length = 0

  spawnBall({ x: -2, y: 3, z: -1 })
  spawnBall({ x: 2, y: 3.4, z: -1 })
  spawnBall({ x: 0, y: 4, z: 2 })
  spawnBall({ x: -3, y: 4.2, z: 1 })
}

resetBalls()

/*
  Boxes (spawned using B key)
*/
const boxes = []
const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8)
const boxHalf = 0.4

function spawnBox(pos) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4da6ff,
    roughness: 0.4,
    metalness: 0.05
  })

  const mesh = new THREE.Mesh(boxGeo, mat)
  mesh.position.set(pos.x, pos.y, pos.z)
  mesh.castShadow = true
  scene.add(mesh)

  const body = new CANNON.Body({
    mass: 1,
    material: defaultMaterial
  })
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(boxHalf, boxHalf, boxHalf))
  )
  body.position.set(pos.x, pos.y, pos.z)
  world.addBody(body)

  body.velocity.set(
    (Math.random() - 0.5) * 1.8,
    0,
    (Math.random() - 0.5) * 1.8
  )

  boxes.push({ mesh, body })
}

/*
  Fox model loading with animation and kinematic physics body
*/
const gltfLoader = new GLTFLoader()
let fox = null
let mixer = null

let foxBody = null
let foxHalfExtents = new CANNON.Vec3(0.6, 0.8, 0.6)

gltfLoader.load(
  '/models/Fox/glTF/Fox.gltf',
  (gltf) => {
    fox = gltf.scene
    fox.scale.set(0.025, 0.025, 0.025)

    fox.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
      }
    })

    scene.add(fox)

    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(fox)
      const clip = gltf.animations[2] || gltf.animations[0]
      mixer.clipAction(clip).play()
    }

    const box3 = new THREE.Box3().setFromObject(fox)
    const size = new THREE.Vector3()
    box3.getSize(size)

    foxHalfExtents = new CANNON.Vec3(
      Math.max(0.3, size.x * 0.5),
      Math.max(0.3, size.y * 0.5),
      Math.max(0.3, size.z * 0.5)
    )

    foxBody = new CANNON.Body({
      mass: 0,
      material: defaultMaterial,
      type: CANNON.Body.KINEMATIC
    })
    foxBody.addShape(new CANNON.Box(foxHalfExtents))
    foxBody.position.set(0, foxHalfExtents.y + 0.01, 0)
    world.addBody(foxBody)
  }
)

/*
  Simple left-right fox movement
*/
const foxMotion = {
  t: 0,
  speed: 1.2,
  range: 4.5
}

/*
  Raycaster interaction for balls
*/
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let hoveredBallIndex = -1

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / sizes.width) * 2 - 1
  mouse.y = -(event.clientY / sizes.height) * 2 + 1
})

function impulseFromCamera(strength = 9) {
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  dir.multiplyScalar(-1)
  dir.y = 0.25
  dir.normalize()
  return new CANNON.Vec3(
    dir.x * strength,
    dir.y * strength,
    dir.z * strength
  )
}

window.addEventListener('click', () => {
  if (hoveredBallIndex === -1) return
  balls[hoveredBallIndex].body.applyImpulse(
    impulseFromCamera(9.5),
    balls[hoveredBallIndex].body.position
  )
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyS') spawnBall({ x: 0, y: 6, z: 0 })
  if (e.code === 'KeyB') spawnBox({ x: 0, y: 6, z: 0 })
  if (e.code === 'KeyR') resetBalls()
})

/*
  Handle resize
*/
window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/*
  Main animation loop
*/
const clock = new THREE.Clock()
let lastTime = 0

function tick() {
  const elapsed = clock.getElapsedTime()
  const dt = elapsed - lastTime
  lastTime = elapsed

  if (foxBody) {
    foxMotion.t += dt * foxMotion.speed
    foxBody.position.x = Math.sin(foxMotion.t) * foxMotion.range

    const facing = Math.cos(foxMotion.t) >= 0 ? 0 : Math.PI
    foxBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(0, 1, 0),
      facing
    )

    if (fox) {
      fox.position.set(
        foxBody.position.x,
        foxBody.position.y - foxHalfExtents.y,
        foxBody.position.z
      )
      fox.rotation.y = facing
    }
  }

  if (foxBody) {
    for (const b of balls) {
      const dir = new CANNON.Vec3(
        foxBody.position.x - b.body.position.x,
        0,
        foxBody.position.z - b.body.position.z
      )
      const dist = Math.max(dir.length(), 0.001)
      dir.scale(1 / dist, dir)
      b.body.applyForce(dir.scale(2.0), b.body.position)
    }
  }

  world.step(1 / 60, dt, 3)

  for (const b of balls) {
    b.mesh.position.copy(b.body.position)
    b.mesh.quaternion.copy(b.body.quaternion)
  }

  for (const b of boxes) {
    b.mesh.position.copy(b.body.position)
    b.mesh.quaternion.copy(b.body.quaternion)
  }

  if (mixer) mixer.update(dt)

  raycaster.setFromCamera(mouse, camera)
  const ballMeshes = balls.map((b) => b.mesh)
  const hits = raycaster.intersectObjects(ballMeshes)

  balls.forEach((b) => b.mesh.material.color.copy(b.baseColor))
  hoveredBallIndex = -1

  if (hits.length) {
    hoveredBallIndex = ballMeshes.indexOf(hits[0].object)
    if (hoveredBallIndex !== -1) {
      balls[hoveredBallIndex].mesh.material.color.set(0xff6666)
    }
  }

  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

tick()
