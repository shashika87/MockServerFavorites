const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function parseLogoRequest(requestPath, logosDir) {
    const normalized = String(requestPath || "").replace(/^\/+/, "");
    const match = normalized.match(/^([^/]+\.(?:png|jpg|jpeg|gif|webp))(?:\/(.*))?$/i);

    if (!match) {
        return null;
    }

    const filename = path.basename(match[1]);
    const filePath = path.join(logosDir, filename);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return null;
    }

    const suffix = match[2] || "";
    const widthMatch = suffix.match(/(?:^|\/)width=(\d+)(?:\/|$)/i);
    const heightMatch = suffix.match(/(?:^|\/)height=(\d+)(?:\/|$)/i);

    return {
        filename,
        filePath,
        width: widthMatch ? Number(widthMatch[1]) : null,
        height: heightMatch ? Number(heightMatch[1]) : null,
    };
}

async function serveLogo(requestPath, logosDir, res) {
    const parsed = parseLogoRequest(requestPath, logosDir);

    if (!parsed) {
        res.status(404).end();
        return;
    }

    res.set("Cache-Control", "public, max-age=86400");

    const { filePath, width, height } = parsed;

    if (!width && !height) {
        res.type(path.extname(filePath).slice(1) || "png");
        res.sendFile(filePath);
        return;
    }

    const resizeOptions = { withoutEnlargement: true };
    if (width) {
        resizeOptions.width = width;
    }
    if (height) {
        resizeOptions.height = height;
    }

    const output = await sharp(filePath).resize(resizeOptions).png().toBuffer();

    res.type("png");
    res.send(output);
}

module.exports = {
    parseLogoRequest,
    serveLogo,
};
