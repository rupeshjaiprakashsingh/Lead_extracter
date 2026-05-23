const fs = require('fs');
const path = require('path');

const logFilePath = path.resolve(__dirname, '../lead-automation.log');

function log(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const formattedMessage = `[${timestamp}] [${type}] ${message}`;
    
    // Print to console
    console.log(formattedMessage);
    
    // Append to log file
    try {
        fs.appendFileSync(logFilePath, formattedMessage + '\n', 'utf8');
    } catch (err) {
        console.error('Failed to write to log file:', err.message);
    }
}

function error(message, err = null) {
    let errorMsg = message;
    if (err) {
        errorMsg += ` - Error: ${err.message}`;
        if (err.stack) {
            errorMsg += `\nStack: ${err.stack}`;
        }
    }
    log(errorMsg, 'ERROR');
}

module.exports = { log, error, logFilePath };
