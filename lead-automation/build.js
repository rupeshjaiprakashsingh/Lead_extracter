const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

async function build() {
    console.log('Starting build process...');

    const bundlePath = path.join(__dirname, 'server.bundle.js');
    const outPath = path.join(__dirname, 'server.js');

    try {
        console.log('[1/3] Bundling with esbuild...');
        await esbuild.build({
            entryPoints: ['index.js'],
            bundle: true,
            platform: 'node',
            target: 'node16',
            outfile: bundlePath,
            // Exclude node_modules and native bindings
            external: [
                ...Object.keys(require('./package.json').dependencies || {}),
                'fsevents'
            ],
            minify: false, // We'll let obfuscator handle mangling
            keepNames: false
        });

        console.log('[2/3] Obfuscating code...');
        const bundleCode = fs.readFileSync(bundlePath, 'utf8');
        
        const obfuscationResult = JavaScriptObfuscator.obfuscate(bundleCode, {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.4,
            debugProtection: false,
            disableConsoleOutput: false,
            identifierNamesGenerator: 'hexadecimal',
            log: false,
            numbersToExpressions: true,
            renameGlobals: false,
            selfDefending: true,
            simplify: true,
            splitStrings: true,
            splitStringsChunkLength: 10,
            stringArray: true,
            stringArrayCallsTransform: true,
            stringArrayCallsTransformThreshold: 0.5,
            stringArrayEncoding: ['rc4'],
            stringArrayIndexShift: true,
            stringArrayRotate: true,
            stringArrayShuffle: true,
            stringArrayWrappersCount: 1,
            stringArrayWrappersChainedCalls: true,
            stringArrayWrappersParametersMaxCount: 2,
            stringArrayWrappersType: 'variable',
            stringArrayThreshold: 0.75,
            target: 'node',
            unicodeEscapeSequence: false
        });

        console.log('[3/3] Saving secured server.js...');
        fs.writeFileSync(outPath, obfuscationResult.getObfuscatedCode());
        
        // Clean up
        fs.unlinkSync(bundlePath);

        console.log('✅ Build complete! You can now run "node server.js".');
    } catch (err) {
        console.error('❌ Build failed:', err);
        process.exit(1);
    }
}

build();
