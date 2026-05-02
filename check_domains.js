const net = require('net');

const domains = [
    'auvya.com', 'xulora.com', 'vylora.com', 'qyora.com', 
    'ovyra.com', 'zuvya.com', 'nuvya.com', 'evyra.com', 
    'olira.com', 'zyora.com', 'alvya.com', 'izora.com', 
    'oryva.com', 'alora.com', 'velya.com', 'zylia.com',
    'xevia.com', 'zyria.com', 'orvya.com', 'elira.com'
];

async function checkWhois(domain) {
    return new Promise((resolve) => {
        const client = new net.Socket();
        let data = '';
        client.setTimeout(3000);
        client.connect(43, 'whois.verisign-grs.com', () => {
            client.write(domain + '\r\n');
        });
        client.on('data', (chunk) => {
            data += chunk.toString();
        });
        client.on('end', () => {
            if (data.includes('No match for')) {
                resolve(domain + ': AVAILABLE');
            } else {
                resolve(domain + ': TAKEN');
            }
        });
        client.on('error', (err) => resolve(domain + ': ERROR ' + err.message));
        client.on('timeout', () => {
            client.destroy();
            resolve(domain + ': TIMEOUT');
        });
    });
}

async function run() {
    for (let d of domains) {
        console.log(await checkWhois(d));
    }
}
run();
