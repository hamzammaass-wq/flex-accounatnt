import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

async function main() {
    const inputPath = 'branding/masters/aiflex-erp-ios-icon.png';
    const outputPath = 'branding/masters/aiflex-erp-ios-icon-cropped.png';

    console.log('Reading image:', inputPath);
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    console.log('Original Size:', metadata.width, 'x', metadata.height);

    // Read the top-left pixel to get the background color
    const rawPixel = await image.extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const bgColor = {
        r: rawPixel[0],
        g: rawPixel[1],
        b: rawPixel[2],
        alpha: rawPixel.length > 3 ? rawPixel[3] / 255 : 1
    };
    console.log('Background Color:', bgColor);

    // Trim the image
    const trimmed = await image.trim().toBuffer({ resolveWithObject: true });
    console.log('Trimmed Size:', trimmed.info.width, 'x', trimmed.info.height);
    
    // Add 8% padding (so it fills the icon well, iOS applies rounded corners which eats about 15-20% at the corners)
    // The main content should fill most of the square.
    const size = Math.max(trimmed.info.width, trimmed.info.height);
    const padding = Math.floor(size * 0.12);
    const paddedSize = size + (padding * 2);

    console.log('New Square Size:', paddedSize, 'x', paddedSize);
    
    await sharp(trimmed.data)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({
            top: padding + Math.floor((size - trimmed.info.height) / 2),
            bottom: padding + Math.floor((size - trimmed.info.height) / 2),
            left: padding + Math.floor((size - trimmed.info.width) / 2),
            right: padding + Math.floor((size - trimmed.info.width) / 2),
            background: bgColor
        })
        .resize(1024, 1024)
        .toFile(outputPath);

    console.log('Wrote cropped image to:', outputPath);
}

main().catch(console.error);
