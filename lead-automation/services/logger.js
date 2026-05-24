const fs = require('fs');
const path = require('path');

const logFilePath = path.resolve(__dirname, '../lead-automation.log');

const originalWriteOut = process.stdout.write;
const originalWriteErr = process.stderr.write;

let isWritingLog = false;

function writeToFile(text) {
    if (isWritingLog) return;
    isWritingLog = true;
    try {
        fs.appendFileSync(logFilePath, text, 'utf8');
    } catch (err) {
        originalWriteErr.call(process.stderr, `Failed to write to log file: ${err.message}\n`);
    } finally {
        isWritingLog = false;
    }
}

function formatChunk(chunk, isError = false) {
    if (!chunk) return '';
    const str = chunk.toString();
    if (str === '\n' || str === '\r\n') return str;
    
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const prefix = isError ? 'ERROR' : 'INFO';
    
    // Split by newline to prepends to each line in case of multiline outputs
    const lines = str.split(/\r?\n/);
    const formattedLines = lines.map((line, idx) => {
        // If it's a blank line or ends the chunk, preserve it
        if (!line.trim()) {
            return (idx === lines.length - 1 && line === '') ? '' : line;
        }
        // If it already has a timestamp bracket at start, do not format it
        if (/^\[\d{1,2}\/\d{1,2}\/\d{4},/.test(line)) {
            return line;
        }
        return `[${timestamp}] [${prefix}] ${line}`;
    });
    
    // Rejoin with original newline style
    const hasCRLF = str.includes('\r\n');
    return formattedLines.join(hasCRLF ? '\r\n' : '\n');
}

// Intercept stdout
process.stdout.write = function(chunk, encoding, callback) {
    originalWriteOut.call(process.stdout, chunk, encoding, callback);
    if (!isWritingLog) {
        writeToFile(formatChunk(chunk, false));
    }
};

// Intercept stderr
process.stderr.write = function(chunk, encoding, callback) {
    originalWriteErr.call(process.stderr, chunk, encoding, callback);
    if (!isWritingLog) {
        writeToFile(formatChunk(chunk, true));
    }
};

// Legacy exports for log/error helpers
function log(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`[${timestamp}] [${type}] ${message}`);
}

function error(message, err = null) {
    let errorMsg = message;
    if (err) {
        errorMsg += ` - Error: ${err.message}`;
        if (err.stack) {
            errorMsg += `\nStack: ${err.stack}`;
        }
    }
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.error(`[${timestamp}] [ERROR] ${errorMsg}`);
}

module.exports = { log, error, logFilePath };

