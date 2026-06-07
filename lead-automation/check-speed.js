const http = require('http');

async function testRequestSpeed() {
    const loginData = JSON.stringify({
        username: 'admin',
        password: 'admin123'
    });

    const loginReq = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': loginData.length
        }
    }, (res) => {
        const cookies = res.headers['set-cookie'];
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            if (res.statusCode === 200 && cookies) {
                const startTime = Date.now();
                http.get({
                    hostname: 'localhost',
                    port: 3000,
                    path: '/api/stats',
                    headers: { 'Cookie': cookies }
                }, (statsRes) => {
                    let statsBody = '';
                    statsRes.on('data', c => statsBody += c);
                    statsRes.on('end', () => {
                        const duration = Date.now() - startTime;
                        console.log(`Stats Response Status: ${statsRes.statusCode}`);
                        console.log(`Stats Response Time: ${duration}ms`);
                        console.log(`Stats Body: ${statsBody.substring(0, 150)}...`);
                        process.exit(0);
                    });
                });
            } else {
                console.error('Login failed');
                process.exit(1);
            }
        });
    });

    loginReq.write(loginData);
    loginReq.end();
}

testRequestSpeed();
