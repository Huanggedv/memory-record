/*
 * SOUND MAP — record-player edition
 *
 * Every photograph in assets/photos.json becomes a playable record. The photo
 * is cropped into a flat black-and-white disc with grain. Small colour marks
 * are explicit sound targets: click a mark to hear that place, or press the
 * Arduino FSR to move to the next photograph and play its first sound.
 */

let photoManifest = [];
let scenes = [];
let sceneIndex = 0;
let currentImage = null;
let coverImage = null;
let coverImages = [];
let coverIndex = -1;
let coverOrder = [];
let coverOrderPosition = 0;
let imageCache = {};
// Prepared black-and-white pixels; never publish a raw colour image first.
let currentPhotoAsset = null;
let photoRequestVersion = 0;
const preparedPhotoCache = new Map();
const PREPARED_PHOTO_CACHE_LIMIT = 3;
let photoMixCanvas = null;
let photoMixAsset = null;
let photoMixAmount = -1;
const SOUND_MAP_BUILD = "BW-PIXELS-04";
if (typeof window !== "undefined") window.SOUND_MAP_BUILD = SOUND_MAP_BUILD;
console.info(`[SOUND MAP] ${SOUND_MAP_BUILD}`);
const DEFAULT_SCENE_FILE = "02f68b85bj95bd1bfee5b74568f91b64.JPG";
const COVER_FILES = Array.from({ length: 17 }, (_, index) => `assets/covers/${index + 1}.jpg`);
let hoveredHotspot = null;
let activeHotspot = null;
let stickers = [];
let scoreNotes = [];
let targetPressure = .62;
let pressure = .62;
// The Arduino potentiometer controls the photograph's colour treatment:
// 0 = fully black and white, 1 = the original photograph colour.
let targetSaturation = 0;
let imageSaturation = 0;
let potInteractionActive = false;
let lastPotRaw = null;
const POT_MOVE_THRESHOLD = 14;
const POT_ENDPOINT_SNAP = .025;
let photoHasDrawn = false;
// Soft pickup: a knob left at the colour end cannot recolour a new photo.
// Return it to the black-and-white end, then slide upwards to reveal colour.
let potPickupReady = false;
let potPickupRaw = null;
let potMoveStartedAt = null;
let potMoveSamples = 0;
let potLastMoveSampleAt = -Infinity;
const POT_MOVE_CONFIRM_MS = 70;
const POT_MOVE_CONFIRM_SAMPLES = 3;
let potCalibrationLow = 1023;
let potCalibrationHigh = 0;
let recordAngle = 0;
let audioContext = null;
const AMBIENT_TRACKS = [
  "assets/music/01-dog-playtime.flac",
  "assets/music/02-small-happiness.flac",
  "assets/music/03-the-wind.flac",
  "assets/music/04-the-fate-of-the-promise.flac"
];
let ambientAudio = null;
let ambientTrackIndex = 0;
let ambientMusicStarted = false;
let lastHitAt = -1000;
let connectButton;
let serialStatus;
let soundStatus;
let sceneNumber;
let sceneName;
let sceneCount;
let nativePort = null;
let nativeReader = null;
let nativeWriter = null;
let serialBuffer = "";
let serialConnected = false;
let serialOpening = false;
let serialLastRxAt = 0;
let serialRequestId = 0;
let sleeveOpen = false;
let recentArduinoPresses = [];
// Three hits must be a deliberate rapid gesture, not three ordinary presses
// spread across several seconds.
const TRIPLE_PRESS_WINDOW_MS = 900;
let saveButton = null;

// Measure endpoints afresh in this session. Old stored values are not used.
// A full sweep once after loading establishes the actual hardware endpoints.

const PALETTE = [
  [255, 79, 61], [36, 84, 255], [200, 239, 55], [22, 190, 184],
  [137, 83, 255], [255, 150, 32], [238, 72, 166]
];
const KLEIN_BLUE = [0, 47, 167];

const DEFAULT_HOTSPOTS = [
  { x: .50, y: .18, id: "air", label: "AIR", sound: "wind", color: 3 },
  { x: .82, y: .50, id: "people", label: "PEOPLE", sound: "crowd", color: 0 },
  { x: .52, y: .82, id: "surface", label: "SURFACE", sound: "steps", color: 1 },
  { x: .18, y: .50, id: "room", label: "ROOM", sound: "room", color: 2 }
];

// A few photos have obvious, meaningful locations. These are intentionally
// small, visible targets: no invisible semantic guessing and no false water
// sound when the user clicks somewhere else.
const SPECIAL_HOTSPOTS = {
  "9fa22b308m8aaf1855c8391516f74f2c.JPG": [
    { x: .55, y: .65, id: "bottle", label: "WATER", sound: "water", color: 3 },
    { x: .29, y: .69, id: "voices", label: "VOICES", sound: "crowd", color: 0 },
    { x: .82, y: .60, id: "floor", label: "STEPS", sound: "steps", color: 1 },
    { x: .61, y: .25, id: "space", label: "SPACE", sound: "room", color: 2 }
  ],
  "43e4e43d6ib8217f60f17994b14b4445.JPG": [
    { x: .50, y: .49, id: "child", label: "PLAY", sound: "child", color: 0 },
    { x: .22, y: .67, id: "rope", label: "ROPE", sound: "rope", color: 2 },
    { x: .13, y: .23, id: "trees", label: "LEAVES", sound: "leaves", color: 3 },
    { x: .80, y: .25, id: "air", label: "AIR", sound: "wind", color: 1 }
  ],
  "6a5bda407oaff9f608a66b33df99afec.jpg": [
    { x: .40, y: .68, id: "walk", label: "WALK", sound: "steps", color: 0 },
    { x: .74, y: .63, id: "road", label: "ROAD", sound: "road", color: 1 },
    { x: .13, y: .25, id: "leaves", label: "LEAVES", sound: "leaves", color: 2 },
    { x: .52, y: .16, id: "canopy", label: "CANOPY", sound: "wind", color: 3 }
  ],
  "dd406a669j4217f0a3d617a735b7ea5f.JPG": [
    { x: .69, y: .60, id: "water", label: "WATER", sound: "pool", color: 3 },
    { x: .44, y: .47, id: "laugh", label: "LAUGH", sound: "child", color: 0 },
    { x: .82, y: .48, id: "splash", label: "SPLASH", sound: "splash", color: 1 },
    { x: .16, y: .70, id: "tiles", label: "TILES", sound: "room", color: 4 }
  ],
  "a1336f7cfvf1d26f8c77d78bab6f7570.JPG": [
    { x: .48, y: .42, id: "friends", label: "FRIENDS", sound: "crowd", color: 0 },
    { x: .81, y: .36, id: "laugh", label: "LAUGH", sound: "child", color: 2 },
    { x: .19, y: .70, id: "yard", label: "YARD", sound: "room", color: 1 },
    { x: .58, y: .78, id: "shoes", label: "SHOES", sound: "steps", color: 4 }
  ],
  "6bf28ca49n303839dd5725cd1aede24a.jpg": [
    { x: .38, y: .30, id: "scissors", label: "SCISSORS", sound: "scissors", color: 0 },
    { x: .78, y: .34, id: "mirror", label: "MIRROR", sound: "room", color: 1 },
    { x: .20, y: .72, id: "chair", label: "CHAIR", sound: "chair", color: 2 },
    { x: .61, y: .74, id: "talk", label: "TALK", sound: "voices", color: 3 }
  ]
};

function preload() {
  photoManifest = loadJSON("assets/photos.json");
  coverImages = COVER_FILES.map((file) => loadImage(file));
  // Keep the original artwork as a fallback if a cover asset is unavailable.
  coverImage = loadImage("assets/album-cover.jpg");
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-wrap");
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  connectButton = document.getElementById("connect-button");
  serialStatus = document.getElementById("serial-status");
  soundStatus = document.getElementById("sound-status");
  saveButton = document.getElementById("save-button");
  sceneNumber = document.getElementById("scene-number");
  sceneName = document.getElementById("scene-name");
  sceneCount = document.getElementById("scene-count");
  setupAmbientMusic();
  if (connectButton) connectButton.addEventListener("click", toggleSerial);
  if (saveButton) saveButton.addEventListener("click", downloadPostcard);
  // Keep the UI in sync when the board is unplugged (or when another tab
  // takes the port).  Without this listener the button could remain in the
  // CONNECTED state while no data was reaching the sketch.
  if (supportsSerial()) navigator.serial.addEventListener("disconnect", handleSerialDisconnect);
  // Depending on the p5 JSON loader version, a top-level array can arrive as
  // an array or as an object with numeric keys. Normalize both forms so the
  // complete gallery is always available.
  const manifest = Array.isArray(photoManifest) ? photoManifest : Object.values(photoManifest || {});
  scenes = manifest.filter((file) => typeof file === "string").map((file, index) => ({ file, index, hotspots: SPECIAL_HOTSPOTS[file] || DEFAULT_HOTSPOTS }));
  if (sceneCount) sceneCount.textContent = `/ ${String(scenes.length).padStart(3, "0")}`;
  const defaultIndex = scenes.findIndex((scene) => scene.file === DEFAULT_SCENE_FILE);
  chooseScene(defaultIndex >= 0 ? defaultIndex : 0);
}

function draw() {
  pressure = lerp(pressure, targetPressure, .12);
  // Saturation is intentionally not interpolated on photo changes. The
  // record stays monochrome until the user physically turns the potentiometer.
  imageSaturation = potInteractionActive ? targetSaturation : 0;
  recordAngle += .0015 + pressure * .004;
  background(245, 246, 248);
  if (sleeveOpen && coverImage && coverImage.width) {
    drawCoverArt();
  } else {
    drawRecordPlayer();
    if (currentPhotoAsset && currentImage) photoHasDrawn = true;
    drawTargets();
    drawStickers();
    drawScoreOrbit();
  }
}

function resetPhotoSaturation() {
  targetSaturation = 0;
  imageSaturation = 0;
  potInteractionActive = false;
  photoHasDrawn = false;
  potPickupReady = false;
  potPickupRaw = null;
  clearPotMoveCandidate();
}

function clearPotMoveCandidate() {
  potMoveStartedAt = null;
  potMoveSamples = 0;
  potLastMoveSampleAt = -Infinity;
}

function preparePhotoAsset(file, img) {
  const cached = preparedPhotoCache.get(file);
  if (cached && cached.image === img) {
    // LRU order: avoid keeping a second full-resolution copy of every photo.
    preparedPhotoCache.delete(file);
    preparedPhotoCache.set(file, cached);
    return cached;
  }
  const source = img.canvas || img.elt;
  if (!source || !source.width || !source.height) {
    throw new Error(`Photo has no readable pixel source: ${file}`);
  }
  const gray = document.createElement("canvas");
  gray.width = source.width;
  gray.height = source.height;
  const ctx = gray.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("A 2D canvas context is required");
  ctx.drawImage(source, 0, 0);
  const frame = ctx.getImageData(0, 0, gray.width, gray.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    // Equal RGB values are genuinely monochrome. No brightness gain, contrast
    // boost, exposure lift, white overlay or temporal fade is applied here.
    const value = Math.round(
      .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]
    );
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
  }
  ctx.putImageData(frame, 0, 0);
  const asset = { image: img, color: source, gray };
  preparedPhotoCache.set(file, asset);
  while (preparedPhotoCache.size > PREPARED_PHOTO_CACHE_LIMIT) {
    preparedPhotoCache.delete(preparedPhotoCache.keys().next().value);
  }
  return asset;
}

function photoCanvasForSaturation(asset, amount) {
  const saturation = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  if (saturation === 0) return asset.gray;
  if (saturation === 1) return asset.color;
  if (!photoMixCanvas) photoMixCanvas = document.createElement("canvas");
  if (photoMixAsset !== asset || photoMixAmount !== saturation) {
    if (photoMixCanvas.width !== asset.gray.width || photoMixCanvas.height !== asset.gray.height) {
      photoMixCanvas.width = asset.gray.width;
      photoMixCanvas.height = asset.gray.height;
    }
    const ctx = photoMixCanvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, photoMixCanvas.width, photoMixCanvas.height);
    // Add weighted premultiplied colours offscreen. This also preserves alpha
    // for transparent images, unlike stacking two source-over layers.
    ctx.globalAlpha = 1 - saturation;
    ctx.drawImage(asset.gray, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = saturation;
    ctx.drawImage(asset.color, 0, 0);
    ctx.restore();
    photoMixAsset = asset;
    photoMixAmount = saturation;
  }
  return photoMixCanvas;
}

function installScenePhoto(file, img, version) {
  if (version !== photoRequestVersion || scenes[sceneIndex]?.file !== file) return;
  try {
    // Preparation completes BEFORE either current-image reference is exposed.
    const asset = preparePhotoAsset(file, img);
    resetPhotoSaturation();
    currentPhotoAsset = asset;
    currentImage = img;
  } catch (error) {
    currentImage = null;
    currentPhotoAsset = null;
    console.error(`[SOUND MAP] Cannot prepare monochrome photo: ${file}`, error);
    // Fail closed: retain the original neutral placeholder, never fall back
    // to displaying the colour source when grayscale preparation fails.
    if (soundStatus) soundStatus.textContent = "PHOTO COULD NOT BE PREPARED";
  }
}

function chooseScene(index, preserveScore = false) {
  if (!scenes.length) return;
  const version = ++photoRequestVersion;
  resetPhotoSaturation();
  currentImage = null;
  currentPhotoAsset = null;
  sceneIndex = (index + scenes.length) % scenes.length;
  const scene = scenes[sceneIndex];
  hoveredHotspot = null; activeHotspot = null; stickers = [];
  if (!preserveScore) scoreNotes = [];
  if (sceneNumber) sceneNumber.textContent = String(sceneIndex + 1).padStart(3, "0");
  if (sceneName) sceneName.textContent = `PHOTO ${String(sceneIndex + 1).padStart(3, "0")}`;
  const cached = imageCache[scene.file];
  if (cached) {
    installScenePhoto(scene.file, cached, version);
  } else {
    loadImage(`assets/photos/${encodeURIComponent(scene.file)}`, (img) => {
      imageCache[scene.file] = img;
      installScenePhoto(scene.file, img, version);
    }, (error) => {
      if (version !== photoRequestVersion) return;
      console.error(`[SOUND MAP] Photo load failed: ${scene.file}`, error);
      if (soundStatus) soundStatus.textContent = "PHOTO LOAD FAILED";
    });
  }
  sendSceneColor();
}

function drawCoverArt() {
  const g = recordGeometry();
  // Deliberately larger than the circular record so no edge of the old disc
  // or the former drawn sleeve can peek out from underneath.
  const coverSize = min(width * .78, height * .82);
  const left = g.cx - coverSize * .5;
  const top = g.cy - coverSize * .5;
  image(coverImage, left, top, coverSize, coverSize);
}

function advancePhoto() {
  chooseScene(sceneIndex + 1);
  setTimeout(() => { if (scenes[sceneIndex]) triggerHotspot(scenes[sceneIndex].hotspots[0], pressure, true); }, 90);
}

function recordGeometry() {
  const diameter = min(width * .68, height * .72);
  return { cx: width * .50, cy: height * .50, d: diameter, r: diameter * .5 };
}

function drawRecordPlayer() {
  const g = recordGeometry();
  noStroke(); fill(10, 10, 10, 255); ellipse(g.cx, g.cy, g.d * 1.04, g.d * 1.04);
  push(); translate(g.cx, g.cy); rotate(recordAngle * .12);
  drawingContext.save(); drawingContext.beginPath(); drawingContext.arc(0, 0, g.r * .92, 0, TWO_PI); drawingContext.clip();
  if (currentImage && currentImage.width && currentPhotoAsset) {
    const scale = max(g.d * .92 / currentImage.width, g.d * .92 / currentImage.height); const dw = currentImage.width * scale; const dh = currentImage.height * scale;
    // The first visible frame can only select PREPARED grayscale pixels.
    // Neither a stale saturation value nor a delayed loader can draw colour.
    const amount = photoHasDrawn && potPickupReady && potInteractionActive
      ? imageSaturation : 0;
    const source = photoCanvasForSaturation(currentPhotoAsset, amount);
    drawingContext.globalAlpha = 1;
    drawingContext.globalCompositeOperation = "source-over";
    drawingContext.drawImage(source, -dw * .5, -dh * .5, dw, dh);
  } else { fill(224, 224, 217); ellipse(0, 0, g.d * .92, g.d * .92); }
  drawingContext.restore();
  drawingContext.save(); drawingContext.beginPath(); drawingContext.arc(0, 0, g.r * .92, 0, TWO_PI); drawingContext.clip(); noStroke();
  for (let i = 0; i < 650; i += 1) { const a = noise(i * .17, sceneIndex * 9.2) * TWO_PI; const rr = sqrt(noise(i * .09, sceneIndex * 2.7)) * g.r * .91; fill(0, 0, 0, 8 + noise(i * .13, 4) * 24); ellipse(cos(a) * rr, sin(a) * rr, .8 + noise(i * .2) * 2.4, .8 + noise(i * .21) * 2.4); }
  drawingContext.restore(); pop();
  noFill(); stroke(255, 255, 255, 26); strokeWeight(1);
  for (let i = 0; i < 7; i += 1) ellipse(g.cx, g.cy, g.d * (.72 + i * .055), g.d * (.72 + i * .055));
  noStroke(); fill(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2]); ellipse(g.cx, g.cy, g.d * .20, g.d * .20); fill(245, 246, 248); ellipse(g.cx, g.cy, 7, 7);
}

// A flat, translucent record sleeve. It is deliberately built from crisp
// vector planes and registration marks rather than a glossy 3D effect, so the
// black-and-white record and its colour accents remain the visual focus.
function drawRecordSleeve() {
  const g = recordGeometry();
  const pad = g.r * .28;
  const left = g.cx - g.r - pad;
  const top = g.cy - g.r - pad;
  const size = g.d + pad * 2;
  const offsetX = g.r * .06;
  const offsetY = -g.r * .05;
  push();
  rectMode(CORNER);
  strokeCap(SQUARE); strokeJoin(MITER);
  // Two transparent acetate sheets create the offset-printing effect of a
  // real record package while keeping the photograph visible underneath.
  noStroke(); fill(255, 255, 255, 24); rect(left, top, size, size, 1);
  stroke(18, 18, 18, 210); strokeWeight(1.2); noFill(); rect(left, top, size, size, 1);
  stroke(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 215); strokeWeight(2);
  rect(left + offsetX, top + offsetY, size, size, 1);
  // A second, tiny acid registration edge gives the sleeve a printed-object
  // quality without making it look glossy or three-dimensional.
  stroke(200, 239, 55, 220); strokeWeight(1.4);
  rect(left - 6, top + 7, size, size, 1);

  // The supplied artwork is the physical album cover inside the sleeve. It
  // sits as a generous square card over the record, leaving a clear acetate
  // margin so the package still reads as transparent and centered.
  const coverSize = size * .78;
  const coverLeft = g.cx - coverSize * .5;
  const coverTop = g.cy - coverSize * .5;
  if (coverImage && coverImage.width) {
    noStroke(); fill(255, 255, 255, 16); rect(coverLeft, coverTop, coverSize, coverSize);
    image(coverImage, coverLeft, coverTop, coverSize, coverSize);
    stroke(18, 18, 18, 175); strokeWeight(1.2); noFill(); rect(coverLeft, coverTop, coverSize, coverSize);
    stroke(200, 239, 55, 190); strokeWeight(1); rect(coverLeft + 7, coverTop - 5, coverSize, coverSize);
  }

  // Spine strip and top flap: the central object reads as a physical sleeve,
  // not a square overlay.
  noStroke(); fill(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 28);
  rect(left, top, size * .085, size);
  stroke(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 180); strokeWeight(1);
  line(left + size * .085, top, left + size * .085, top + size);
  noStroke(); fill(255, 255, 255, 48);
  beginShape(); vertex(left + size * .13, top); vertex(left + size * .88, top); vertex(left + size * .78, top + size * .14); vertex(left + size * .20, top + size * .14); endShape(CLOSE);
  stroke(18, 18, 18, 120); strokeWeight(1); noFill();
  line(left + size * .20, top + size * .14, left + size * .78, top + size * .14);
  // One restrained diagonal acetate panel makes the fold legible without
  // turning the sleeve into a busy X-shaped graphic.
  noStroke(); fill(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 16);
  beginShape(); vertex(left + size * .74, top + size * .14); vertex(left + size * .88, top + size * .14); vertex(left + size * .30, top + size * .88); vertex(left + size * .16, top + size * .88); endShape(CLOSE);
  stroke(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 95); strokeWeight(1);
  line(left + size * .74, top + size * .14, left + size * .30, top + size * .88);

  // Circular thumb notch and cobalt seal, like a die-cut paper sleeve.
  noFill(); stroke(18, 18, 18, 155); strokeWeight(1.2);
  arc(left + size * .50, top + size, size * .18, size * .12, PI, TWO_PI);
  noStroke(); fill(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 228);
  ellipse(left + size * .82, top + size * .18, size * .085, size * .085);
  stroke(255, 255, 255, 210); strokeWeight(1); noFill();
  ellipse(left + size * .82, top + size * .18, size * .052, size * .052);

  // Sparse grain on the acetate catches light like a scanned print. The
  // fixed seed keeps the downloaded postcard stable frame-to-frame.
  randomSeed(800 + sceneIndex * 17);
  noStroke();
  for (let i = 0; i < 120; i += 1) {
    const gx = random(left + 8, left + size - 8);
    const gy = random(top + 8, top + size - 8);
    fill(18, 18, 18, random(6, 22));
    rect(gx, gy, random(.4, 1.4), random(.4, 1.4));
  }
  // Registration/crop marks finish the packaging language at the four edges.
  const mark = 18;
  stroke(18, 18, 18, 190); strokeWeight(1.2);
  line(left - 9, top + mark, left - 9, top - 9); line(left - 9, top - 9, left + mark, top - 9);
  line(left + size - mark, top + size + 9, left + size + 9, top + size + 9); line(left + size + 9, top + size + 9, left + size + 9, top + size - mark);
  stroke(KLEIN_BLUE[0], KLEIN_BLUE[1], KLEIN_BLUE[2], 200); strokeWeight(2);
  line(left + size * .18, top + size + 14, left + size * .78, top + size + 14);
  pop();
}

function setSleeveState(open) {
  sleeveOpen = open;
  sendLedState(open);
  if (open) chooseRandomCover();
  if (saveButton) saveButton.hidden = !open;
  if (soundStatus) soundStatus.textContent = open ? "POSTCARD READY" : "Choose a place in the photograph";
}

function chooseRandomCover() {
  const available = coverImages
    .map((image, index) => ({ image, index }))
    .filter((entry) => entry.image && entry.image.width);
  if (!available.length) return;

  const availableIndices = available.map((entry) => entry.index);
  const sameSet = coverOrder.length === availableIndices.length
    && coverOrder.every((index) => availableIndices.includes(index));
  if (!sameSet || coverOrderPosition >= coverOrder.length) {
    // Fisher–Yates shuffle creates a no-repeat deck for each complete round.
    coverOrder = [...availableIndices];
    for (let i = coverOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [coverOrder[i], coverOrder[j]] = [coverOrder[j], coverOrder[i]];
    }
    // Keep the boundary between two rounds from repeating the last cover.
    if (coverOrder.length > 1 && coverOrder[0] === coverIndex) {
      [coverOrder[0], coverOrder[1]] = [coverOrder[1], coverOrder[0]];
    }
    coverOrderPosition = 0;
  }

  coverIndex = coverOrder[coverOrderPosition];
  coverOrderPosition += 1;
  coverImage = coverImages[coverIndex];
}

function downloadPostcard() {
  // p5's saveCanvas captures the current artwork, including the transparent
  // sleeve, without adding the HTML controls to the downloaded image.
  saveCanvas(`memory-postcard-${String(sceneIndex + 1).padStart(3, "0")}`, "png");
}

function handleArduinoHit(zone) {
  const now = millis();
  // Once the postcard is open, one further press returns to the record.
  if (sleeveOpen) {
    setSleeveState(false);
    recentArduinoPresses = [];
    return;
  }
  recentArduinoPresses = recentArduinoPresses.filter((t) => now - t <= TRIPLE_PRESS_WINDOW_MS);
  recentArduinoPresses.push(now);
  if (recentArduinoPresses.length >= 3) {
    recentArduinoPresses = [];
    setSleeveState(true);
    return;
  }
  if (zone) triggerHotspot((scenes[sceneIndex]?.hotspots || []).find((h) => h.id === zone), targetPressure);
  else advancePhoto();
}

function drawTargets() {
  const g = recordGeometry(); const list = scenes[sceneIndex]?.hotspots || [];
  list.forEach((h) => { const p = hotspotPoint(h); const selected = h === activeHotspot; const over = h === hoveredHotspot; const c = sceneColor(h.color); noStroke(); fill(c[0], c[1], c[2], selected || over ? 245 : 190); ellipse(p.x, p.y, selected || over ? 12 : 7, selected || over ? 12 : 7); if (selected || over) { noFill(); stroke(c[0], c[1], c[2], 240); strokeWeight(2); ellipse(p.x, p.y, g.d * .07, g.d * .07); stroke(18, 18, 18, 220); strokeWeight(1); line(p.x - 5, p.y, p.x + 5, p.y); line(p.x, p.y - 5, p.x, p.y + 5); } });
}

function hotspotPoint(h) { const g = recordGeometry(); return { x: g.cx + (h.x - .5) * g.d * .92, y: g.cy + (h.y - .5) * g.d * .92 }; }
function findHotspot(x, y) { const g = recordGeometry(); let found = null; let best = Infinity; (scenes[sceneIndex]?.hotspots || []).forEach((h) => { const p = hotspotPoint(h); const d = dist(x, y, p.x, p.y); if (d < g.d * .055 && d < best) { found = h; best = d; } }); return found; }

function drawStickers() { stickers.forEach((s) => { s.life -= .0055; const p = s.position; const c = sceneColor(s.color); push(); translate(p.x, p.y); rotate(s.rotation); scale(.9 + (1 - s.life) * .1); drawSoundSticker(s.sound, c, s.size, s.phase); pop(); }); stickers = stickers.filter((s) => s.life > 0); }

function drawSoundSticker(sound, c, size, phase) {
  stroke(18, 18, 18, 235); strokeWeight(2.2); noFill();
  if (sound === "wind" || sound === "leaves") { for (let i = 0; i < 3; i += 1) { beginShape(); for (let x = -size; x <= size; x += 8) vertex(x, i * 8 - 10 + sin(x * .035 + phase + i) * 9); endShape(); } stroke(c[0], c[1], c[2], 240); strokeWeight(5); line(-size * .7, 13, size * .55, -9); }
  else if (["water", "pool", "splash"].includes(sound)) { stroke(c[0], c[1], c[2], 240); strokeWeight(4); for (let i = 0; i < 3; i += 1) arc(0, i * 8, size * (1.2 + i * .3), size * (.28 + i * .1), .1, PI - .1); noStroke(); fill(c[0], c[1], c[2], 230); ellipse(size * .24, -size * .42, 8, 13); }
  else if (["steps", "road"].includes(sound)) { noStroke(); fill(c[0], c[1], c[2], 230); ellipse(-size * .28, -size * .12, 13, 24); ellipse(size * .16, size * .18, 13, 24); }
  else if (["crowd", "voices", "child"].includes(sound)) { noStroke(); fill(c[0], c[1], c[2], 225); ellipse(-12, 6, 16, 16); ellipse(10, -3, 19, 19); ellipse(28, 10, 13, 13); stroke(18, 18, 18, 220); strokeWeight(2); arc(0, 0, size * .95, size * .7, PI + .2, TWO_PI - .2); }
  else if (sound === "scissors") { stroke(c[0], c[1], c[2], 240); strokeWeight(5); line(-size * .4, size * .3, size * .4, -size * .3); line(-size * .4, -size * .3, size * .4, size * .3); noFill(); stroke(18, 18, 18, 230); strokeWeight(2); ellipse(-size * .38, size * .3, 15, 15); ellipse(-size * .38, -size * .3, 15, 15); }
  else if (sound === "rope") { stroke(c[0], c[1], c[2], 240); strokeWeight(6); arc(0, 0, size * 1.1, size * .75, PI + .2, TWO_PI - .2); arc(0, 8, size * .85, size * .5, .15, PI - .15); }
  else { noStroke(); fill(c[0], c[1], c[2], 225); rectMode(CENTER); rect(0, 0, size * .7, size * .58, 5); rectMode(CORNER); stroke(18, 18, 18, 220); strokeWeight(2); line(-size * .28, 0, size * .28, 0); }
}

function drawScoreOrbit() {
  const x = width * .88; const base = min(width * .13, 96);
  // Align the outer ring's bottom edge with the CONNECT button's bottom edge.
  const y = height - 22 - base * .605;
  noFill(); stroke(18, 18, 18, 115); strokeWeight(1);
  for (let i = 0; i < 4; i += 1) ellipse(x, y, base * (.55 + i * .22), base * (.55 + i * .22));
  scoreNotes.forEach((note, i) => { const a0 = -PI * .9 + (i / max(1, scoreNotes.length)) * TWO_PI * .68; const a1 = a0 + .22 + note.level * .3; const radius = base * (.28 + (i % 4) * .105); const c = sceneColor(note.color); stroke(c[0], c[1], c[2], 235); strokeWeight(4); arc(x, y, radius * 2, radius * 2, a0, a1); const gx = x + cos(a1) * radius; const gy = y + sin(a1) * radius; noStroke(); fill(c[0], c[1], c[2], 240); ellipse(gx, gy, 8 + note.level * 5, 8 + note.level * 5); drawOrbitGlyph(note.sound, gx, gy, c, 9 + note.level * 8); });
}

function drawOrbitGlyph(sound, x, y, c, size) {
  push(); translate(x, y); stroke(18, 18, 18, 210); strokeWeight(1.5); noFill();
  if (["water", "pool", "splash"].includes(sound)) { noStroke(); fill(c[0], c[1], c[2], 245); ellipse(0, -3, size * .55, size * .9); triangle(-size * .26, -1, size * .26, -1, 0, size * .65); }
  else if (["wind", "leaves"].includes(sound)) { stroke(c[0], c[1], c[2], 245); strokeWeight(2); arc(0, 0, size * 1.5, size * .7, PI + .2, TWO_PI - .2); }
  else if (["steps", "road"].includes(sound)) { noStroke(); fill(c[0], c[1], c[2], 245); ellipse(-size * .22, -size * .15, size * .25, size * .52); ellipse(size * .2, size * .2, size * .25, size * .52); }
  else if (["crowd", "voices", "child"].includes(sound)) { noStroke(); fill(c[0], c[1], c[2], 245); ellipse(-size * .3, 0, size * .45, size * .45); ellipse(0, -size * .22, size * .55, size * .55); ellipse(size * .33, 0, size * .38, size * .38); }
  else if (sound === "scissors") { stroke(c[0], c[1], c[2], 245); strokeWeight(2.5); line(-size * .4, -size * .4, size * .4, size * .4); line(-size * .4, size * .4, size * .4, -size * .4); }
  else { noStroke(); fill(c[0], c[1], c[2], 245); rectMode(CENTER); rect(0, 0, size * .7, size * .7, 2); rectMode(CORNER); }
  pop();
}

function sceneColor(index) { return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]; }

function triggerHotspot(h, level = .62) {
  if (!h || millis() - lastHitAt < 150) return;
  lastHitAt = millis(); targetPressure = constrain(Number(level) || .62, .15, 1); activeHotspot = h; const p = hotspotPoint(h); scoreNotes.push({ color: h.color, sound: h.sound, level: targetPressure }); scoreNotes = scoreNotes.slice(-12); stickers.push({ position: p, sound: h.sound, color: h.color, size: 24 + targetPressure * 34, rotation: (hash(stickers.length) - .5) * .24, phase: frameCount * .04, life: 1 }); playTexture(h.sound, targetPressure); soundStatus.textContent = `${h.label} sound found`; }
function hash(n) { return (sin(n * 91.13 + frameCount * .11) * 43758.5453) % 1 + 1; }
function mouseMoved() { hoveredHotspot = findHotspot(mouseX, mouseY); }
function mousePressed() { unlockAudio(); const h = findHotspot(mouseX, mouseY); if (h) triggerHotspot(h, pressure); return false; }
function touchStarted() { unlockAudio(); const h = findHotspot(mouseX, mouseY); if (h) triggerHotspot(h, pressure); return false; }
function keyPressed() { if (keyCode === RIGHT_ARROW) chooseScene(sceneIndex + 1); else if (keyCode === LEFT_ARROW) chooseScene(sceneIndex - 1); else if (key === " ") { unlockAudio(); triggerHotspot(scenes[sceneIndex]?.hotspots[0], pressure); } }

function setupAmbientMusic() {
  if (ambientAudio || !AMBIENT_TRACKS.length) return;
  ambientAudio = document.createElement("audio");
  ambientAudio.preload = "auto";
  ambientAudio.autoplay = true;
  ambientAudio.loop = false;
  ambientAudio.volume = .72;
  ambientAudio.setAttribute("aria-hidden", "true");
  ambientAudio.style.display = "none";
  ambientAudio.addEventListener("ended", playNextAmbientTrack);
  document.body.appendChild(ambientAudio);
  ambientAudio.src = AMBIENT_TRACKS[ambientTrackIndex];
  // Try on page load. Browsers that block audible autoplay will retry from
  // the first pointer, touch, key, or CONNECT interaction below.
  startAmbientMusic();
  ["pointerdown", "touchstart", "keydown"].forEach((type) => {
    window.addEventListener(type, startAmbientMusic, { passive: true });
  });
}

function startAmbientMusic() {
  if (!ambientAudio || ambientMusicStarted) return;
  const request = ambientAudio.play();
  if (!request || typeof request.then !== "function") {
    ambientMusicStarted = true;
    return;
  }
  request.then(() => {
    ambientMusicStarted = true;
    ["pointerdown", "touchstart", "keydown"].forEach((type) => {
      window.removeEventListener(type, startAmbientMusic);
    });
  }).catch(() => {
    // Audible autoplay is a browser permission, not a code error. The event
    // listeners installed in setupAmbientMusic provide the gesture fallback.
  });
}

function playNextAmbientTrack() {
  if (!ambientAudio) return;
  ambientTrackIndex = (ambientTrackIndex + 1) % AMBIENT_TRACKS.length;
  ambientAudio.src = AMBIENT_TRACKS[ambientTrackIndex];
  ambientAudio.load();
  ambientAudio.play().catch(() => {});
}

function unlockAudio() {
  startAmbientMusic();
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}
function playTexture(kind, level) { if (!audioContext) return; const now = audioContext.currentTime; const gain = audioContext.createGain(); gain.gain.value = .0001; gain.connect(audioContext.destination); const duration = ["wind", "leaves", "room", "pool"].includes(kind) ? .78 : .38; const osc = audioContext.createOscillator(); osc.type = kind === "child" ? "sine" : "triangle"; const base = { water: 310, pool: 180, steps: 100, road: 75, crowd: 170, voices: 250, child: 520, wind: 85, leaves: 230, rope: 150, splash: 260, scissors: 750, chair: 90, room: 140 }[kind] || 180; osc.frequency.setValueAtTime(base, now); osc.frequency.exponentialRampToValueAtTime(base * (["water", "splash"].includes(kind) ? 1.8 : .74), now + duration); gain.gain.exponentialRampToValueAtTime(.018 + level * .035, now + .018); gain.gain.exponentialRampToValueAtTime(.0001, now + duration); osc.connect(gain); osc.start(now); osc.stop(now + duration + .02); if (["wind", "leaves", "crowd", "room", "pool"].includes(kind)) noiseBurst(now, duration, level, kind); }
function noiseBurst(now, duration, level, kind) { const length = floor(audioContext.sampleRate * duration); const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) * (kind === "crowd" ? .32 : .18); const source = audioContext.createBufferSource(); const filter = audioContext.createBiquadFilter(); const gain = audioContext.createGain(); filter.type = ["wind", "leaves"].includes(kind) ? "lowpass" : "bandpass"; filter.frequency.value = kind === "wind" ? 900 : 1600; gain.gain.value = .04 + level * .09; source.buffer = buffer; source.connect(filter).connect(gain).connect(audioContext.destination); source.start(now); }

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
function supportsSerial() { return typeof navigator !== "undefined" && "serial" in navigator; }
function toggleSerial() {
  unlockAudio();
  if (serialOpening) return;
  if (nativePort && serialConnected) disconnectSerial();
  else connectSerial();
}

function serialErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NetworkError" || /busy|in use|open/i.test(error?.message || "")) {
    return "PORT BUSY — CLOSE SERIAL MONITOR";
  }
  if (name === "NotFoundError" || name === "AbortError") return "NO PORT SELECTED";
  if (name === "TimeoutError") return "PORT SELECTION TIMEOUT";
  if (!supportsSerial()) return "USE CHROME OR EDGE";
  return error?.message || "SERIAL ERROR";
}

// Web Serial has no AbortSignal for requestPort(). Race the permission
// chooser against a timeout so an abandoned chooser cannot leave the page in
// SELECT PORT forever. A late result is ignored by the request id token.
async function requestPortWithTimeout(timeoutMs = 15000) {
  const requestId = ++serialRequestId;
  const request = navigator.serial.requestPort();
  // A chooser that is dismissed after the timeout may reject later; consume
  // that rejection so it does not become an unhandled promise.
  request.catch(() => {});
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (requestId === serialRequestId) serialRequestId += 1;
      const error = new Error("Port selection timed out");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  try {
    const port = await Promise.race([request, timeout]);
    if (requestId !== serialRequestId) {
      // The request resolved after the timeout; do not open this stale port.
      try { await port.close(); } catch (_) {}
      return null;
    }
    return port;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function connectSerial() {
  if (!supportsSerial()) {
    serialStatus.textContent = "WEB SERIAL UNAVAILABLE — USE CHROME OR EDGE";
    return;
  }
  if (serialOpening) return;
  serialOpening = true;
  serialBuffer = "";
  serialStatus.textContent = "SELECT PORT";
  if (connectButton) connectButton.textContent = "SELECT PORT";
  try {
    const port = await requestPortWithTimeout();
    if (!port) throw Object.assign(new Error("Port selection timed out"), { name: "TimeoutError" });
    nativePort = port;
    await nativePort.open({ baudRate: 115200 });
    // UNO R4's USB CDC bridge uses DTR as the reset/ready handshake. Some
    // Chrome versions leave it low after open(), which makes the page appear
    // connected while no telemetry reaches the reader. Toggle it explicitly,
    // then give the board time to reboot before sending PING.
    try {
      await nativePort.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((resolve) => setTimeout(resolve, 40));
      await nativePort.setSignals({ dataTerminalReady: true, requestToSend: false });
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 800));
    serialConnected = true;
    serialLastRxAt = performance.now();
    if (connectButton) {
      connectButton.textContent = "CONNECTED";
      connectButton.classList.add("is-connected");
    }
    serialStatus.textContent = "ARDUINO CONNECTED";
    // Start the reader before PING so the Uno reset/ready line and the
    // handshake reply cannot be missed.
    const readerTask = readSerial();
    nativeWriter = nativePort.writable?.getWriter() || null;
    await sendSerial("PING");
    sendSceneColor();
    sendLedState(sleeveOpen);
    void readerTask;
  } catch (error) {
    serialStatus.textContent = serialErrorMessage(error);
    if (connectButton) {
      connectButton.textContent = "CONNECT";
      connectButton.classList.remove("is-connected");
    }
    // If open() succeeded but writer/reader setup failed, release the port so
    // the next click does not inherit a locked stream.
    await cleanupSerial(true);
  } finally {
    serialOpening = false;
  }
}

async function sendSerial(text) {
  if (!nativeWriter || !serialConnected) return false;
  try {
    await nativeWriter.write(new TextEncoder().encode(`${text}\n`));
    return true;
  } catch (error) {
    serialStatus.textContent = serialErrorMessage(error);
    return false;
  }
}
function sendSceneColor() { const c = sceneColor(sceneIndex); sendSerial(`color:${c[0]},${c[1]},${c[2]}`); }
function sendLedState(steady) { sendSerial(steady ? "led:on" : "led:off"); }
async function readSerial() {
  if (!nativePort?.readable) return;
  const reader = nativePort.readable.getReader();
  nativeReader = reader;
  const decoder = new TextDecoder();
  try {
    while (nativePort && nativeReader === reader) {
      const result = await reader.read();
      if (result.done) break;
      serialBuffer += decoder.decode(result.value, { stream: true });
      const lines = serialBuffer.split(/\r?\n/);
      serialBuffer = lines.pop() || "";
      lines.forEach(parseSerial);
    }
  } catch (error) {
    if (serialConnected) {
      serialStatus.textContent = serialErrorMessage(error);
      await cleanupSerial(false);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}
async function handleSerialDisconnect(event) {
  if (!nativePort || (event?.port && event.port !== nativePort)) return;
  serialStatus.textContent = "ARDUINO DISCONNECTED";
  await cleanupSerial(false);
}

async function cleanupSerial(closePort = true) {
  const port = nativePort;
  nativePort = null;
  serialConnected = false;
  serialBuffer = "";
  if (connectButton) {
    connectButton.textContent = "CONNECT";
    connectButton.classList.remove("is-connected");
  }
  const reader = nativeReader;
  nativeReader = null;
  if (reader) {
    try { await reader.cancel(); } catch (_) {}
    // close() rejects while a readable stream is still locked. Release here
    // as well as in readSerial()'s finally so disconnects are deterministic.
    try { reader.releaseLock(); } catch (_) {}
  }
  if (nativeWriter) { try { nativeWriter.releaseLock(); } catch (_) {} nativeWriter = null; }
  if (closePort && port) { try { await port.close(); } catch (_) {} }
}

async function disconnectSerial() {
  serialStatus.textContent = "DISCONNECTING";
  await sendLedState(false);
  await cleanupSerial(true);
  serialStatus.textContent = "ARDUINO DISCONNECTED";
}

function potSaturationAmount(raw) {
  const span = potCalibrationHigh - potCalibrationLow;
  const amount = span >= 120
    ? constrain((raw - potCalibrationLow) / span, 0, 1)
    : constrain(raw / 1023, 0, 1);
  return amount <= POT_ENDPOINT_SNAP ? 0
    : amount >= 1 - POT_ENDPOINT_SNAP ? 1 : amount;
}

function updateSaturationFromPot(rawValue, allowControl = true) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 1023) return;
  const raw = numericValue;
  lastPotRaw = raw;
  // A hit packet contains a position snapshot, NOT a new sliding gesture.
  if (!allowControl) return;
  potCalibrationLow = min(potCalibrationLow, raw);
  potCalibrationHigh = max(potCalibrationHigh, raw);
  if (!photoHasDrawn || !currentPhotoAsset) {
    targetSaturation = 0;
    imageSaturation = 0;
    return;
  }
  const amount = potSaturationAmount(raw);
  if (!potPickupReady) {
    targetSaturation = 0;
    imageSaturation = 0;
    // A physical control cannot move itself when software resets a photo.
    // Soft pickup avoids a high-position -> colour -> black jump as the user
    // returns the slider to the black-and-white endpoint.
    if (amount === 0) {
      potPickupReady = true;
      potPickupRaw = raw;
    }
    return;
  }
  if (!potInteractionActive) {
    if (amount === 0) {
      potPickupRaw = raw;
      clearPotMoveCandidate();
      targetSaturation = 0;
      return;
    }
    if (potPickupRaw === null || raw - potPickupRaw < POT_MOVE_THRESHOLD) {
      clearPotMoveCandidate();
      targetSaturation = 0;
      return;
    }
    const now = performance.now();
    if (potMoveStartedAt === null) potMoveStartedAt = now;
    // Packets in one buffered batch do not count as multiple fresh gestures.
    if (now - potLastMoveSampleAt >= 15) {
      potMoveSamples += 1;
      potLastMoveSampleAt = now;
    }
    if (potMoveSamples < POT_MOVE_CONFIRM_SAMPLES || now - potMoveStartedAt < POT_MOVE_CONFIRM_MS) {
      targetSaturation = 0;
      return;
    }
    potInteractionActive = true;
  }
  targetSaturation = amount;
}

function parseSerial(line) {
  const text = String(line).trim().toLowerCase();
  if (!text) return;
  serialLastRxAt = performance.now();
  // Keep the diagnostic text out of the canvas, but make it available when
  // inspecting the page or a screen reader.  This is useful for distinguishing
  // a connected-but-idle board from a port that is locked by another tab.
  if (serialStatus && !serialStatus.textContent.includes("ERROR")) serialStatus.textContent = "ARDUINO DATA RECEIVED";
  const p = text.match(/pressure\s*:\s*(\d+(?:\.\d+)?)/);
  if (p) targetPressure = constrain(map(Number(p[1]), 0, 1023, .15, 1), .15, 1);
  const knob = text.match(/pot\s*:\s*(\d+(?:\.\d+)?)/);
  const s = text.match(/scene\s*:\s*(\d+)/);
  const isHit = text.startsWith("hit") || /^event\s*:\s*press\b/.test(text);
  // Process the hit/scene snapshot without allowing it to enable colour.
  if (knob) updateSaturationFromPot(knob[1], !isHit && !s);
  if (s) chooseScene(Number(s[1]) - 1);
  const z = text.match(/zone\s*:\s*([a-z]+)/);
  // Do not use text.includes("press"): the telemetry packet
  // "pressure:..." also contains that substring and would advance the
  // gallery every 110 ms. Only explicit hit/event packets are triggers.
  if (isHit) {
    handleArduinoHit(z ? z[1] : null);
  }
}

// Non-visual diagnostics: verify the loaded build without altering the design.
if (typeof window !== "undefined") {
  window.soundMapDebug = () => ({
    build: SOUND_MAP_BUILD,
    photo: scenes[sceneIndex]?.file || null,
    photoReady: !!currentPhotoAsset,
    hasDrawn: photoHasDrawn,
    waitingForLowEnd: !potPickupReady,
    colourActive: potInteractionActive,
    saturation: imageSaturation,
    potRaw: lastPotRaw,
    calibration: [potCalibrationLow, potCalibrationHigh]
  });
}
