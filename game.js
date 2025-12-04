const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const restartBtn = document.getElementById("restartButton");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");

const gravity = 0.35;
const flapStrength = -10;
const pipeGap = 650;
const pipeWidth = 70;
const pipeSpeed = 2.6;
const spawnInterval = 1650; // milliseconds
const powerupSpawnInterval = 2000;
const basePlayerSize = 150;
const horizontalSpeed = 8;
const horizontalDecay = 0.92;
const celebrationDuration = 5000;
const teslaEffectDuration = 10000;
const teslaDropFrequency = 5;
const teslaGravityMultiplier = 0.5;
const devOpsSpawnChance = 0.2;
const devOpsHitboxScale = 0.7;
const devOpsSpeedMin = 0.7;
const devOpsSpeedMax = 2.2;
const startingGravityScale = 0.8; // 20% slower than current base at level 1
const levelGravityGrowth = 1.1; // +10% per level, compounded
const lemonsPerLevel = 10;
const levelLabelYMargin = 22;
const defaultGameOverMessage = "Idi nahuy dolbaeb";

const player = {
  x: 500,
  y: canvas.height / 2,
  width: basePlayerSize,
  height: basePlayerSize,
  velocityX: 0,
  velocityY: 0,
};

let lastFrame = 0;
let spawnTimer = 0;
let isRunning = false;
let gameOver = false;
let score = 0;
let bestScore = Number(localStorage.getItem("flappyCostumeBest") || 0);
let pipes = [];
let powerups = [];
let powerupTimer = 0;
let celebrationMessage = "";
let celebrationTimer = 0;
let hasCelebrated = false;
let gravityMultiplier = 1;
let teslaEffectTimer = 0;
let lemonDropsSpawned = 0;
let level = 1;
let levelGravityMultiplier = startingGravityScale;
let gameOverMessage = defaultGameOverMessage;

const costumeImage = new Image();
costumeImage.src = "assets/player.png";
let costumeLoaded = false;
costumeImage.onload = () => {
  costumeLoaded = true;
};
costumeImage.onerror = () => {
  console.warn("Unable to load player image. Using fallback rectangle.");
};

const backgroundImage = new Image();
backgroundImage.src = "assets/ivo.gif";
let backgroundLoaded = false;
backgroundImage.onload = () => {
  backgroundLoaded = true;
};
backgroundImage.onerror = () => {
  console.warn("Unable to load background image, keeping gradient.");
};

const gameOverImage = new Image();
gameOverImage.src = "assets/tryAgain.png";
let gameOverImageLoaded = false;
gameOverImage.onload = () => {
  gameOverImageLoaded = true;
};
gameOverImage.onerror = () => {
  console.warn("Unable to load try again image.");
};

const powerupImage = new Image();
powerupImage.src = "assets/lemon.png";
let powerupLoaded = false;
powerupImage.onload = () => {
  powerupLoaded = true;
};
powerupImage.onerror = () => {
  console.warn("Unable to load lemon power-up image.");
};

const devOpsImage = new Image();
devOpsImage.src = "assets/devOps.png";
let devOpsLoaded = false;
devOpsImage.onload = () => {
  devOpsLoaded = true;
};
devOpsImage.onerror = () => {
  console.warn("Unable to load devOps trap image.");
};

const teslaImage = new Image();
teslaImage.src = "assets/tesla.png";
let teslaLoaded = false;
teslaImage.onload = () => {
  teslaLoaded = true;
};
teslaImage.onerror = () => {
  console.warn("Unable to load tesla power-up image.");
};

const clouds = [];
for (let i = 0; i < 6; i += 1) {
  clouds.push(
    createCloud({
      existing: clouds,
    })
  );
}

bestScoreEl.textContent = bestScore;

function resetGame() {
  player.y = canvas.height / 2;
  player.velocityY = 0;
  player.width = basePlayerSize;
  player.height = basePlayerSize;
  pipes = [];
  powerups = [];
  powerupTimer = 0;
  spawnTimer = 0;
  celebrationMessage = "";
  celebrationTimer = 0;
  hasCelebrated = false;
  gravityMultiplier = 1;
  teslaEffectTimer = 0;
  lemonDropsSpawned = 0;
  level = 1;
  levelGravityMultiplier = startingGravityScale;
  gameOverMessage = defaultGameOverMessage;
  score = 0;
  gameOver = false;
  updateScoreUI();
  drawFrame(0);
}

function startGame() {
  if (isRunning) return;
  resetGame();
  isRunning = true;
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function endGame(reason) {
  gameOver = true;
  isRunning = false;
  gameOverMessage =
    reason === "devops"
      ? "Tи беше изяден от БЪРДАРОВ"
      : defaultGameOverMessage;
  bestScore = Math.max(bestScore, score);
  bestScoreEl.textContent = bestScore;
  localStorage.setItem("flappyCostumeBest", bestScore);
  drawFrame(0);
}

function loop(timestamp) {
  if (!isRunning) return;
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;
  update(delta);
  drawFrame(delta);
  if (isRunning) {
    requestAnimationFrame(loop);
  }
}

function update(delta) {
  powerupTimer += delta;
  if (powerupTimer > powerupSpawnInterval) {
    spawnPowerup();
    powerupTimer = 0;
  }

  // Normalize movement to a 60fps baseline so physics are framerate-independent
  const dt = delta / (1000 / 60);
  const effectiveGravity = getEffectiveGravity();

  if (teslaEffectTimer > 0) {
    teslaEffectTimer -= delta;
    if (teslaEffectTimer <= 0) {
      teslaEffectTimer = 0;
      gravityMultiplier = 1;
    }
  }

  if (celebrationTimer > 0) {
    celebrationTimer -= delta;
    if (celebrationTimer <= 0) {
      celebrationTimer = 0;
      celebrationMessage = "";
    }
  }

  player.velocityY += effectiveGravity * dt;
  player.y += player.velocityY * dt;

  player.x += player.velocityX * dt;
  player.velocityX *= Math.pow(horizontalDecay, dt);
  if (Math.abs(player.velocityX) < 0.05) player.velocityX = 0;
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  if (player.y + player.height >= canvas.height) {
    endGame();
  }
 
  powerups.forEach((powerup) => {
    powerup.y += powerup.speed * dt;
    powerup.rotation += powerup.rotationSpeed * dt;

    const hitbox = getPowerupHitbox(powerup);
    if (
      player.x < hitbox.x + hitbox.size &&
      player.x + player.width > hitbox.x &&
      player.y < hitbox.y + hitbox.size &&
      player.y + player.height > hitbox.y
    ) {
      collectPowerup(powerup);
    }
  });

  powerups = powerups.filter(
    (powerup) => !powerup.collected && powerup.y < canvas.height + powerup.size
  );

  clouds.forEach((cloud) => {
    cloud.x -= cloud.speed * dt;
    if (cloud.x + cloud.size < 0) {
      Object.assign(
        cloud,
        createCloud({
          initialX: canvas.width + Math.random() * 200,
          existing: clouds.filter((c) => c !== cloud),
        })
      );
    }
  });
}

function spawnPipe() {
  const minGapTop = 70;
  const maxGapTop = canvas.height - pipeGap - 70;
  const gapTop = Math.floor(Math.random() * (maxGapTop - minGapTop)) + minGapTop;
  pipes.push({
    x: canvas.width,
    gapTop,
    scored: false,
  });
}

function checkCollision(pipe) {
  const inPipeX =
    player.x + player.width > pipe.x && player.x < pipe.x + pipeWidth;
  if (!inPipeX) return false;

  const hitsUpper = player.y < pipe.gapTop;
  const hitsLower = player.y + player.height > pipe.gapTop + pipeGap;
  return hitsUpper || hitsLower;
}

function updateScoreUI() {
  scoreEl.textContent = score;
}

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  if (gameOver && !isRunning && gameOverImageLoaded) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(gameOverImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  drawPipes();
  drawPowerups();
  drawPlayer();
  if (!gameOver) {
    drawLevelIndicator();
    drawSpeedIndicator();
    drawTeslaTimer();
  }

  if (!isRunning && !gameOver) {
    drawMessage("Click Play or press Space to start", {
      withBackground: false,
    });
  }

  if (gameOver && !isRunning) {
    drawMessage(gameOverMessage);
  }

  if (celebrationTimer > 0 && celebrationMessage) {
    drawBannerMessage(celebrationMessage);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#6dd6ff");
  gradient.addColorStop(1, "#3a8fb7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (backgroundLoaded) {
    clouds.forEach((cloud) => {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(
        backgroundImage,
        cloud.x,
        cloud.y,
        cloud.size,
        cloud.size * 0.6
      );
      ctx.globalAlpha = 1;
    });
  }

  ctx.fillStyle = "#3abf5a";
  ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
}

function drawPipes() {
  // Obstacles removed; keep function to avoid errors
}

function drawPowerups() {
  powerups.forEach((powerup) => {
    ctx.save();
    ctx.translate(powerup.x + powerup.size / 2, powerup.y + powerup.size / 2);
    ctx.rotate(powerup.rotation);
    let image = powerupImage;
    let imageLoaded = powerupLoaded;
    if (powerup.type === "tesla") {
      image = teslaImage;
      imageLoaded = teslaLoaded;
    } else if (powerup.type === "devops") {
      image = devOpsImage;
      imageLoaded = devOpsLoaded;
    }
    if (imageLoaded) {
      ctx.drawImage(
        image,
        -powerup.size / 2,
        -powerup.size / 2,
        powerup.size,
        powerup.size
      );
    } else {
      ctx.fillStyle =
        powerup.type === "tesla"
          ? "#89c2ff"
          : powerup.type === "devops"
          ? "#ff7373"
          : "#ffe45c";
      ctx.beginPath();
      ctx.arc(0, 0, powerup.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawPlayer() {
  if (costumeLoaded) {
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    ctx.rotate(Math.min(Math.max(player.velocityY / 10, -0.3), 0.4));
    ctx.drawImage(
      costumeImage,
      -player.width / 2,
      -player.height / 2,
      player.width,
      player.height
    );
    ctx.restore();
  } else {
    ctx.fillStyle = "#ff8c42";
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
}

function drawMessage(text, { withBackground = true } = {}) {
  ctx.font = "60px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const paddingX = 40;
  const paddingY = 25;
  const metrics = ctx.measureText(text);
  const textHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 60;
  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = textHeight + paddingY * 2;
  const rectX = canvas.width / 2 - rectWidth / 2;
  const rectY = canvas.height / 2 - rectHeight / 2;

  if (withBackground) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 20);
    ctx.fill();
  }

  ctx.fillStyle = "#fff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  ctx.textBaseline = "alphabetic";
}

function flap() {
  if (!isRunning) {
    startGame();
  }
  if (!gameOver) {
    player.velocityY = flapStrength;
  }
}

restartBtn.addEventListener("click", () => {
  if (gameOver) {
    startGame();
  } else if (!isRunning) {
    startGame();
  } else {
    resetGame();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    flap();
  } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
    event.preventDefault();
    moveHorizontal(-1);
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    event.preventDefault();
    moveHorizontal(1);
  } else if (event.code === "Enter" && gameOver) {
    startGame();
  }
});

["pointerdown", "touchstart"].forEach((eventName) => {
  canvas.addEventListener(eventName, (event) => {
    event.preventDefault();
    flap();
  });
});

// Initialize the first frame so the canvas is not blank on load
drawFrame(0);

function createCloud({ initialX, existing = [] } = {}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const size = 140 + Math.random() * 160;
    const candidate = {
      x:
        attempt === 0 && typeof initialX === "number"
          ? initialX
          : Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.3,
      size,
      speed: 0.2 + Math.random() * 0.4,
    };
    if (existing.every((cloud) => !cloudsOverlap(cloud, candidate))) {
      return candidate;
    }
  }
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.3,
    size: 140 + Math.random() * 160,
    speed: 0.2 + Math.random() * 0.4,
  };
}

function cloudsOverlap(a, b) {
  const buffer = 30;
  const aCenterX = a.x + a.size / 2;
  const bCenterX = b.x + b.size / 2;
  const aCenterY = a.y + (a.size * 0.6) / 2;
  const bCenterY = b.y + (b.size * 0.6) / 2;
  const horizontalDistance = Math.abs(aCenterX - bCenterX);
  const verticalDistance = Math.abs(aCenterY - bCenterY);
  const horizontalLimit = (a.size + b.size) / 2 + buffer;
  const verticalLimit = ((a.size + b.size) * 0.6) / 2 + buffer;
  return horizontalDistance < horizontalLimit && verticalDistance < verticalLimit;
}

function spawnPowerup(type) {
  if (!type) {
    type = Math.random() < devOpsSpawnChance ? "devops" : "lemon";
  }
  // Slightly larger lemons to be closer in size to the devOps trap
  const lemonSize = 65 + Math.random() * 45;
  const size =
    type === "tesla" ? 70 : type === "devops" ? lemonSize * 1.3 : lemonSize;
  const speed =
    type === "tesla"
      ? 1 + Math.random() * 1.2
      : type === "devops"
      ? devOpsSpeedMin + Math.random() * (devOpsSpeedMax - devOpsSpeedMin)
      : 1.2 + Math.random() * 1.5;
  powerups.push({
    type,
    x: Math.random() * (canvas.width - size),
    y: -size,
    size,
    speed,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 0.06,
    collected: false,
  });
  if (type === "lemon") {
    lemonDropsSpawned += 1;
    if (
      lemonDropsSpawned % teslaDropFrequency === 0 &&
      !powerups.some(
        (powerup) => powerup.type === "tesla" && !powerup.collected
      )
    ) {
      spawnPowerup("tesla");
    }
  }
}

function collectPowerup(powerup) {
  powerup.collected = true;
  if (powerup.type === "devops") {
    endGame("devops");
    return;
  }
  if (powerup.type === "tesla") {
    activateTeslaEffect();
    return;
  }
  score += 1;
  updateScoreUI();
  updateLevelByScore();
  if (score >= 10 && !hasCelebrated) {
    celebrationMessage = "Bravo boss bravooooo";
    celebrationTimer = celebrationDuration;
    hasCelebrated = true;
  }
}

function drawBannerMessage(text) {
  ctx.save();
  ctx.font = "48px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd74a";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 12;
  ctx.fillText(text, canvas.width / 2, 80);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function moveHorizontal(direction) {
  player.velocityX += direction * horizontalSpeed;
}

function activateTeslaEffect() {
  gravityMultiplier = teslaGravityMultiplier;
  teslaEffectTimer = teslaEffectDuration;
}

function getEffectiveGravity() {
  return gravity * levelGravityMultiplier * gravityMultiplier;
}

function getPowerupHitbox(powerup) {
  if (powerup.type !== "devops") {
    return {
      x: powerup.x,
      y: powerup.y,
      size: powerup.size,
    };
  }
  const hitboxSize = powerup.size * devOpsHitboxScale;
  const offset = (powerup.size - hitboxSize) / 2;
  return {
    x: powerup.x + offset,
    y: powerup.y + offset,
    size: hitboxSize,
  };
}

function updateLevelByScore() {
  const newLevel = Math.floor(score / lemonsPerLevel) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelGravityMultiplier =
      startingGravityScale * Math.pow(levelGravityGrowth, level - 1);
  }
}

function drawLevelIndicator() {
  const text = `Current Level ${level}`;
  ctx.save();
  ctx.font = "36px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const textHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 36;
  const paddingX = 24;
  const paddingY = 12;
  const rectHeight = textHeight + paddingY * 2;
  const textY = canvas.height - rectHeight - levelLabelYMargin + rectHeight / 2;

  ctx.fillStyle = "#0a2236";
  ctx.shadowColor = "rgba(255, 221, 74, 0.4)";
  ctx.shadowBlur = 10;
  ctx.fillText(text, canvas.width / 2, textY);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawSpeedIndicator() {
  const speed = getEffectiveGravity();
  const text = `Speed: ${speed.toFixed(3)}`;
  ctx.save();
  ctx.font = "26px Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0a2236";
  ctx.shadowColor = "rgba(255, 221, 74, 0.35)";
  ctx.shadowBlur = 8;
  const padding = 16;
  ctx.fillText(text, padding, canvas.height - levelLabelYMargin - 8);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawTeslaTimer() {
  if (teslaEffectTimer <= 0) return;
  const secondsLeft = Math.max(0, Math.ceil(teslaEffectTimer / 1000));
  const text = `Tesla: ${secondsLeft}s`;
  ctx.save();
  ctx.font = "26px Roboto, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0a2236";
  ctx.shadowColor = "rgba(255, 221, 74, 0.35)";
  ctx.shadowBlur = 8;
  const padding = 16;
  ctx.fillText(text, canvas.width - padding, canvas.height - levelLabelYMargin - 8);
  ctx.shadowBlur = 0;
  ctx.restore();
}
