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
let originalVideo = document.getElementById("originalVideo");
const processedVideo = document.getElementById("processedVideo");
const processingOverlay = document.getElementById("processing");
const previewLoading = document.getElementById("previewLoading");
const saveButton = document.getElementById("saveButton");
const canvas = document.getElementById("audioSpectrum");
const thresholdLine = document.getElementById("thresholdLine");
const tabButtons = document.querySelectorAll(".tab-button");

// Tab switching functionality
tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    // If clicking the already active tab, do nothing
    if (button.classList.contains("active")) {
      return;
    }

    // Remove active class from all buttons and panes
    tabButtons.forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));

    // Handle video playback
    handlePlaybackState(originalVideo, false);
    handlePlaybackState(processedVideo, false);

    // Add active class to clicked button and corresponding pane
    button.classList.add("active");
    document.getElementById(`${button.dataset.tab}-tab`).classList.add("active");

    // Show/hide spectrum container based on active tab
    if (button.dataset.tab === "processed") {
      canvas.parentElement.classList.add("hidden");
    } else {
      canvas.parentElement.classList.remove("hidden");
    }
  });
});

// Audio Context and Analyzer
let audioContext = null;
let analyser = null;
let audioSource = null;
let dataArray = null;
let selectedFile = null;
let dbHistory = []; // Store dB history
const HISTORY_SIZE = 500; // Show more history for better visualization
let processedVideoBlob = null;
let isAnalyzing = false;
let animationFrameId = null;

// Canvas Context
const ctx = canvas.getContext("2d");

// Initialize Audio Context
function initAudioContext() {
  try {
    if (audioContext) {
      audioContext.close();
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  } catch (error) {
    console.error("Error initializing audio context:", error);
  }
}

// Setup Audio Analysis
async function setupAudioAnalysis(videoElement) {
  try {
    // Clean up any existing audio context and connections first
    cleanupAudioAnalysis();

    // Initialize new audio context
    initAudioContext();

    // Create and connect new audio source
    audioSource = audioContext.createMediaElementSource(videoElement);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);

    // Start analysis if video is already playing
    if (!videoElement.paused) {
      startAnalysis();
    }

    // Add event listeners for playback state
    videoElement.addEventListener('play', startAnalysis);
    videoElement.addEventListener('pause', stopAnalysis);
    videoElement.addEventListener('ended', stopAnalysis);
  } catch (error) {
    console.error("Error setting up audio analysis:", error);
  }
}

function startAnalysis() {
  if (!isAnalyzing) {
    isAnalyzing = true;
    cancelAnimationFrame(animationFrameId);
    drawSpectrum();
  }
}

function stopAnalysis() {
  isAnalyzing = false;
  cancelAnimationFrame(animationFrameId);
  dbHistory = [];
}

// Clean up audio analysis
function cleanupAudioAnalysis() {
  stopAnalysis();
  if (audioSource) {
    try {
      audioSource.disconnect();
    } catch (error) {
      console.error("Error disconnecting audio source:", error);
    }
    audioSource = null;
  }
  if (audioContext) {
    try {
      audioContext.close();
    } catch (error) {
      console.error("Error closing audio context:", error);
    }
    audioContext = null;
  }
  analyser = null;
  dataArray = null;
  dbHistory = [];
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
  if (!isAnalyzing || !analyser || !dataArray) {
    return;
  }

  try {
    animationFrameId = requestAnimationFrame(drawSpectrum);

    analyser.getByteFrequencyData(dataArray);
    const currentDB = calculateDB(dataArray);

    dbHistory.push(currentDB);
    if (dbHistory.length > HISTORY_SIZE) {
      dbHistory.shift();
    }

    drawVisualization(currentDB);
  } catch (error) {
    console.error("Error in drawSpectrum:", error);
    stopAnalysis();
  }
}

// Draw visualization (separate the drawing logic)
function drawVisualization(currentDB) {
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

// Reset video element state
function resetVideoElement(videoElement) {
  if (!videoElement) return;

  videoElement.pause();
  const currentSrc = videoElement.src;
  videoElement.src = '';
  videoElement.load();
  videoElement.currentTime = 0;

  if (arguments.length > 1 && arguments[1] === true && currentSrc) {
    videoElement.src = currentSrc;
  }
}

// Handle video playback state
function handlePlaybackState(videoElement, play = true) {
  if (!videoElement) return;

  if (play) {
    // Ensure video is at the beginning if it ended
    if (videoElement.ended) {
      videoElement.currentTime = 0;
    }

    // Start playback
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error("Error playing video:", error);
      });
    }
  } else {
    videoElement.pause();
  }
}

// File Selection
selectFileBtn.addEventListener("click", async () => {
  const filePath = await ipcRenderer.invoke("select-file");
  if (filePath) {
    selectedFile = filePath;
    fileName.textContent = filePath.split("/").pop();

    // Clean up existing analysis
    cleanupAudioAnalysis();

    // Create a new video element
    const newVideo = document.createElement('video');
    newVideo.id = 'originalVideo';
    newVideo.controls = true;

    // Get the current video container
    const videoContainer = document.getElementById("originalVideo").parentNode;
    if (!videoContainer) {
      console.error("Could not find video container");
      return;
    }

    // Copy classes from original video
    if (originalVideo) {
      newVideo.className = originalVideo.className;
    }

    // Replace old video element
    videoContainer.replaceChild(newVideo, originalVideo);
    originalVideo = newVideo; // Now this will work since originalVideo is declared with let

    // Set up new video
    originalVideo.src = filePath;
    processButton.disabled = false;

    // Set up new analysis
    await setupAudioAnalysis(originalVideo);
  }
});

// Update threshold value display
thresholdSlider.addEventListener("input", () => {
  thresholdValue.textContent = `${thresholdSlider.value} dB`;
});

// Process preview
async function processPreview() {
  if (!selectedFile) return;

  previewLoading.classList.remove("hidden");
  saveButton.disabled = true;
  processButton.disabled = true;

  try {
    // Reset processed video state
    resetVideoElement(processedVideo);

    // Revoke any existing blob URL
    if (processedVideo.src && processedVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(processedVideo.src);
    }

    const result = await ipcRenderer.invoke("process-video-memory", {
      input: selectedFile,
      threshold: parseInt(thresholdSlider.value),
      minSilenceDuration: parseFloat(silenceDuration.value),
      mode: processMode.value,
      outputFormat: outputFormat.value
    });

    if (!result.success) {
      throw new Error(result.error || "Processing failed");
    }

    // Create blob URL from the processed video buffer
    const videoBlob = new Blob([Buffer.from(result.buffer)], { type: `video/${outputFormat.value}` });
    const blobUrl = URL.createObjectURL(videoBlob);

    // Set up video loading handlers before setting the source
    const videoLoadPromise = new Promise((resolve, reject) => {
      let timeoutId;

      const handleError = (error) => {
        clearTimeout(timeoutId);
        processedVideo.removeEventListener('loadeddata', handleLoadedData);
        processedVideo.removeEventListener('error', handleError);
        reject(new Error(error?.message || "Failed to load video"));
      };

      const handleLoadedData = () => {
        clearTimeout(timeoutId);
        processedVideo.removeEventListener('loadeddata', handleLoadedData);
        processedVideo.removeEventListener('error', handleError);
        resolve();
      };

      timeoutId = setTimeout(() => {
        handleError(new Error("Video loading timed out"));
      }, 10000);

      processedVideo.addEventListener('loadeddata', handleLoadedData, { once: true });
      processedVideo.addEventListener('error', handleError, { once: true });
    });

    // Set new source
    processedVideo.src = blobUrl;

    // Wait for the video to load or error out
    await videoLoadPromise;

    // Store the blob for later saving
    processedVideoBlob = videoBlob;
    saveButton.disabled = false;

    // Switch to processed tab
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === "processed") {
        btn.click();
      }
    });
  } catch (error) {
    console.error("Processing error:", error);
    alert("Error processing preview: " + (error.message || "Unknown error occurred"));

    // Reset video state
    resetVideoElement(processedVideo);
    processedVideoBlob = null;
    saveButton.disabled = true;

    // Switch back to original tab if there's an error
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === "original") {
        btn.click();
      }
    });
  } finally {
    previewLoading.classList.add("hidden");
    processButton.disabled = false;
  }
}

// Save processed video
async function saveProcessedVideo() {
  if (!processedVideoBlob) return;

  const result = await ipcRenderer.invoke("show-save-dialog", {
    defaultPath: selectedFile.replace(/\.[^/.]+$/, "") + "_processed." + outputFormat.value,
  });

  if (!result.filePath) return; // User cancelled

  processingOverlay.classList.remove("hidden");

  try {
    // Convert blob to buffer and save
    const buffer = Buffer.from(await processedVideoBlob.arrayBuffer());
    await ipcRenderer.invoke("save-buffer-to-file", {
      buffer: buffer,
      output: result.filePath,
    });

    alert("Video saved successfully!");
  } catch (error) {
    alert("Error saving video: " + error.message);
  } finally {
    processingOverlay.classList.add("hidden");
  }
}

// Clean up on window unload
window.addEventListener('beforeunload', () => {
  cleanupAudioAnalysis();
  if (processedVideo.src && processedVideo.src.startsWith('blob:')) {
    URL.revokeObjectURL(processedVideo.src);
  }
});

// Process Button triggers preview
processButton.addEventListener("click", processPreview);

// Save Button handler
saveButton.addEventListener("click", saveProcessedVideo);

// Resize canvas on window resize
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
