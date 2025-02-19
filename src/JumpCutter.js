const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");
const fs = require('fs').promises;
const tmp = require('tmp-promise');

ffmpeg.setFfmpegPath(ffmpegStatic.replace("app.asar", "app.asar.unpacked"));
ffmpeg.setFfprobePath(ffprobeStatic.path.replace("app.asar", "app.asar.unpacked"));

class JumpCutter {
  constructor(options = {}) {
    this.silenceThreshold = options.silenceThreshold || -30;
    this.minSilenceDuration = options.minSilenceDuration || 0.5;
    this.speedFactor = options.speedFactor || 2;
  }

  async process({ input, output, mode = "remove" }) {
    if (!input || !output) {
      throw new Error("Input and output paths are required");
    }

    if (!["remove", "speed"].includes(mode)) {
      throw new Error('Mode must be either "remove" or "speed"');
    }

    const silenceInfo = await this._detectSilence(input);
    const duration = await this._getDuration(input);

    if (mode === "remove") {
      await this._removeSilence(input, output, silenceInfo, duration);
    } else {
      await this._speedupSilence(input, output, silenceInfo);
    }
  }

  async _detectSilence(input) {
    return new Promise((resolve, reject) => {
      let silenceData = "";

      ffmpeg(input)
        .inputOptions(["-nostdin"])
        .outputOptions(["-f", "null"])
        .audioFilters(
          `silencedetect=n=${this.silenceThreshold}dB:d=${this.minSilenceDuration}`
        )
        .on("start", (command) => {
          console.log("Started silence detection with command:", command);
        })
        .on("stderr", (line) => {
          if (line.includes("silence_start") || line.includes("silence_end")) {
            silenceData += line + "\n";
            console.log("Silence data:", line);
          }
        })
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg Error:", err);
          console.error("FFmpeg stderr:", stderr);
          reject(err);
        })
        .on("end", () => {
          const silences = this._parseSilenceInfo(silenceData);
          console.log("Detected silences:", silences);
          resolve(silences);
        })
        .save("pipe:1");
    });
  }

  _parseSilenceInfo(data) {
    const silences = [];
    const lines = data.split("\n");

    let currentSilence = {};

    lines.forEach((line) => {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);

      if (startMatch) {
        currentSilence.start = parseFloat(startMatch[1]);
      } else if (endMatch && currentSilence.start !== undefined) {
        currentSilence.end = parseFloat(endMatch[1]);
        silences.push({ ...currentSilence });
        currentSilence = {};
      }
    });

    return silences;
  }

  _createRemoveFilter(silences, duration) {
    if (silences.length === 0) {
      return null;
    }

    const segments = [];
    let lastEnd = 0;

    // Process all segments except silent parts
    silences.forEach((silence) => {
      if (silence.start > lastEnd) {
        segments.push({
          start: lastEnd,
          end: silence.start,
        });
      }
      lastEnd = silence.end;
    });

    // Add final segment if exists
    if (lastEnd < duration) {
      segments.push({
        start: lastEnd,
        end: duration,
      });
    }

    if (segments.length === 0) {
      return null;
    }

    // Create filter chains
    const videoFilters = segments.map(
      (seg, i) => `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${i}]`
    );

    const audioFilters = segments.map(
      (seg, i) =>
        `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`
    );

    // Create concat commands
    const vConcat = segments.map((_, i) => `[v${i}]`).join("");
    const aConcat = segments.map((_, i) => `[a${i}]`).join("");

    const filter = [
      ...videoFilters,
      ...audioFilters,
      `${vConcat}concat=n=${segments.length}:v=1:a=0[outv]`,
      `${aConcat}concat=n=${segments.length}:v=0:a=1[outa]`,
    ].join(";");

    console.log("Generated remove filter:", filter);
    return filter;
  }

  async _removeSilence(input, output, silenceInfo, duration) {
    const filter = this._createRemoveFilter(silenceInfo, duration);
    console.log("Generated filter:", filter);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(input);

      if (filter) {
        try {
          command
            .complexFilter(filter)
            .outputOptions([
              "-map",
              "[outv]",
              "-map",
              "[outa]",
              "-shortest",
              "-avoid_negative_ts",
              "make_zero",
            ])
            .on("start", (cmd) => {
              console.log("Started FFmpeg with command:", cmd);
            })
            .on("stderr", (stderrLine) => {
              console.log("FFmpeg:", stderrLine);
            })
            .on("error", (err, stdout, stderr) => {
              console.error("FFmpeg Error:", err);
              console.error("FFmpeg stderr:", stderr);
              reject(err);
            })
            .on("end", () => {
              console.log("FFmpeg processing finished");
              resolve();
            })
            .save(output);
        } catch (error) {
          reject(error);
        }
      } else {
        // If no filter needed, just copy the input to output
        command.on("error", reject).on("end", resolve).save(output);
      }
    });
  }

  async _speedupSilence(input, output, silenceInfo) {
    const duration = await this._getDuration(input);
    const filter = this._createSpeedFilter(silenceInfo, duration);
    console.log("Generated filter:", filter);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(input);

      if (filter) {
        try {
          command
            .complexFilter(filter)
            .outputOptions([
              "-map",
              "[outv]",
              "-map",
              "[outa]",
              "-shortest",
              "-avoid_negative_ts",
              "make_zero",
            ])
            .on("start", (cmd) => {
              console.log("Started FFmpeg with command:", cmd);
            })
            .on("stderr", (stderrLine) => {
              console.log("FFmpeg:", stderrLine);
            })
            .on("error", (err, stdout, stderr) => {
              console.error("FFmpeg Error:", err);
              console.error("FFmpeg stderr:", stderr);
              reject(err);
            })
            .on("end", () => {
              console.log("FFmpeg processing finished");
              resolve();
            })
            .save(output);
        } catch (error) {
          reject(error);
        }
      } else {
        // If no filter needed, just copy the input to output
        command.on("error", reject).on("end", resolve).save(output);
      }
    });
  }

  _createSpeedFilter(silences, duration) {
    if (silences.length === 0) {
      return null;
    }

    const segments = [];
    let lastEnd = 0;

    // Process all segments
    silences.forEach((silence, index) => {
      // Add normal speed segment before silence if exists
      if (silence.start > lastEnd) {
        segments.push({
          start: lastEnd,
          end: silence.start,
          speed: 1,
        });
      }

      // Add speed up segment
      segments.push({
        start: silence.start,
        end: silence.end,
        speed: this.speedFactor,
      });

      lastEnd = silence.end;
    });

    // Add remaining segment if exists
    if (lastEnd < duration) {
      segments.push({
        start: lastEnd,
        end: duration,
        speed: 1,
      });
    }

    if (segments.length === 0) {
      return null;
    }

    // Create filter chains
    const videoFilters = segments.map((seg, i) => {
      const speedPart = seg.speed === 1 ? "" : `,setpts=PTS/${seg.speed}`;
      return `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS${speedPart}[v${i}]`;
    });

    const audioFilters = segments.map((seg, i) => {
      const speedPart = seg.speed === 1 ? "" : `,atempo=${seg.speed}`;
      return `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS${speedPart}[a${i}]`;
    });

    // Create concat commands
    const vConcat = segments.map((_, i) => `[v${i}]`).join("");
    const aConcat = segments.map((_, i) => `[a${i}]`).join("");

    const filter = [
      ...videoFilters,
      ...audioFilters,
      `${vConcat}concat=n=${segments.length}:v=1:a=0[outv]`,
      `${aConcat}concat=n=${segments.length}:v=0:a=1[outa]`,
    ].join(";");

    console.log("Generated filter:", filter);
    return filter;
  }

  async _getDuration(input) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(input, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(parseFloat(metadata.format.duration));
        }
      });
    });
  }

  async processToBuffer({ input, mode = 'remove', outputFormat = 'mp4' }) {
    try {
      // Get silence information directly
      const silenceInfo = await this._detectSilence(input);
      const duration = await this._getDuration(input);

      // Create temporary file for output
      const { path: outputFile } = await tmp.file({ postfix: `.${outputFormat}` });

      // Process video based on mode
      if (mode === 'remove') {
        await this._removeSilence(input, outputFile, silenceInfo, duration);
      } else if (mode === 'speed') {
        await this._speedupSilence(input, outputFile, silenceInfo);
      } else {
        throw new Error('Invalid processing mode');
      }

      // Read the processed file into buffer
      const buffer = await fs.readFile(outputFile);

      // Clean up temporary file
      await fs.unlink(outputFile);

      return buffer;
    } catch (error) {
      throw new Error(`Error processing video to buffer: ${error.message}`);
    }
  }
}

module.exports = JumpCutter;
