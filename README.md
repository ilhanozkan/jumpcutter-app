# JumpCutter

A Node.js package for processing videos and audio files by handling silent sections. You can either remove silent parts or speed them up.

## Installation

```bash
npm install jumpcutter
```

## Usage

```javascript
const JumpCutter = require('jumpcutter');

// Create a new instance
const cutter = new JumpCutter({
    silenceThreshold: -30, // dB threshold for silence detection
    minSilenceDuration: 0.5, // minimum silence duration in seconds
});

// Remove silent parts
await cutter.process({
    input: 'input.mp4',
    output: 'output.mp4',
    mode: 'remove' // or 'speed' to make silent parts faster
});
```

## Options

- `silenceThreshold`: Threshold in dB for silence detection (default: -30)
- `minSilenceDuration`: Minimum duration of silence to process in seconds (default: 0.5)
- `mode`: 'remove' to delete silent parts, 'speed' to make them faster
- `speedFactor`: Speed multiplier for silent parts when using 'speed' mode (default: 2)

## Requirements

- Node.js 14 or higher
- FFmpeg (included via ffmpeg-static)

## License

ISC
