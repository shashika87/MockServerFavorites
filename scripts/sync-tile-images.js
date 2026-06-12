const fs = require("fs");
const path = require("path");
const { ensureTileImage } = require("../lib/favorites");

const DATA_DIR = path.join(__dirname, "..", "data");

const leagueFiles = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.startsWith("favorite_teams_") && !file.match(/_v[123]\.json$/));

let checked = 0;
let updated = 0;
let alreadySynced = 0;
let skipped = 0;

for (const file of leagueFiles) {
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let fileUpdated = 0;

    for (const ribbon of data.ribbons || []) {
        for (const tile of ribbon.tiles || []) {
            const toastImage = tile.actions?.FAVORITE_WITH_INVALIDATION?.toast_info?.image;
            if (!toastImage) {
                skipped += 1;
                continue;
            }

            checked += 1;
            const before = JSON.stringify(tile.image || null);
            ensureTileImage(tile);
            const after = JSON.stringify(tile.image || null);

            if (before !== after) {
                updated += 1;
                fileUpdated += 1;
            } else if (tile.image) {
                alreadySynced += 1;
            }
        }
    }

    if (fileUpdated > 0) {
        fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
        console.log(`${file}: ${fileUpdated} tiles updated`);
    } else {
        console.log(`${file}: already synced`);
    }
}

console.log("");
console.log(`Checked: ${checked} tiles with toast_info.image`);
console.log(`Updated: ${updated} tiles`);
console.log(`Already synced: ${alreadySynced} tiles`);
console.log(`Skipped (no toast_info.image): ${skipped} tiles`);

if (updated === 0 && alreadySynced > 0) {
    console.log("");
    console.log("No file changes were needed. Root image is already present on every team tile.");
    console.log("Example: data/favorite_teams_nfl.json -> ribbons[].tiles[].image");
}
