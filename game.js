// --- 定数定義 ---
const WIDTH = 5;
const HEIGHT = 12;
const DEPTH = 5;
const BLOCK_SIZE = 1;
const DROP_INTERVAL = 800; // ms

// ゲーム状態
const GameState = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  GAME_OVER: 'game_over'
};

// --- グローバル変数 ---
let scene, camera, renderer, controls;
let arena = create3DMatrix(WIDTH, HEIGHT, DEPTH);
let currentPiece, currentPos;
let lastDropTime = 0;
let blocksGroup = new THREE.Group();
let gameState = GameState.WAITING;

// ゲーム統計
let score = 0;
let level = 1;
let linesCleared = 0;
let nextPiece;
let nextPieceRenderer, nextPieceScene, nextPieceCamera;
let ghostGroup;

// スコアリング
let renCount = 0; // 連続消しカウンター
let lastClearWasSpecial = false; // Back To Back判定用

// --- テトリミノ定義 (3D配列: [y][z][x]) ---
// 5×5フィールド用に調整
const tetrominoes = [
  // I (4ブロック)
  [[[1, 1, 1, 1]]],
  // O (キューブ形状 2×2×2)
  [
    [
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
    ],
  ],
  // T
  [
    [
      [0, 1, 0],
      [1, 1, 1],
    ],
  ],
  // L
  [
    [
      [1, 0, 0],
      [1, 1, 1],
    ],
  ],
  // J
  [
    [
      [0, 0, 1],
      [1, 1, 1],
    ],
  ],
  // S
  [
    [
      [0, 1, 1],
      [1, 1, 0],
    ],
  ],
  // Z
  [
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
  ],
  // 3D専用ピース: 縦型I (2×2高さ)
  [
    [
      [1],
    ],
    [
      [1],
    ],
  ],
];

// --- OrbitControls定義（シンプル版） ---
class SimpleOrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
    this.enableDamping = true;
    this.dampingFactor = 0.1;

    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();
    this.panOffset = new THREE.Vector3();
    this.zoomChanged = false;

    this.rotateStart = new THREE.Vector2();
    this.rotateEnd = new THREE.Vector2();
    this.rotateDelta = new THREE.Vector2();

    this.panStart = new THREE.Vector2();
    this.panEnd = new THREE.Vector2();
    this.panDelta = new THREE.Vector2();

    this.dollyStart = new THREE.Vector2();
    this.dollyEnd = new THREE.Vector2();
    this.dollyDelta = new THREE.Vector2();

    this.state = "NONE";
    this.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };

    this.addEventListeners();
    this.update();
  }

  addEventListeners() {
    this.domElement.addEventListener(
      "contextmenu",
      this.onContextMenu.bind(this)
    );
    this.domElement.addEventListener(
      "mousedown",
      this.onMouseDown.bind(this)
    );
    this.domElement.addEventListener(
      "wheel",
      this.onMouseWheel.bind(this)
    );
    this.domElement.addEventListener(
      "mousemove",
      this.onMouseMove.bind(this)
    );
    this.domElement.addEventListener(
      "mouseup",
      this.onMouseUp.bind(this)
    );
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onMouseDown(event) {
    if (event.button === this.mouseButtons.LEFT) {
      this.handleMouseDownRotate(event);
      this.state = "ROTATE";
    } else if (event.button === this.mouseButtons.MIDDLE) {
      this.handleMouseDownDolly(event);
      this.state = "DOLLY";
    } else if (event.button === this.mouseButtons.RIGHT) {
      this.handleMouseDownPan(event);
      this.state = "PAN";
    }
  }

  onMouseMove(event) {
    if (this.state === "ROTATE") {
      this.handleMouseMoveRotate(event);
    } else if (this.state === "DOLLY") {
      this.handleMouseMoveDolly(event);
    } else if (this.state === "PAN") {
      this.handleMouseMovePan(event);
    }
  }

  onMouseUp() {
    this.state = "NONE";
  }

  onMouseWheel(event) {
    this.handleMouseWheel(event);
  }

  handleMouseDownRotate(event) {
    this.rotateStart.set(event.clientX, event.clientY);
  }

  handleMouseDownDolly(event) {
    this.dollyStart.set(event.clientX, event.clientY);
  }

  handleMouseDownPan(event) {
    this.panStart.set(event.clientX, event.clientY);
  }

  handleMouseMoveRotate(event) {
    this.rotateEnd.set(event.clientX, event.clientY);
    this.rotateDelta
      .subVectors(this.rotateEnd, this.rotateStart)
      .multiplyScalar(0.01);

    this.sphericalDelta.theta -= this.rotateDelta.x;
    this.sphericalDelta.phi -= this.rotateDelta.y;

    this.rotateStart.copy(this.rotateEnd);
    this.update();
  }

  handleMouseMoveDolly(event) {
    this.dollyEnd.set(event.clientX, event.clientY);
    this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);

    if (this.dollyDelta.y > 0) {
      this.dollyIn(0.95);
    } else if (this.dollyDelta.y < 0) {
      this.dollyOut(0.95);
    }

    this.dollyStart.copy(this.dollyEnd);
    this.update();
  }

  handleMouseMovePan(event) {
    this.panEnd.set(event.clientX, event.clientY);
    this.panDelta
      .subVectors(this.panEnd, this.panStart)
      .multiplyScalar(0.01);

    this.pan(this.panDelta.x, this.panDelta.y);

    this.panStart.copy(this.panEnd);
    this.update();
  }

  handleMouseWheel(event) {
    if (event.deltaY < 0) {
      this.dollyOut(0.9);
    } else if (event.deltaY > 0) {
      this.dollyIn(0.9);
    }

    this.update();
  }

  dollyIn(dollyScale) {
    this.spherical.radius *= dollyScale;
  }

  dollyOut(dollyScale) {
    this.spherical.radius /= dollyScale;
  }

  pan(deltaX, deltaY) {
    const offset = new THREE.Vector3();
    const position = this.camera.position.clone().sub(this.target);
    const targetDistance = position.length();

    targetDistance *= Math.tan(((this.camera.fov / 2) * Math.PI) / 180.0);

    const panLeft = new THREE.Vector3();
    panLeft.setFromMatrixColumn(this.camera.matrix, 0);
    panLeft.multiplyScalar(
      (-2 * deltaX * targetDistance) / this.domElement.clientHeight
    );

    const panUp = new THREE.Vector3();
    panUp.setFromMatrixColumn(this.camera.matrix, 1);
    panUp.multiplyScalar(
      (2 * deltaY * targetDistance) / this.domElement.clientHeight
    );

    offset.copy(panLeft).add(panUp);
    this.panOffset.add(offset);
  }

  update() {
    const offset = new THREE.Vector3();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      this.camera.up,
      new THREE.Vector3(0, 1, 0)
    );
    const quatInverse = quat.clone().invert();

    offset.copy(this.camera.position).sub(this.target);
    offset.applyQuaternion(quat);

    this.spherical.setFromVector3(offset);

    if (this.enableDamping) {
      this.spherical.theta +=
        this.sphericalDelta.theta * this.dampingFactor;
      this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
      this.sphericalDelta.theta *= 1 - this.dampingFactor;
      this.sphericalDelta.phi *= 1 - this.dampingFactor;
    } else {
      this.spherical.theta += this.sphericalDelta.theta;
      this.spherical.phi += this.sphericalDelta.phi;
      this.sphericalDelta.set(0, 0, 0);
    }

    this.spherical.phi = Math.max(
      0.1,
      Math.min(Math.PI - 0.1, this.spherical.phi)
    );
    this.spherical.radius = Math.max(
      1,
      Math.min(100, this.spherical.radius)
    );

    this.target.add(this.panOffset);
    offset.setFromSpherical(this.spherical);
    offset.applyQuaternion(quatInverse);

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);

    if (this.enableDamping) {
      this.panOffset.multiplyScalar(1 - this.dampingFactor);
    } else {
      this.panOffset.set(0, 0, 0);
    }
  }
}

// --- 初期化とゲーム開始 ---
sceneInit();
updateDisplay();
animate();

// --- 関数定義 ---

function sceneInit() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(WIDTH * 1.5, HEIGHT * 1.2, DEPTH * 1.5);
  camera.lookAt(WIDTH / 2, HEIGHT / 2, DEPTH / 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // カスタムOrbitControlsを使用
  controls = new SimpleOrbitControls(camera, renderer.domElement);
  controls.target.set(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
  controls.enableDamping = true;

  // ライト
  const ambientLight = new THREE.AmbientLight(0x808080);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);

  // フィールドの枠
  const edges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH)
  );
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.5,
    })
  );
  line.position.set(WIDTH / 2 - 0.5, HEIGHT / 2 - 0.5, DEPTH / 2 - 0.5);
  scene.add(line);

  scene.add(blocksGroup);

  // Ghost group を初期化
  ghostGroup = new THREE.Group();
  scene.add(ghostGroup);

  // Next Piece用の3Dシーン設定
  setupNextPieceDisplay();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener("keydown", handleKey);

  // モバイルコントロールの初期化
  initMobileControls();
}

function create3DMatrix(w, h, d) {
  return Array.from({ length: h }, () =>
    Array.from({ length: d }, () => Array(w).fill(0))
  );
}

function setupNextPieceDisplay() {
  const canvas = document.getElementById("nextCanvas");
  nextPieceRenderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
  });
  nextPieceRenderer.setSize(120, 120);
  nextPieceRenderer.setClearColor(0x000000, 0);

  nextPieceScene = new THREE.Scene();
  nextPieceCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  nextPieceCamera.position.set(3, 3, 3);
  nextPieceCamera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  nextPieceScene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  nextPieceScene.add(directionalLight);
}

function generateNextPiece() {
  const shapeIndex = Math.floor(Math.random() * tetrominoes.length);
  nextPiece = {
    shape: tetrominoes[shapeIndex].map((y) => y.map((z) => z.slice())),
    index: shapeIndex,
  };
  renderNextPiece();
}

function renderNextPiece() {
  // 既存のブロックをクリア
  while (nextPieceScene.children.length > 2) {
    // ライト2つを残してクリア
    nextPieceScene.remove(nextPieceScene.children[2]);
  }

  const blockGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const material = new THREE.MeshLambertMaterial({ color: 0xff0d72 });

  // Next Pieceの中心を計算
  const shape = nextPiece.shape;
  const ySize = shape.length;
  const zSize = shape[0].length;
  const xSize = shape[0][0].length;

  const centerX = (xSize - 1) / 2;
  const centerY = (ySize - 1) / 2;
  const centerZ = (zSize - 1) / 2;

  for (let y = 0; y < ySize; y++) {
    for (let z = 0; z < zSize; z++) {
      for (let x = 0; x < xSize; x++) {
        if (shape[y][z][x] !== 0) {
          const cube = new THREE.Mesh(blockGeometry, material.clone());
          cube.position.set(x - centerX, -(y - centerY), z - centerZ);
          nextPieceScene.add(cube);
        }
      }
    }
  }

  nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
}

function spawnPiece() {
  if (nextPiece) {
    currentPiece = nextPiece.shape;
  } else {
    const shape =
      tetrominoes[Math.floor(Math.random() * tetrominoes.length)];
    currentPiece = shape.map((y) => y.map((z) => z.slice()));
  }

  const pieceHeight = currentPiece.length;
  const pieceDepth = currentPiece[0].length;
  const pieceWidth = currentPiece[0][0].length;

  currentPos = {
    x: Math.floor((WIDTH - pieceWidth) / 2),
    y: HEIGHT - 1,
    z: Math.floor((DEPTH - pieceDepth) / 2),
  };

  if (collide(arena, currentPiece, currentPos)) {
    gameOver();
    return;
  }

  generateNextPiece();
}

function collide(matrix, piece, pos) {
  if (!piece) return true;

  for (let y = 0; y < piece.length; y++) {
    for (let z = 0; z < piece[y].length; z++) {
      for (let x = 0; x < piece[y][z].length; x++) {
        if (piece[y][z][x] === 0) continue;

        const newY = pos.y - y;
        const newX = pos.x + x;
        const newZ = pos.z + z;

        if (
          newY < 0 ||
          newX < 0 ||
          newX >= WIDTH ||
          newZ < 0 ||
          newZ >= DEPTH
        ) {
          return true;
        }
        if (newY < HEIGHT && matrix[newY][newZ][newX] !== 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function merge(matrix, piece, pos) {
  for (let y = 0; y < piece.length; y++) {
    for (let z = 0; z < piece[y].length; z++) {
      for (let x = 0; x < piece[y][z].length; x++) {
        if (piece[y][z][x] !== 0) {
          const newY = pos.y - y;
          if (newY < HEIGHT) {
            matrix[newY][pos.z + z][pos.x + x] = 1;
          }
        }
      }
    }
  }
}

function rotate(piece, axis) {
  const ySize = piece.length;
  const zSize = piece[0].length;
  const xSize = piece[0][0].length;
  let rotated;

  if (axis === "y") {
    // Y軸回転 (xz平面)
    rotated = Array.from({ length: ySize }, () =>
      Array.from({ length: xSize }, () => Array(zSize).fill(0))
    );
    for (let y = 0; y < ySize; y++) {
      for (let z = 0; z < zSize; z++) {
        for (let x = 0; x < xSize; x++) {
          if (piece[y][z][x])
            rotated[y][x][zSize - 1 - z] = piece[y][z][x];
        }
      }
    }
  } else if (axis === "x") {
    // X軸回転 (yz平面)
    rotated = Array.from({ length: zSize }, () =>
      Array.from({ length: ySize }, () => Array(xSize).fill(0))
    );
    for (let y = 0; y < ySize; y++) {
      for (let z = 0; z < zSize; z++) {
        for (let x = 0; x < xSize; x++) {
          if (piece[y][z][x])
            rotated[z][ySize - 1 - y][x] = piece[y][z][x];
        }
      }
    }
  } else if (axis === "z") {
    // Z軸回転 (xy平面)
    rotated = Array.from({ length: xSize }, () =>
      Array.from({ length: zSize }, () => Array(ySize).fill(0))
    );
    for (let y = 0; y < ySize; y++) {
      for (let z = 0; z < zSize; z++) {
        for (let x = 0; x < xSize; x++) {
          if (piece[y][z][x])
            rotated[x][z][ySize - 1 - y] = piece[y][z][x];
        }
      }
    }
  }
  return rotated;
}

function playerDrop() {
  currentPos.y--;
  if (collide(arena, currentPiece, currentPos)) {
    currentPos.y++;
    merge(arena, currentPiece, currentPos);
    sweep();
    spawnPiece();
  }
}

function sweep() {
  let clearedLines = 0;
  outer: for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        if (arena[y][z][x] === 0) {
          continue outer;
        }
      }
    }
    arena.splice(y, 1);
    const newEmptyLayer = Array.from({ length: DEPTH }, () =>
      Array(WIDTH).fill(0)
    );
    arena.push(newEmptyLayer);
    clearedLines++;
    y--;
  }

  if (clearedLines > 0) {
    linesCleared += clearedLines;

    // 拡張スコアシステム
    let earnedScore = calculateScore(clearedLines);

    // RENボーナス
    renCount++;
    const renBonus = Math.min(50 * renCount, 1000);
    earnedScore += renBonus;

    // パーフェクトクリアチェック
    if (isPerfectClear()) {
      const perfectClearBonus = calculatePerfectClearBonus(clearedLines);
      earnedScore += perfectClearBonus;
    }

    // Back To Back ボーナス（4ライン以上の場合）
    const isSpecialClear = clearedLines >= 4;
    if (isSpecialClear && lastClearWasSpecial) {
      earnedScore = Math.floor(earnedScore * 1.5);
    }
    lastClearWasSpecial = isSpecialClear;

    score += earnedScore;

    // レベルアップ（10ライン毎）
    const newLevel = Math.floor(linesCleared / 10) + 1;
    if (newLevel > level) {
      level = newLevel;
    }

    updateDisplay();
  } else {
    // 消えなかった場合はRENリセット
    renCount = 0;
  }
}

// スコア計算関数
function calculateScore(lines) {
  const baseScores = {
    1: 100,   // シングル
    2: 300,   // ダブル
    3: 500,   // トリプル
    4: 800,   // テトリス
    5: 1200,  // 5層消し（3D拡張）
    6: 1600,  // 6層消し（3D拡張）
  };

  // 6層以上は1600点
  if (lines > 6) {
    return 1600 * level;
  }

  return (baseScores[lines] || 0) * level;
}

// パーフェクトクリアチェック
function isPerfectClear() {
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        if (arena[y][z][x] !== 0) {
          return false;
        }
      }
    }
  }
  return true;
}

// パーフェクトクリアボーナス
function calculatePerfectClearBonus(lines) {
  const bonuses = {
    1: 800,   // シングル
    2: 1000,  // ダブル
    3: 1800,  // トリプル
    4: 2000,  // テトリス
  };

  return bonuses[Math.min(lines, 4)] || 2000;
}

function resetGame() {
  arena = create3DMatrix(WIDTH, HEIGHT, DEPTH);
  score = 0;
  level = 1;
  linesCleared = 0;
  renCount = 0;
  lastClearWasSpecial = false;
  gameState = GameState.WAITING;
  currentPiece = null;
  currentPos = null;
  updateDisplay();
}

function startGame() {
  resetGame();
  gameState = GameState.PLAYING;
  generateNextPiece();
  spawnPiece();
  lastDropTime = performance.now();
  updateDisplay();
  hideStartButton();
  hideGameOverScreen();
}

function gameOver() {
  gameState = GameState.GAME_OVER;
  showGameOverScreen();
}

function hideStartButton() {
  const startBtn = document.getElementById('startButton');
  if (startBtn) startBtn.style.display = 'none';
}

function showStartButton() {
  const startBtn = document.getElementById('startButton');
  if (startBtn) startBtn.style.display = 'block';
}

function showGameOverScreen() {
  const gameOverDiv = document.getElementById('gameOver');
  if (gameOverDiv) {
    document.getElementById('finalScore').textContent = score;
    gameOverDiv.style.display = 'block';
  }
}

function hideGameOverScreen() {
  const gameOverDiv = document.getElementById('gameOver');
  if (gameOverDiv) gameOverDiv.style.display = 'none';
}

function updateDisplay() {
  document.getElementById("score").textContent = score;
  document.getElementById("level").textContent = level;
  document.getElementById("lines").textContent = linesCleared;
  document.getElementById("ren").textContent = renCount;
}

function calculateGhostPosition() {
  if (!currentPiece) return null;

  let ghostPos = { ...currentPos };

  // 可能な限り下に移動
  while (
    !collide(arena, currentPiece, { ...ghostPos, y: ghostPos.y - 1 })
  ) {
    ghostPos.y--;
  }

  return ghostPos;
}

function handleKey(e) {
  // ゲームがプレイ中でない場合は操作を受け付けない
  if (gameState !== GameState.PLAYING) return;
  if (!currentPiece) return;

  let moved = false;
  let originalPos = { ...currentPos };

  if (e.key === "ArrowLeft") {
    currentPos.x--;
    moved = true;
  }
  if (e.key === "ArrowRight") {
    currentPos.x++;
    moved = true;
  }
  if (e.key === "ArrowUp") {
    currentPos.z--;
    moved = true;
  }
  if (e.key === "ArrowDown") {
    currentPos.z++;
    moved = true;
  }

  if (moved && collide(arena, currentPiece, currentPos)) {
    currentPos = originalPos; // 衝突したら元の位置に戻す
  }

  const rotations = {
    z: "y",
    x: "y",
    a: "x",
    s: "x",
    q: "z",
    w: "z",
  };
  if (Object.keys(rotations).includes(e.key.toLowerCase())) {
    const axis = rotations[e.key.toLowerCase()];
    const count = e.key === "x" || e.key === "s" || e.key === "w" ? 3 : 1;
    let rotated = currentPiece;
    for (let i = 0; i < count; i++) {
      rotated = rotate(rotated, axis);
    }
    if (!collide(arena, rotated, currentPos)) {
      currentPiece = rotated;
    }
  }

  if (e.key === " ") {
    while (!collide(arena, currentPiece, currentPos)) {
      currentPos.y--;
    }
    currentPos.y++;
    merge(arena, currentPiece, currentPos);
    sweep();
    spawnPiece();
    lastDropTime = performance.now();
  }
}

function drawBlocks() {
  // 既存のブロックをクリア
  while (blocksGroup.children.length > 0) {
    blocksGroup.remove(blocksGroup.children[0]);
  }
  while (ghostGroup.children.length > 0) {
    ghostGroup.remove(ghostGroup.children[0]);
  }

  const pieceColor = new THREE.Color(0xff0d72);
  const arenaColor = new THREE.Color(0x00ffcc);
  const ghostColor = new THREE.Color(0x888888);
  const blockGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE * 0.95,
    BLOCK_SIZE * 0.95,
    BLOCK_SIZE * 0.95
  );

  // アリーナのブロックを描画
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < DEPTH; z++) {
      for (let x = 0; x < WIDTH; x++) {
        if (arena[y][z][x] !== 0) {
          const material = new THREE.MeshLambertMaterial({
            color: arenaColor,
          });
          const cube = new THREE.Mesh(blockGeometry, material);
          cube.position.set(x, y, z);
          blocksGroup.add(cube);
        }
      }
    }
  }

  // ゴーストピース（落下予測位置）を描画
  if (currentPiece) {
    const ghostPos = calculateGhostPosition();
    if (ghostPos && ghostPos.y !== currentPos.y) {
      for (let y = 0; y < currentPiece.length; y++) {
        for (let z = 0; z < currentPiece[y].length; z++) {
          for (let x = 0; x < currentPiece[y][z].length; x++) {
            if (currentPiece[y][z][x] !== 0) {
              const material = new THREE.MeshLambertMaterial({
                color: ghostColor,
                transparent: true,
                opacity: 0.3,
              });
              const cube = new THREE.Mesh(blockGeometry, material);
              cube.position.set(
                ghostPos.x + x,
                ghostPos.y - y,
                ghostPos.z + z
              );
              ghostGroup.add(cube);
            }
          }
        }
      }
    }
  }

  // 現在のピースを描画
  if (currentPiece) {
    for (let y = 0; y < currentPiece.length; y++) {
      for (let z = 0; z < currentPiece[y].length; z++) {
        for (let x = 0; x < currentPiece[y][z].length; x++) {
          if (currentPiece[y][z][x] !== 0) {
            const material = new THREE.MeshLambertMaterial({
              color: pieceColor,
            });
            const cube = new THREE.Mesh(blockGeometry, material);
            cube.position.set(
              currentPos.x + x,
              currentPos.y - y,
              currentPos.z + z
            );
            blocksGroup.add(cube);
          }
        }
      }
    }
  }
}

function animate(time = 0) {
  requestAnimationFrame(animate);

  // ゲームがプレイ中の場合のみ落下処理を実行
  if (gameState === GameState.PLAYING) {
    // レベルに応じて落下速度を調整
    const currentDropInterval = Math.max(
      100,
      DROP_INTERVAL - (level - 1) * 50
    );

    const delta = time - lastDropTime;
    if (delta > currentDropInterval) {
      playerDrop();
      lastDropTime = time;
    }
  }

  controls.update();
  drawBlocks();
  renderer.render(scene, camera);

  // Next Pieceを再描画（必要に応じて）
  if (nextPieceRenderer && gameState !== GameState.WAITING) {
    nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
  }
}

// モバイルコントロール初期化
function initMobileControls() {
  const controlButtons = document.querySelectorAll('.control-btn');

  controlButtons.forEach(button => {
    const key = button.getAttribute('data-key');

    // タッチイベントとクリックイベントの両方に対応
    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      simulateKeyPress(key);
    });

    button.addEventListener('click', (e) => {
      e.preventDefault();
      simulateKeyPress(key);
    });
  });
}

// キープレスをシミュレート
function simulateKeyPress(key) {
  const event = new KeyboardEvent('keydown', {
    key: key,
    code: key,
    keyCode: key.charCodeAt(0),
    which: key.charCodeAt(0),
    bubbles: true,
    cancelable: true
  });

  document.dispatchEvent(event);
}
