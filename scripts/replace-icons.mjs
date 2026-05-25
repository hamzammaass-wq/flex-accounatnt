import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

async function main() {
    const inputPath = 'AI FLEX LOGO.png';
    const outputPath = 'branding/masters/aiflex-erp-ios-icon.png';
    
    const image = sharp(inputPath);
    
    const trimmed = await image.trim().toBuffer({ resolveWithObject: true });
    console.log('Trimmed size:', trimmed.info.width, 'x', trimmed.info.height);
    
    const maxDim = Math.max(trimmed.info.width, trimmed.info.height);
    
    // Apple App Icon usually has around 8-10% padding for a clean look, let's use 8%
    const padding = Math.floor(maxDim * 0.08);
    
    const rawPixel = await image.extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const bgColor = {
        r: rawPixel[0],
        g: rawPixel[1],
        b: rawPixel[2],
        alpha: 1
    };

    await sharp(trimmed.data)
        .resize(maxDim, maxDim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({
            top: padding + Math.floor((maxDim - trimmed.info.height) / 2),
            bottom: padding + Math.floor((maxDim - trimmed.info.height) / 2),
            left: padding + Math.floor((maxDim - trimmed.info.width) / 2),
            right: padding + Math.floor((maxDim - trimmed.info.width) / 2),
            background: bgColor
        })
        .resize(1024, 1024)
        .toFile(outputPath);

    console.log('Replaced iOS icon successfully!');
    
    await sharp(trimmed.data)
        .resize(maxDim, maxDim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({
            top: padding + Math.floor((maxDim - trimmed.info.height) / 2),
            bottom: padding + Math.floor((maxDim - trimmed.info.height) / 2),
            left: padding + Math.floor((maxDim - trimmed.info.width) / 2),
            right: padding + Math.floor((maxDim - trimmed.info.width) / 2),
            background: bgColor
        })
        .resize(1024, 1024)
        .toFile('branding/masters/aiflex-erp-app-icon.png');

    console.log('Replaced app icon successfully!');
}

main().catch(console.error);
