const JumpCutter = require('../src/JumpCutter');
const fs = require('fs').promises;
const path = require('path');

describe('JumpCutter', () => {
    let jumpCutter;

    beforeEach(() => {
        jumpCutter = new JumpCutter({
            silenceThreshold: -30,
            minSilenceDuration: 0.5,
            speedFactor: 2
        });
    });

    test('should create instance with default options', () => {
        const defaultCutter = new JumpCutter();
        expect(defaultCutter.silenceThreshold).toBe(-30);
        expect(defaultCutter.minSilenceDuration).toBe(0.5);
        expect(defaultCutter.speedFactor).toBe(2);
    });

    test('should create instance with custom options', () => {
        const customCutter = new JumpCutter({
            silenceThreshold: -40,
            minSilenceDuration: 1,
            speedFactor: 3
        });
        expect(customCutter.silenceThreshold).toBe(-40);
        expect(customCutter.minSilenceDuration).toBe(1);
        expect(customCutter.speedFactor).toBe(3);
    });

    test('should throw error when input/output not provided', async () => {
        await expect(jumpCutter.process({}))
            .rejects
            .toThrow('Input and output paths are required');
    });

    test('should throw error for invalid mode', async () => {
        await expect(jumpCutter.process({
            input: 'test.mp4',
            output: 'out.mp4',
            mode: 'invalid'
        })).rejects.toThrow('Mode must be either "remove" or "speed"');
    });

    test('should parse silence info correctly', () => {
        const testData = `
            silence_start: 1.5
            silence_end: 2.5
            silence_start: 4.0
            silence_end: 5.0
        `;
        
        const result = jumpCutter._parseSilenceInfo(testData);
        expect(result).toEqual([
            { start: 1.5, end: 2.5 },
            { start: 4.0, end: 5.0 }
        ]);
    });
});
