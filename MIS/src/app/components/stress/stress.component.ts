import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
// Postprocessing modules from three/examples are dynamically imported at runtime to avoid TypeScript resolution issues

@Component({
  selector: 'app-stress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stress.component.html',
  styleUrls: ['./stress.component.css']
})
export class StressComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // Environment check
  private get isBrowser() { return typeof window !== 'undefined' && typeof document !== 'undefined'; }

  // Scene / renderer
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  // composer is any to avoid direct typings for three/examples
  private composer: any;
  private group!: THREE.Group;
  private pointLight!: THREE.PointLight;
  private ambientLight!: THREE.AmbientLight;

  // Meshes and resources
  private meshes: THREE.Mesh[] = [];
  private sharedMaterial!: THREE.MeshStandardMaterial;
  private currentGeometry?: THREE.SphereGeometry;

  // Animation
  private rafId: number | null = null;

  // UI state
  objectCount = 3000;
  geometrySegments = 64;
  shadowsEnabled = false;
  postProcessing = true;

  resolutionDisplay = '0 x 0';

  // CPU stress state
  cpuEnabled = false;
  cpuThreads = Math.max(1, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4);
  cpuIntensity = 200000; // number of iterations per batch
  cpuWorkers: Worker[] = [];
  private cpuWorkerUrl?: string;
  cpuOpsPerSec = 0;
  private cpuOps = 0;
  private cpuIntervalId: any = null;

  ngAfterViewInit(): void {
    // Protect against server-side rendering or environments without window
    if (!this.isBrowser) return;
    if (!this.canvasRef || !this.canvasRef.nativeElement) return;

    this.initThree();
    this.createMeshes(this.objectCount, this.geometrySegments);
    this.updateResolutionDisplay();
    this.animate();
  }

  ngOnDestroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stopCpuWorkers();
    this.disposeScene();
  }

  private initThree() {
    if (!this.isBrowser) return; // guard SSR
    const canvas = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 10000);
    this.camera.position.set(0, 0, 1000);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.postProcessing });
    this.renderer.setPixelRatio((typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    if (this.renderer.domElement) this.renderer.domElement.style.display = 'block';

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1.5, 0, 2);
    this.pointLight.position.set(200, 200, 200);
    this.pointLight.castShadow = this.shadowsEnabled;
    if (this.shadowsEnabled) {
      this.pointLight.shadow.mapSize.set(2048, 2048);
    }
    this.scene.add(this.pointLight);

    // Shared material
    this.sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x9090ff, roughness: 0.6, metalness: 0.2 });

    // Postprocessing (FXAA) -- optional. Lazy-load modules to avoid build-time import errors
    if (this.postProcessing) {
      this.setupPostProcessing();
    }

    // Listen for resizes
    this.onResize();
  }

  private createGeometry(segments: number) {
    // Dispose previous geometry after creating new one
    const old = this.currentGeometry;
    this.currentGeometry = new THREE.SphereGeometry(4, segments, segments);
    if (old) {
      old.dispose();
    }
    return this.currentGeometry;
  }

  private createMeshes(count: number, segments: number) {
    // ensure we have geometry
    const geometry = this.createGeometry(segments);

    // create or remove meshes to match count
    const delta = count - this.meshes.length;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        const mesh = new THREE.Mesh(geometry, this.sharedMaterial);
        mesh.castShadow = this.shadowsEnabled;
        mesh.receiveShadow = this.shadowsEnabled;
        this.randomizeMesh(mesh);
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) {
        const mesh = this.meshes.pop();
        if (!mesh) break;
        this.group.remove(mesh);
        // We're using shared material and shared geometry; do not dispose them here to avoid invalidating other meshes
      }
    }
  }

  private randomizeMesh(mesh: THREE.Mesh) {
    const range = 1200;
    mesh.position.set(
      (Math.random() - 0.5) * range,
      (Math.random() - 0.5) * range,
      (Math.random() - 0.5) * range
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const scale = 0.6 + Math.random() * 1.6;
    mesh.scale.set(scale, scale, scale);
  }

  onObjectsChange(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    this.objectCount = v;
    this.createMeshes(this.objectCount, this.geometrySegments);
  }

  onSegmentsChange(e: Event) {
    const v = Math.max(4, Number((e.target as HTMLInputElement).value));
    this.geometrySegments = v;
    // Recreate geometry and reassign to all meshes
    const newGeom = this.createGeometry(this.geometrySegments);
    this.meshes.forEach(m => {
      // old geometry reference is disposed in createGeometry
      m.geometry = newGeom;
    });
  }

  onToggleShadows(e?: Event) {
    this.shadowsEnabled = !this.shadowsEnabled;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.pointLight.castShadow = this.shadowsEnabled;
    if (this.shadowsEnabled) {
      this.pointLight.shadow.mapSize.set(2048, 2048);
    }

    this.meshes.forEach(m => {
      m.castShadow = this.shadowsEnabled;
      m.receiveShadow = this.shadowsEnabled;
    });
  }

  onTogglePostprocessing() {
    if (!this.isBrowser) return;
    this.postProcessing = !this.postProcessing;
    // Recreate renderer / composer to toggle antialiasing
    // Keep size and canvas
    const canvas = this.canvasRef.nativeElement;
    const size = new THREE.Vector2();
    try { if (this.renderer && typeof (this.renderer as any).getSize === 'function') this.renderer.getSize(size); } catch (e) {}

    // Dispose composer if present
    try { if (this.composer && typeof this.composer.dispose === 'function') this.composer.dispose(); } catch (e) {}
    // Recreate renderer
    try { if (this.renderer && typeof (this.renderer as any).dispose === 'function') this.renderer.dispose(); } catch (e) {}
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.postProcessing });
    this.renderer.setPixelRatio((typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1);
    this.renderer.setSize(size.x || window.innerWidth, size.y || window.innerHeight);
    this.renderer.shadowMap.enabled = this.shadowsEnabled;

    if (this.postProcessing) {
      this.setupPostProcessing();
    } else {
      if (this.composer) { try { this.composer.dispose(); } catch (e) {} this.composer = undefined; }
    }
  }

  private async setupPostProcessing() {
    try {
      const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer');
      const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass');
      const { ShaderPass } = await import('three/examples/jsm/postprocessing/ShaderPass');
      const { FXAAShader } = await import('three/examples/jsm/shaders/FXAAShader');

      // construct composer and passes
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const fxaaPass = new ShaderPass(FXAAShader);
      this.composer.addPass(fxaaPass);

      this.onResize();
    } catch (err) {
      console.warn('Failed to load postprocessing modules', err);
      this.postProcessing = false;
    }
  }

  // -----------------
  // CPU stress workers
  // -----------------
  private createWorkerBlobUrl() {
    if (!this.isBrowser) return undefined;
    if (this.cpuWorkerUrl) return this.cpuWorkerUrl;

    const code = `
      let running = false;
      let intensity = 200000;
      self.onmessage = (e) => {
        const d = e.data;
        if (!d) return;
        if (d.cmd === 'start') { intensity = d.intensity || intensity; if (!running) { running = true; run(); } }
        else if (d.cmd === 'stop') { running = false; }
        else if (d.cmd === 'update') { intensity = d.intensity || intensity; }
      };
      function run() {
        // Busy batch
        const iterations = intensity;
        let x = 0;
        for (let i = 0; i < iterations; i++) {
          // cheap math to keep CPU busy
          x += Math.sqrt(i * i + Math.random());
        }
        // report number of operations completed
        self.postMessage({ ops: iterations });
        if (running) setTimeout(run, 0);
      }
    `;

    try {
      const blob = new Blob([code], { type: 'application/javascript' });
      this.cpuWorkerUrl = URL.createObjectURL(blob);
      return this.cpuWorkerUrl;
    } catch (e) {
      console.warn('Failed to create worker blob URL', e);
      return undefined;
    }
  }

  private startCpuWorkers() {
    if (!this.isBrowser || typeof Worker === 'undefined') {
      console.warn('Web Workers not available in this environment. CPU stress disabled.');
      this.cpuEnabled = false;
      return;
    }

    this.stopCpuWorkers();
    this.cpuOps = 0;
    const url = this.createWorkerBlobUrl();
    if (!url) { console.warn('Could not create worker blob URL'); this.cpuEnabled = false; return; }

    for (let i = 0; i < this.cpuThreads; i++) {
      try {
        const w = new Worker(url);
        w.onmessage = (ev) => {
          this.cpuOps += (ev.data && ev.data.ops) || 0;
        };
        w.postMessage({ cmd: 'start', intensity: this.cpuIntensity });
        this.cpuWorkers.push(w);
      } catch (e) {
        console.warn('Failed to create worker', e);
      }
    }

    // sample ops per second
    if (this.cpuIntervalId) clearInterval(this.cpuIntervalId);
    this.cpuIntervalId = setInterval(() => {
      this.cpuOpsPerSec = this.cpuOps;
      this.cpuOps = 0;
    }, 1000);
  }

  private stopCpuWorkers() {
    if (this.cpuIntervalId) { clearInterval(this.cpuIntervalId); this.cpuIntervalId = null; }
    this.cpuWorkers.forEach(w => {
      try { w.postMessage({ cmd: 'stop' }); w.terminate(); } catch (e) {}
    });
    this.cpuWorkers = [];
    if (this.cpuWorkerUrl) { try { URL.revokeObjectURL(this.cpuWorkerUrl); } catch (e) {} this.cpuWorkerUrl = undefined; }
    this.cpuOpsPerSec = 0;
    this.cpuOps = 0;
  }

  onCpuToggle() {
    this.cpuEnabled = !this.cpuEnabled;
    if (this.cpuEnabled) this.startCpuWorkers(); else this.stopCpuWorkers();
  }

  onCpuThreadsChange(e: Event) {
    this.cpuThreads = Math.max(1, Number((e.target as HTMLInputElement).value));
    if (this.cpuEnabled) this.startCpuWorkers();
  }

  onCpuIntensityChange(e: Event) {
    const v = Math.max(1000, Number((e.target as HTMLInputElement).value));
    this.cpuIntensity = v;
    // update running workers
    this.cpuWorkers.forEach(w => {
      try { w.postMessage({ cmd: 'update', intensity: this.cpuIntensity }); } catch (e) {}
    });
  }

  private animate = () => {
    if (!this.isBrowser) return; // guard SSR
    // Rotate the group for both movement and to keep the GPU busy
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.0005;
    if (this.group) {
      this.group.rotation.x = t * 0.1;
      this.group.rotation.y = t * 0.07;
    }

    if (this.composer) {
      try { this.composer.render(); } catch (e) { /* ignore */ }
    } else if (this.renderer && this.scene && this.camera) {
      try { this.renderer.render(this.scene, this.camera); } catch (e) { /* ignore */ }
    }

    if (typeof requestAnimationFrame !== 'undefined') this.rafId = requestAnimationFrame(this.animate);
  };

  private disposeScene() {
    // Stop animation
    try { if (this.rafId) cancelAnimationFrame(this.rafId); } catch (e) {}

    // Remove and clear meshes (if group exists)
    try { this.meshes.forEach(m => { if (this.group) this.group.remove(m); }); this.meshes = []; } catch (e) {}

    // Dispose shared material & geometry cached
    try {
      if (this.currentGeometry && typeof this.currentGeometry.dispose === 'function') this.currentGeometry.dispose();
    } catch (e) { /* ignore */ }

    try {
      if (this.sharedMaterial && typeof (this.sharedMaterial as any).dispose === 'function') (this.sharedMaterial as any).dispose();
    } catch (e) { /* ignore */ }

    if (this.composer) { try { this.composer.dispose(); } catch (e) {} this.composer = undefined; }

    try { if (this.renderer && typeof (this.renderer as any).dispose === 'function') (this.renderer as any).dispose(); } catch (e) {}
  }

  @HostListener('window:resize')
  onResize() {
    if (!this.isBrowser) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    try { if (this.renderer && typeof (this.renderer as any).setSize === 'function') this.renderer.setSize(width, height); } catch (e) {}
    try { if (this.composer && typeof this.composer.setSize === 'function') this.composer.setSize(width, height); } catch (e) {}

    this.updateResolutionDisplay();
  }

  private updateResolutionDisplay() {
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    this.resolutionDisplay = `${w} x ${h}`;
  }
}
