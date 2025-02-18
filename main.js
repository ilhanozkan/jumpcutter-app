const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require('fs').promises;

const JumpCutter = require("./src/JumpCutter.js");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mov", "avi"] },
      { name: "Audio", extensions: ["mp3", "wav"] },
    ],
  });
  return result.filePaths[0];
});

ipcMain.handle("process-video", async (event, options) => {
  try {
    const cutter = new JumpCutter({
      silenceThreshold: options.threshold,
      minSilenceDuration: options.minSilenceDuration,
    });

    await cutter.process({
      input: options.input,
      output: options.output,
      mode: options.mode,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("save-processed-video", async (event, options) => {
  try {
    // Use fs.copyFile to copy the preview file to the final destination
    await fs.copyFile(options.input, options.output);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("cleanup-file", async (event, filePath) => {
  try {
    await fs.access(filePath); // Check if file exists
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    // If file doesn't exist or can't be deleted, just log and continue
    console.error("Error cleaning up file:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("show-save-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath,
    filters: [
      { name: "MP4", extensions: ["mp4"] },
      { name: "MOV", extensions: ["mov"] },
      { name: "AVI", extensions: ["avi"] },
      { name: "MP3", extensions: ["mp3"] },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  return result;
});
