const { ipcRenderer } = require("electron");

// UI Elements
const selectFileBtn = document.getElementById("selectFile");
const fileName = document.getElementById("fileName");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const silenceDuration = document.getElementById("silenceDuration");
const outputFormat = document.getElementById("outputFormat");
const processMode = document.getElementById("processMode");
const processButton = document.getElementById("processButton");
const previewVideo = document.getElementById("previewVideo");
const processingOverlay = document.getElementById("processing");
const canvas = document.getElementById("audioSpectrum");
const thresholdLine = document.getElementById("thresholdLine");

// Audio Context and Analyzer
let audioContext;
let analyser;
let dataArray;
let selectedFile = null;
let dbHistory = []; // Store dB history
const HISTORY_SIZE = 500; // Show more history for better visualization

// Canvas Context
const ctx = canvas.getContext("2d");

// Initialize Audio Context
function initAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2; // Less smoothing for more responsive visualization
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
}

// Setup Audio Analysis
function setupAudioAnalysis(videoElement) {
  const source = audioContext.createMediaElementSource(videoElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
}

// Calculate dB from frequency data
function calculateDB(frequencyData) {
  // Focus on the frequency range most relevant to speech (300Hz - 3400Hz)
  const sampleRate = audioContext.sampleRate;
  const binSize = sampleRate / analyser.fftSize;
  const lowBin = Math.floor(300 / binSize);
  const highBin = Math.floor(3400 / binSize);

  let sum = 0;
  let count = 0;

  for (let i = lowBin; i < highBin && i < frequencyData.length; i++) {
    sum += frequencyData[i];
    count++;
  }

  const average = sum / count;
  // Adjust the scale to make it more sensitive
  return average === 0
    ? -60
    : Math.max(-60, Math.min(0, 30 * Math.log10(average / 255)));
}

// Draw Audio Spectrum
function drawSpectrum() {
  requestAnimationFrame(drawSpectrum);

  analyser.getByteFrequencyData(dataArray);
  const currentDB = calculateDB(dataArray);

  // Add current dB to history
  dbHistory.push(currentDB);
  if (dbHistory.length > HISTORY_SIZE) {
    dbHistory.shift();
  }

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  // Draw grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw dB history with removed sections highlighted
  const pointWidth = width / HISTORY_SIZE;
  const thresholdDb = parseInt(thresholdSlider.value);

  // Draw removed sections background
  ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
  let inSilence = false;
  let silenceStart = 0;

  dbHistory.forEach((db, index) => {
    if (db > thresholdDb) {
      if (inSilence) {
        // End of silence section
        const silenceWidth = (index - silenceStart) * pointWidth;
        ctx.fillRect(silenceStart * pointWidth, 0, silenceWidth, height);
        inSilence = false;
      }
    } else if (!inSilence) {
      // Start of silence section
      silenceStart = index;
      inSilence = true;
    }
  });

  // If we're still in a silence section at the end
  if (inSilence) {
    const silenceWidth = (dbHistory.length - silenceStart) * pointWidth;
    ctx.fillRect(silenceStart * pointWidth, 0, silenceWidth, height);
  }

  // Draw the waveform
  ctx.beginPath();
  ctx.strokeStyle = "#4CAF50";
  ctx.lineWidth = 2;

  dbHistory.forEach((db, index) => {
    const x = index * pointWidth;
    // Invert the dB value and scale it to fit the canvas
    const y = height - ((db + 60) / 60) * height;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Draw current dB value
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`Current: ${Math.round(currentDB)}dB`, width - 10, 20);

  // Draw threshold line and label
  const normalizedThreshold = height - ((thresholdDb + 60) / 60) * height;
  thresholdLine.style.bottom = `${height - normalizedThreshold}px`;

  // Draw dB scale
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  for (let i = 0; i <= 6; i++) {
    const dbValue = -60 + i * 10;
    const y = height - ((dbValue + 60) / 60) * height;
    ctx.fillText(`${dbValue}dB`, 5, y + 4);
  }

  // Draw time scale
  ctx.textAlign = "center";
  for (let i = 0; i <= 10; i++) {
    const x = width - i * (width / 10);
    ctx.fillText(`-${((i * HISTORY_SIZE) / 300).toFixed(1)}s`, x, height - 5);
  }

  // Draw threshold label
  ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
  ctx.textAlign = "left";
  ctx.fillText(`Threshold: ${thresholdDb}dB`, 10, normalizedThreshold - 5);
}

// File Selection
selectFileBtn.addEventListener("click", async () => {
  const filePath = await ipcRenderer.invoke("select-file");
  if (filePath) {
    selectedFile = filePath;
    fileName.textContent = filePath.split("/").pop();
    previewVideo.src = filePath;
    processButton.disabled = false;

    // Initialize audio context on first interaction
    if (!audioContext) {
      initAudioContext();
    }

    previewVideo.onplay = () => {
      // Resume audio context if it was suspended
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      setupAudioAnalysis(previewVideo);
      drawSpectrum();
    };
  }
});

// Update threshold value display
thresholdSlider.addEventListener("input", () => {
  thresholdValue.textContent = `${thresholdSlider.value} dB`;
});

// Process Video
processButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  // Show save dialog
  const result = await ipcRenderer.invoke("show-save-dialog", {
    defaultPath:
      selectedFile.replace(/\.[^/.]+$/, "") +
      "_processed." +
      outputFormat.value,
  });

  if (!result.filePath) return; // User cancelled

  processingOverlay.classList.remove("hidden");

  try {
    await ipcRenderer.invoke("process-video", {
      input: selectedFile,
      output: result.filePath,
      threshold: parseInt(thresholdSlider.value),
      minSilenceDuration: parseFloat(silenceDuration.value),
      mode: processMode.value,
    });

    alert("Processing complete!");
  } catch (error) {
    alert("Error processing video: " + error.message);
  } finally {
    processingOverlay.classList.add("hidden");
  }
});

// Resize canvas on window resize
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
