import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import CannonDebugger from 'cannon-es-debugger';
import gsap from 'gsap';

/**
 * Base
 */
const canvas = (document.querySelector('canvas.webgl') || undefined) as HTMLCanvasElement | undefined;

const scene = new THREE.Scene();

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 1000);
camera.position.x = 0;
camera.position.y = 0.6;
camera.position.z = 40;

scene.add(camera);

camera.lookAt(new THREE.Vector3(0, 0, 0));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0, -20);

const mouse = new THREE.Vector2();
window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / sizes.width) * 2 - 1;
  mouse.y = -(event.clientY / sizes.height) * 2 + 1;
});

const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3(10, 0, 0);
rayDirection.normalize();

/**
 * Loaders
 */
const loadingManager = new THREE.LoadingManager();

const gltfLoader = new GLTFLoader(loadingManager).setDRACOLoader(new DRACOLoader().setDecoderPath('draco/'));

scene.background = new THREE.Color(0xffffff);

const textureLoader = new THREE.TextureLoader(loadingManager);
const environmentMap2 = textureLoader.load('environment/environment2.jpg');
environmentMap2.mapping = THREE.EquirectangularReflectionMapping;
environmentMap2.colorSpace = THREE.SRGBColorSpace;

const ambientLight = new THREE.AmbientLight(0xffffff, 5);
scene.add(ambientLight);

// const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });

// シルバー寄りの反射
const metalMaterial = new THREE.MeshPhysicalMaterial({
  metalness: 1,
  roughness: 0,
  envMapIntensity: 0.9,
  transmission: 0.95,
  ior: 1,
  envMap: environmentMap2,
  side: THREE.DoubleSide,
});
const roughMetalMaterial = new THREE.MeshPhysicalMaterial({
  metalness: 1,
  roughness: 0.5,
  envMapIntensity: 0.9,
  transmission: 0.95,
  ior: 1,
  envMap: environmentMap2,
  side: THREE.DoubleSide,
});

const glossyBlackMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x000000,
  metalness: 0.1,
  roughness: 0,
  ior: 1,
  envMap: environmentMap2,
  side: THREE.DoubleSide,
});

const mattBlackMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x1a1a1a,
  roughness: 0.5,
  ior: 1,
  envMap: environmentMap2,
  side: THREE.DoubleSide,
});

const lightBulbMaterial = new THREE.MeshBasicMaterial({ color: 0xfedcbd });

const objectsToUpdate: { mesh: THREE.Mesh | THREE.Group; body: CANNON.Body }[] = [];
gltfLoader.load('404.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.name === 'Scene') return; // FIXME: なぜかSceneが入っているので除外

    if (mesh.name.startsWith('Upper')) {
      const boxBody = new CANNON.Body({
        mass: 0.01,
        position: new CANNON.Vec3(child.position.x, child.position.y, child.position.z),
        shape: new CANNON.Box(new CANNON.Vec3(1, 1.4, 1.6)),
        quaternion: new CANNON.Quaternion(child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w),
      });

      objectsToUpdate.push({ mesh, body: boxBody });
    } else {
      const boxBody = new CANNON.Body({
        mass: 0.01,
        position: new CANNON.Vec3(child.position.x, child.position.y, child.position.z),
        shape: new CANNON.Box(new CANNON.Vec3(0.1, 0.3, 0.3)),
        quaternion: new CANNON.Quaternion(child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w),
      });

      objectsToUpdate.push({ mesh, body: boxBody });
    }

    mesh.material = mattBlackMaterial;
  });

  objectsToUpdate.forEach((object) => {
    scene.add(object.mesh);
  });
});

let motorcycleMesh: THREE.Group | undefined;
gltfLoader.load('motorcycle.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    const mesh = child as THREE.Mesh;

    mesh.material = (() => {
      if (mesh.name.startsWith('Metallic')) return metalMaterial;
      if (mesh.name.startsWith('RoughMetallic')) return roughMetalMaterial;
      if (mesh.name.startsWith('GlossyBlack')) return glossyBlackMaterial;
      if (mesh.name.startsWith('MattBlack')) return mattBlackMaterial;
      if (mesh.name.startsWith('Light')) return lightBulbMaterial;
      return mesh.material;
    })();
  });

  motorcycleMesh = gltf.scene;
  motorcycleMesh.position.set(0, 12, 0);
});

// Default material
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
  friction: 0.5,
  restitution: 0,
});

/**
 * Physics
 */
const world = new CANNON.World();

world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
world.gravity.set(0, -9.82, 0);
const boxBody = new CANNON.Body({
  mass: 30,
  position: new CANNON.Vec3(0, 10, 1),
  shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.7, 1.2)),
});
world.defaultContactMaterial = defaultContactMaterial;

// Floor
const floorBody = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Box(new CANNON.Vec3(100, 0.1, 100)),
  position: new CANNON.Vec3(0, 1.5, 0),
  material: defaultMaterial,
});

world.addBody(floorBody);

// const cannonDebugger = new CannonDebugger(scene, world);

const button = document.querySelector('.startButton');
button?.addEventListener('click', () => {
  console.log('clicked');

  gsap.to(camera.position, {
    duration: 0.5,
    x: 28.1342352757395,
  });
  gsap.to(camera.position, {
    duration: 0.5,
    y: 14.97393676847467,
  });
  gsap.to(camera.position, {
    duration: 0.5,
    z: 30.839020674114657,
  });

  objectsToUpdate.forEach((object) => {
    world.addBody(object.body);
  });

  world.addBody(boxBody);
  scene.add(motorcycleMesh || new THREE.Group());
});

const frontRWheel = new CANNON.Body({
  mass: 20,
  shape: new CANNON.Sphere(0.3),
});
const frontLWheel = new CANNON.Body({
  mass: 20,
  shape: new CANNON.Sphere(0.3),
});
const rearRWheel = new CANNON.Body({
  mass: 30,
  shape: new CANNON.Sphere(0.3),
});
const rearLWheel = new CANNON.Body({
  mass: 30,
  shape: new CANNON.Sphere(0.3),
});
world.addBody(frontRWheel);
world.addBody(frontLWheel);
world.addBody(rearRWheel);
world.addBody(rearLWheel);

const bikeFrontRWheel = new CANNON.HingeConstraint(boxBody, frontRWheel, {
  pivotA: new CANNON.Vec3(0.5, -0.6, -1),
  axisA: new CANNON.Vec3(1, 0, 0),
  maxForce: 1000,
});
const bikeFrontLWheel = new CANNON.HingeConstraint(boxBody, frontLWheel, {
  pivotA: new CANNON.Vec3(-0.5, -0.6, -1),
  axisA: new CANNON.Vec3(1, 0, 0),
  maxForce: 1000,
});
const bikeRearRWheel = new CANNON.HingeConstraint(boxBody, rearRWheel, {
  pivotA: new CANNON.Vec3(0.5, -0.6, 1.1),
  axisA: new CANNON.Vec3(1, 0, 0),
  maxForce: 1000,
});
const bikeRearLWheel = new CANNON.HingeConstraint(boxBody, rearLWheel, {
  pivotA: new CANNON.Vec3(-0.5, -0.6, 1.1),
  axisA: new CANNON.Vec3(1, 0, 0),
  maxForce: 1000,
});
world.addConstraint(bikeFrontRWheel);
world.addConstraint(bikeFrontLWheel);
world.addConstraint(bikeRearRWheel);
world.addConstraint(bikeRearLWheel);
bikeRearRWheel.enableMotor();
bikeRearLWheel.enableMotor();

const keyMap: { [id: string]: boolean } = {};
window.addEventListener('keydown', (e: KeyboardEvent) => {
  keyMap[e.code] = e.type === 'keydown';
});
window.addEventListener('keyup', (e: KeyboardEvent) => {
  keyMap[e.code] = e.type === 'keydown';
});

let forwardVelocity = 0;
let rightVelocity = 0;
let thrusting = false;
/**
 * Animate
 */
const clock = new THREE.Clock();
let previousTime = 0;
const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - previousTime;
  previousTime = elapsedTime;

  if (motorcycleMesh) {
    motorcycleMesh.position.copy({ x: boxBody.position.x, y: boxBody.position.y - 2, z: boxBody.position.z - 1 });
    motorcycleMesh.quaternion.copy(boxBody.quaternion);
  }

  world.step(1 / 60, deltaTime, 3);
  for (const object of objectsToUpdate) {
    object.mesh.position.copy(object.body.position);
    object.mesh.quaternion.copy(object.body.quaternion);
  }
  // cannonDebugger.update();

  if (keyMap['ArrowUp']) {
    if (forwardVelocity < 50.0) forwardVelocity += deltaTime * 20;
    thrusting = true;
  }

  if (keyMap['ArrowDown']) {
    if (forwardVelocity > -50.0) forwardVelocity -= deltaTime * 40;
    thrusting = true;
  }

  if (keyMap['ArrowRight']) {
    if (rightVelocity < 0.1) rightVelocity += 0.1;
  } else if (keyMap['ArrowLeft']) {
    if (rightVelocity > -0.1) rightVelocity -= 0.1;
  } else {
    rightVelocity = 0;
  }

  if (!thrusting) {
    if (forwardVelocity > 0) forwardVelocity -= 0.25;
    if (forwardVelocity < 0) forwardVelocity += 0.25;
  }
  bikeRearRWheel.setMotorSpeed(forwardVelocity);
  bikeRearLWheel.setMotorSpeed(forwardVelocity);
  bikeFrontRWheel.axisA.z = rightVelocity;
  bikeFrontLWheel.axisA.z = rightVelocity;

  controls.update();
  renderer.render(scene, camera);

  window.requestAnimationFrame(tick);
};

tick();
