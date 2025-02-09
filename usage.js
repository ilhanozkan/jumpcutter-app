import JumpCutter from "./src/JumpCutter.js";

// Create a new instance
const cutter = new JumpCutter({
  silenceThreshold: -30, // dB threshold for silence detection
  minSilenceDuration: 0.5, // minimum silence duration in seconds
});

// Remove silent parts
await cutter.process({
  input: "conversation.mp4",
  output: "output.mp4",
  mode: "remove", // or 'speed' to make silent parts faster
});
