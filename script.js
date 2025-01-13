import {
  Color,
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AxesHelper,
  BufferGeometry,
  BufferAttribute,
  Points,
  ShaderMaterial,
  Raycaster,
  Vector2,
  PointLight,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import LoaderManager from '@/js/managers/LoaderManager'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import vertexShader from '@/js/glsl/main.vert'
import fragmentShader from '@/js/glsl/main.frag'
import { randFloat } from 'three/src/math/MathUtils'
import gsap from 'gsap'
import TouchTexture from './TouchTexture'
import { sortPoints } from '@/js/utils/three'
import { isTouch } from '@/js/utils/isTouch'

export default class MainScene {
  canvas
  renderer
  scene
  camera
  controls
  width
  height
  guiObj = {
    uProgress: 0,
    texture: 'face',
    appearFrom: 'front',
    pointSize: 2,
    waveFrequency: 0,
    waveSpeed: 1.5,
  }
  bloomParams = {
    bloomStrength: 0.6,
    bloomRadius: 0.6,
    bloomThreshold: 0.3,
    areaSize: 5
  }
  mousePosition = new Vector2(-1000, -1000);
  isHovering = false;

  constructor() {
    this.canvas = document.querySelector('.scene')

    // Create touch texture for mouse particles animation
    this.touch = new TouchTexture()

    // Add event listener for the followButton
    const followButton = document.getElementById('followButton')
    if (followButton) {
      followButton.addEventListener('click', this.startAnimation)
    }

    this.init()
  }

  init = async () => {
    // Preload assets before initiating the scene
    const assets = [
      {
        name: 'face',
        texture: 'https://cdn.prod.website-files.com/669799f4afcf09e77ccd79c9/6774339d7cfcc1e250220e50_face.jpg',
      },
    ]

    await LoaderManager.load(assets)

    this.setScene()
    this.setRender()
    this.setCamera()
    this.setControls()
    this.setParticlesGrid()
    this.setPostProcessing()
    this.setRaycaster()

    this.handleResize()

    // start RAF
    this.events()

    this.animateIn()
  }

  /**
   * Our Webgl renderer, an object that will draw everything in our canvas
   * https://threejs.org/docs/?q=rend#api/en/renderers/WebGLRenderer
   */
  setRender() {
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    })
  }

  /**
   * This is our scene, we'll add any object
   * https://threejs.org/docs/?q=scene#api/en/scenes/Scene
   */
  setScene() {
    this.scene = new Scene()
    // this.scene.background = new Color(0xffffff)
  }

  /**
   * Our Perspective camera, this is the point of view that we'll have
   * of our scene.
   * A perscpective camera is mimicing the human eyes so something far we'll
   * look smaller than something close
   * https://threejs.org/docs/?q=pers#api/en/cameras/PerspectiveCamera
   */
  setCamera() {
    const aspectRatio = this.width / this.height
    const fieldOfView = 40
    const nearPlane = 0.1
    const farPlane = 10000

    // set classic camera
    this.camera = new PerspectiveCamera(fieldOfView, aspectRatio, nearPlane, farPlane)
    this.camera.position.y = 0
    this.camera.position.x = 0
    this.camera.position.z = 250
    this.camera.lookAt(0, 0, 0)

    this.scene.add(this.camera)
  }

  /**
   * Threejs controls to have controls on our scene
   * https://threejs.org/docs/?q=orbi#examples/en/controls/OrbitControls
   */
  setControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enableZoom = false
    // this.controls.autoRotate = true
    // this.controls.dampingFactor = 0.04
  }

  setParticlesGrid() {
    // Create a grid of particles

    // create a geometry
    const geometry = new BufferGeometry()

    const particles = []
    const initPositions = []
    const multiplier = 18
    const nbColumns = 9 * multiplier
    const nbLines = 16 * multiplier

    this.nbColumns = nbColumns
    this.nbLines = nbLines

    const offsetTransition = 50

    const halfColumn = nbColumns / 2
    const halfLines = nbLines / 2

    // for each line / column add a "particule" to the array

    for (let i = 0; i < nbLines; i++) {
      for (let y = 0; y < nbColumns; y++) {
        const point = [i, y, 0.0] // coordinates of each points

        // appear from side
        let initPoint = [
          i / 3 - halfLines + randFloat(halfLines, halfLines + offsetTransition),
          (y - halfColumn - randFloat(halfColumn, halfColumn + offsetTransition)) / 3,
          randFloat(-50, 50),
        ]

        // appear from Z
        if (this.guiObj.appearFrom === 'front') {
          initPoint = [i - halfLines, y - halfColumn, randFloat(0, 500)]
        }

        // particles.push(point)
        particles.push(...point) // spread the coordinates for Float32Array
        initPositions.push(...initPoint)
      }
    }

    const vertices = new Float32Array(particles)
    const initPositionsFloat = new Float32Array(initPositions)

    // console.log(particles)
    // Add the particles to the array as "position" and "initPosition"
    // itemSize = 3 because there are 3 values (components) per vertex
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setAttribute('initPosition', new BufferAttribute(initPositionsFloat, 3))

    geometry.center()
    // const material = new MeshBasicMaterial({ color: 0xff0000 })

    this.dpr = 2
    this.uniforms = {
      uColor: { value: new Color(0xff0000) },
      uPointSize: { value: this.guiObj.pointSize },
      uTexture: { value: LoaderManager.assets[this.guiObj.texture].texture },
      uNbLines: { value: nbLines },
      uNbColumns: { value: nbColumns },
      uProgress: { value: this.guiObj.uProgress },
      uTime: { value: 0 },
      uTouch: { value: this.touch.texture },
      uScaleHeightPointSize: { value: (this.dpr * this.height) / 2 },
      uWaveFrequency: { value: this.guiObj.waveFrequency },
      uMousePosition: { value: this.mousePosition },
      uBloomRadius: { value: 0.1 },
      uBloomStrength: { value: 0.0 },
      uIsHovering: { value: 0.0 }
    }

    // create a custom shaderMaterial for this geometry
    const customMaterial = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.mesh = new Points(geometry, customMaterial)

    this.scene.add(this.mesh)
  }

  animateIn() {
    // Remove the delay and start the animation immediately
    // animate progress uniform
    gsap.fromTo(
      this.uniforms.uProgress,
      {
        value: 0,
      },
      {
        value: 1,
        duration: 3,
        ease: 'Power4.easeOut',
      }
    )
  }

  /**
   * Axes Helper
   * https://threejs.org/docs/?q=Axesh#api/en/helpers/AxesHelper
   */
  setAxesHelper() {
    const axesHelper = new AxesHelper(3)
    this.scene.add(axesHelper)
  }

  /**
   * List of events
   */
  events() {
    window.addEventListener('resize', this.handleResize, { passive: true })
    this.draw(0)
  }

  // EVENTS

  /**
   * Request animation frame function
   * This function is called 60/time per seconds with no performance issue
   * Everything that happens in the scene is drawed here
   * @param {Number} now
   */
  draw = (time) => {
    // now: time in ms
    if (this.controls) this.controls.update() // for damping

    sortPoints(this.mesh, this.camera) // sort points to avoid render order issues due to transparency

    // Use composer for constant bloom
    this.composer.render()

    this.uniforms.uTime.value = (time * this.guiObj.waveSpeed) / 1000 // update time

    this.touch.update() // update touch texture

    this.raf = window.requestAnimationFrame(this.draw)
  }

  /**
   * On resize, we need to adapt our camera based
   * on the new window width and height and the renderer
   */
  handleResize = () => {
    this.width = window.innerWidth
    this.height = window.innerHeight

    // Update camera
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()

    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.width, this.height)

    if (this.composer) {
      this.composer.setSize(this.width, this.height)
    }

    this.uniforms.uScaleHeightPointSize.value = (this.dpr * this.height) / 2
  }

  setRaycaster() {
    this.ray = new Raycaster()
    this.mouse = new Vector2()

    if (isTouch()) {
        window.addEventListener('touchmove', this.handleTouchMove)
        window.addEventListener('touchend', this.handleMouseLeave)
    } else {
        window.addEventListener('mousemove', this.handleMouseMove)
        window.addEventListener('mouseleave', this.handleMouseLeave)
    }
  }

  handleMouseMove = (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1
    const y = -(e.clientY / window.innerHeight) * 2 + 1
    this.mouse.x = x
    this.mouse.y = y

    const mouseX = e.clientX / window.innerWidth
    const mouseY = 1.0 - (e.clientY / window.innerHeight)
    
    this.ray.setFromCamera(this.mouse, this.camera)
    this.intersects = this.ray.intersectObjects([this.mesh])

    if (this.intersects.length) {
        this.isHovering = true;
        if (this.uniforms) {
            this.uniforms.uMousePosition.value.set(mouseX, mouseY)
            this.uniforms.uIsHovering.value = 1.0
        }
        
        // Add touch effect when hovering
        const uv = new Vector2(mouseX, mouseY)
        this.touch.addTouch(uv)

        // Add bloom effect when hovering
        if (this.bloomPass) {
            gsap.to(this.bloomPass, {
                strength: this.bloomParams.bloomStrength,
                duration: 0.3,
                ease: 'power2.out'
            })
        }
    } else {
        this.isHovering = false;
        if (this.uniforms) {
            this.uniforms.uMousePosition.value.set(-1, -1)
            this.uniforms.uIsHovering.value = 0.0
        }
        
        // Reset bloom when not hovering
        if (this.bloomPass) {
            gsap.to(this.bloomPass, {
                strength: this.bloomParams.bloomStrength * 0.5,
                duration: 0.5,
                ease: 'power2.out'
            })
        }
    }
  }

  handleTouchMove = (e) => {
    const x = (e.touches[0].clientX / window.innerWidth) * 2 - 1
    const y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1
    this.mouse.x = x
    this.mouse.y = y

    this.ray.setFromCamera(this.mouse, this.camera)
    this.intersects = this.ray.intersectObjects([this.mesh])

    if (this.intersects.length) {
      const uv = new Vector2(0.5, 0.5)
      uv.x = this.intersects[0].point.x / this.nbLines + 0.5
      uv.y = this.intersects[0].point.y / this.nbColumns + 0.5
      this.touch.addTouch(uv)

      if (this.bloomPass) {
        gsap.to(this.bloomPass, {
          strength: this.bloomParams.activeStrength,
          duration: 0.3,
          ease: 'power2.out'
        })
      }
    } else if (this.bloomPass) {
      gsap.to(this.bloomPass, {
        strength: this.bloomParams.defaultStrength,
        duration: 0.5,
        ease: 'power2.out'
      })
    }
  }

  handleMouseLeave = () => {
    if (this.bloomPass) {
      this.bloomPass.strength = this.bloomParams.defaultStrength
    }
    if (this.uniforms) {
      this.uniforms.uMousePosition.value = new Vector2(-1, -1)
    }
  }

  setPostProcessing() {
    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    // Set up constant bloom effect
    this.bloomPass = new UnrealBloomPass(
      new Vector2(this.width, this.height),
      this.bloomParams.bloomStrength,
      this.bloomParams.bloomRadius,
      this.bloomParams.bloomThreshold
    )
    this.composer.addPass(this.bloomPass)
  }

  startAnimation = () => {
    // Call animateIn to start the animation
    this.animateIn()
  }
}
