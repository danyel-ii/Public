(() => {
  if (!window.THREE) {
    return;
  }

  const root = document.getElementById("paper-scene");
  if (!root) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 2);

  const grainTexture = createGrainTexture();
  grainTexture.wrapS = THREE.RepeatWrapping;
  grainTexture.wrapT = THREE.RepeatWrapping;

  let planeGeometry = null;

  const vertexShader = `
    varying vec2 vUv;
    varying vec2 vPos;

    void main() {
      vUv = uv;
      vPos = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uSeed;
    uniform float uPatternMix;
    uniform float uDensity;
    uniform float uScale;
    uniform vec2 uOffset;
    uniform float uRotation;
    uniform vec3 uLightDir;
    uniform float uDepth;
    uniform float uOpacity;
    uniform float uEdgeStrength;
    uniform sampler2D uGrain;
    uniform float uGrainScale;

    varying vec2 vUv;

    mat2 rot(float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c);
    }

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    float sdCircle(vec2 p, float r) {
      return length(p) - r;
    }

    float sdBox(vec2 p, vec2 b) {
      vec2 d = abs(p) - b;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }

    void main() {
      vec2 uv = vUv - 0.5;
      uv = rot(uRotation) * uv;
      uv *= uScale;
      uv += 0.5 + uOffset;

      float density = max(1.0, uDensity);
      vec2 grid = uv * density;
      vec2 cell = floor(grid);
      vec2 f = fract(grid) - 0.5;

      float rand = hash21(cell + uSeed);
      float radius = mix(0.24, 0.46, rand);
      float circle = sdCircle(f, radius);
      float box = sdBox(f, vec2(radius));
      float dist = mix(circle, box, uPatternMix);

      float feather = 0.035;
      float alpha = smoothstep(0.0, feather, dist);
      if (alpha <= 0.01) {
        discard;
      }

      float bevel = 0.08;
      float edge = 1.0 - smoothstep(0.0, bevel, abs(dist));
      vec2 grad = vec2(dFdx(dist), dFdy(dist));
      vec3 normal = normalize(vec3(grad * 10.0, 1.0));
      vec3 lightDir = normalize(uLightDir);
      float light = clamp(dot(normal, lightDir), 0.0, 1.0);
      float shade = mix(0.75, 1.25, light);
      float edgeShade = edge * (light - 0.5) * uEdgeStrength;
      float edgeDark = edge * (0.4 - light) * uEdgeStrength * 0.6;

      vec3 color = uColor * shade + edgeShade + edgeDark;
      vec2 grainUv = vUv * uGrainScale + uOffset * 2.0;
      float grain = texture2D(uGrain, grainUv).r;
      color = mix(color, color * (0.75 + grain * 0.45), 0.5);
      color *= 1.0 - uDepth * 0.18;

      gl_FragColor = vec4(color, alpha * uOpacity);
    }
  `;

  const layerCount = 6;
  const layers = [];

  const scenes = [
    {
      offset: new THREE.Vector2(0.0, 0.0),
      rotation: 0.02,
      scale: 1.0,
      density: 2.6,
      patternMix: 0.2,
      light: new THREE.Vector3(0.5, 0.8, 1.0),
      camera: { zoom: 1.02, tilt: 0.01 },
      colors: ["#d40000", "#ffcc00", "#111111", "#ff6a00", "#f6e7ce", "#0b0b0b"]
    },
    {
      offset: new THREE.Vector2(0.14, -0.1),
      rotation: -0.03,
      scale: 1.12,
      density: 3.4,
      patternMix: 0.75,
      light: new THREE.Vector3(-0.2, 0.9, 1.0),
      camera: { zoom: 1.06, tilt: -0.04 },
      colors: ["#ffd400", "#00b5e2", "#c2003a", "#111111", "#f4f1ea", "#0b0b0b"]
    },
    {
      offset: new THREE.Vector2(-0.12, 0.14),
      rotation: 0.04,
      scale: 1.18,
      density: 4.2,
      patternMix: 0.45,
      light: new THREE.Vector3(0.35, 0.65, 1.0),
      camera: { zoom: 1.03, tilt: 0.03 },
      colors: ["#e84a1a", "#008a7a", "#e3007a", "#5a7d2b", "#f1e1cc", "#1a130f"]
    },
    {
      offset: new THREE.Vector2(0.18, 0.08),
      rotation: -0.06,
      scale: 1.24,
      density: 5.0,
      patternMix: 1.0,
      light: new THREE.Vector3(-0.45, 0.6, 1.0),
      camera: { zoom: 1.1, tilt: 0.02 },
      colors: ["#ff004d", "#00f0ff", "#ffe600", "#39ff14", "#151515", "#0a0a0a"]
    }
  ];

  scenes.forEach((sceneConfig) => {
    sceneConfig.colorObjects = sceneConfig.colors.map((color) => new THREE.Color(color));
  });

  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, lambda, dt) => {
    return lerp(target, current, Math.exp(-lambda * dt));
  };

  const lerpVec2 = (a, b, t) => new THREE.Vector2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
  const lerpVec3 = (a, b, t) => new THREE.Vector3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  const lerpColor = (a, b, t) => a.clone().lerp(b, t);

  const randRange = (min, max) => min + Math.random() * (max - min);

  const baseOffsets = Array.from({ length: layerCount }, () => new THREE.Vector2(randRange(-0.18, 0.18), randRange(-0.18, 0.18)));
  const baseRotations = Array.from({ length: layerCount }, () => randRange(-0.12, 0.12));
  const baseScales = Array.from({ length: layerCount }, () => randRange(-0.1, 0.1));
  const baseDensity = Array.from({ length: layerCount }, () => randRange(-0.8, 0.8));

  const createUniforms = ({ color, depth, opacity, edgeStrength }) => ({
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uSeed: { value: Math.random() * 100 },
    uPatternMix: { value: scenes[0].patternMix },
    uDensity: { value: scenes[0].density },
    uScale: { value: scenes[0].scale },
    uOffset: { value: new THREE.Vector2() },
    uRotation: { value: 0 },
    uLightDir: { value: scenes[0].light.clone() },
    uDepth: { value: depth },
    uGrain: { value: grainTexture },
    uGrainScale: { value: 3.5 },
    uOpacity: { value: opacity },
    uEdgeStrength: { value: edgeStrength }
  });

  for (let i = 0; i < layerCount; i += 1) {
    const paperUniforms = createUniforms({
      color: scenes[0].colors[i % scenes[0].colors.length],
      depth: i / layerCount,
      opacity: 1,
      edgeStrength: 0.9
    });
    const paperMaterial = new THREE.ShaderMaterial({
      uniforms: paperUniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const shadowUniforms = createUniforms({
      color: "#000000",
      depth: i / layerCount,
      opacity: 0.32,
      edgeStrength: 0.3
    });
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms: shadowUniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const shadowMesh = new THREE.Mesh(getPlaneGeometry(), shadowMaterial);
    shadowMesh.position.z = -i * 0.08 - 0.02;
    shadowMesh.renderOrder = i - 0.3;
    scene.add(shadowMesh);

    const mesh = new THREE.Mesh(getPlaneGeometry(), paperMaterial);
    mesh.position.z = -i * 0.08;
    mesh.renderOrder = i;
    scene.add(mesh);

    layers.push({
      mesh,
      uniforms: paperUniforms,
      shadow: {
        mesh: shadowMesh,
        uniforms: shadowUniforms,
        offset: new THREE.Vector2()
      },
      offset: new THREE.Vector2(),
      rotation: 0,
      scale: 1,
      density: scenes[0].density,
      patternMix: scenes[0].patternMix,
      seed: paperUniforms.uSeed.value,
      jitterOffset: new THREE.Vector2(),
      jitterRotation: 0,
      jitterScale: 0,
      jitterDensity: 0,
      jitterPattern: Math.random()
    });
  }

  let scrollProgress = 0;

  const updateScroll = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
  };

  const randomizeLayers = () => {
    layers.forEach((layer) => {
      layer.seed = Math.random() * 100;
      layer.jitterOffset.set(randRange(-0.24, 0.24), randRange(-0.24, 0.24));
      layer.jitterRotation = randRange(-0.4, 0.4);
      layer.jitterScale = randRange(-0.18, 0.18);
      layer.jitterDensity = randRange(-1.2, 1.2);
      layer.jitterPattern = Math.random();
    });
  };

  const shadowVector = new THREE.Vector2();
  const renderFrame = (time) => {
    const t = time * 0.001;
    const segment = 1 / (scenes.length - 1);
    const index = Math.min(scenes.length - 2, Math.floor(scrollProgress / segment));
    const localT = Math.min(1, Math.max(0, (scrollProgress - index * segment) / segment));
    const sceneA = scenes[index];
    const sceneB = scenes[index + 1];

    const globalOffset = lerpVec2(sceneA.offset, sceneB.offset, localT);
    const globalRotation = lerp(sceneA.rotation, sceneB.rotation, localT);
    const globalScale = lerp(sceneA.scale, sceneB.scale, localT);
    const globalDensity = lerp(sceneA.density, sceneB.density, localT);
    const globalPattern = lerp(sceneA.patternMix, sceneB.patternMix, localT);
    const lightDir = lerpVec3(sceneA.light, sceneB.light, localT);
    const cameraZoom = lerp(sceneA.camera.zoom, sceneB.camera.zoom, localT);
    const cameraTilt = lerp(sceneA.camera.tilt, sceneB.camera.tilt, localT);

    camera.zoom = cameraZoom;
    camera.rotation.z = cameraTilt;
    camera.position.x = globalOffset.x * 0.35;
    camera.position.y = globalOffset.y * 0.35;
    camera.updateProjectionMatrix();

    layers.forEach((layer, i) => {
      const wobble = prefersReducedMotion ? 0 : Math.sin(t * 0.6 + i) * 0.01;
      const targetOffset = baseOffsets[i]
        .clone()
        .multiplyScalar(0.5 + i * 0.08)
        .add(globalOffset.clone().multiplyScalar(0.5 + i * 0.12))
        .add(layer.jitterOffset);

      const targetRotation = baseRotations[i] + globalRotation * (1 + i * 0.08) + layer.jitterRotation + wobble;
      const targetScale = globalScale + baseScales[i] + layer.jitterScale;
      const targetDensity = globalDensity + baseDensity[i] + layer.jitterDensity * 0.1;
      const targetPattern = lerp(globalPattern, layer.jitterPattern, 0.35);

      layer.offset.lerp(targetOffset, 0.08);
      layer.rotation = damp(layer.rotation, targetRotation, 6, 1 / 60);
      layer.scale = damp(layer.scale, targetScale, 6, 1 / 60);
      layer.density = damp(layer.density, targetDensity, 4, 1 / 60);
      layer.patternMix = damp(layer.patternMix, targetPattern, 4, 1 / 60);

      const colorA = sceneA.colorObjects[i % sceneA.colorObjects.length];
      const colorB = sceneB.colorObjects[i % sceneB.colorObjects.length];
      const blended = lerpColor(colorA, colorB, localT);

      layer.uniforms.uColor.value.copy(blended);
      layer.uniforms.uTime.value = t;
      layer.uniforms.uOffset.value.copy(layer.offset);
      layer.uniforms.uRotation.value = layer.rotation;
      layer.uniforms.uScale.value = layer.scale;
      layer.uniforms.uDensity.value = layer.density;
      layer.uniforms.uPatternMix.value = layer.patternMix;
      layer.uniforms.uLightDir.value.copy(lightDir);
      layer.uniforms.uSeed.value = layer.seed;

      shadowVector.set(-lightDir.x, -lightDir.y).multiplyScalar(0.08 + i * 0.02);
      layer.shadow.offset.copy(layer.offset).add(shadowVector);
      layer.shadow.uniforms.uTime.value = t;
      layer.shadow.uniforms.uOffset.value.copy(layer.shadow.offset);
      layer.shadow.uniforms.uRotation.value = layer.rotation;
      layer.shadow.uniforms.uScale.value = layer.scale * 1.01;
      layer.shadow.uniforms.uDensity.value = layer.density;
      layer.shadow.uniforms.uPatternMix.value = layer.patternMix;
      layer.shadow.uniforms.uLightDir.value.copy(lightDir);
      layer.shadow.uniforms.uSeed.value = layer.seed;
    });

    renderer.render(scene, camera);
  };

  const renderOnce = () => renderFrame(performance.now());

  if (!prefersReducedMotion) {
    const animate = (time) => {
      renderFrame(time);
      window.requestAnimationFrame(animate);
    };
    window.requestAnimationFrame(animate);
  } else {
    renderOnce();
  }

  window.addEventListener("resize", () => {
    updateSize();
    if (prefersReducedMotion) {
      renderOnce();
    }
  }, { passive: true });

  window.addEventListener("scroll", () => {
    updateScroll();
    if (prefersReducedMotion) {
      renderOnce();
    }
  }, { passive: true });

  window.addEventListener("pointerdown", () => {
    randomizeLayers();
    if (prefersReducedMotion) {
      renderOnce();
    }
  }, { passive: true });

  updateScroll();
  updateSize();

  function updateSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    replaceGeometry(aspect);
  }

  function replaceGeometry(aspect) {
    const width = aspect * 2;
    const height = 2;
    const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
    if (planeGeometry) {
      planeGeometry.dispose();
    }
    planeGeometry = geometry;
    layers.forEach((layer) => {
      layer.mesh.geometry = planeGeometry;
    });
  }

  function getPlaneGeometry() {
    if (!planeGeometry) {
      planeGeometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    }
    return planeGeometry;
  }

  function createGrainTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 200 + Math.random() * 55;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return new THREE.CanvasTexture(canvas);
  }
})();
