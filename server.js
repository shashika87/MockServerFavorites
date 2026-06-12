const express = require("express");
const path = require("path");
const fs = require("fs");
const { favoriteTeam, unfavoriteTeam, getAllFavorites } = require("./lib/favorites");
const { serveLogo } = require("./lib/images");
const { buildWatchlistResponse } = require("./lib/watchlist-response");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(DATA_DIR, "favorite_teams.json");
const LOGOS_DIR = path.join(__dirname, "1280x720");

const VARIANT_FILES = {
    1: path.join(DATA_DIR, "favorite_teams_v1.json"),
    2: path.join(DATA_DIR, "favorite_teams_v2.json"),
    3: path.join(DATA_DIR, "favorite_teams_v3.json"),
};

let activeVariation = null;

app.use(express.json());

app.get("/1280x720/*", async (req, res) => {
    try {
        const requestPath = req.path.replace(/^\/1280x720\//, "");
        await serveLogo(requestPath, LOGOS_DIR, res);
    } catch (err) {
        console.error(`Failed to serve logo ${req.path}:`, err);
        if (!res.headersSent) {
            res.status(500).end();
        }
    }
});

const STACK_FILE_ALIASES = {
    epl: "eps",
};

const SUPPORTED_STACKS = ["nfl", "nba", "ncaaf", "nhl", "mlb", "mls", "epl"];

function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}

function resolveLeagueDataFile(queryVariant) {
    const variant = queryVariant || activeVariation;
    const variantFile = VARIANT_FILES[variant];
    return variantFile && fs.existsSync(variantFile) ? variantFile : DATA_FILE;
}

app.get("/drawer/variations", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "variations.html"));
});

app.get("/drawer/variations/active", (req, res) => {
    res.json({ variant: activeVariation });
});

app.post("/drawer/variations/select", (req, res) => {
    const variant = Number(req.body?.variant);

    if (![1, 2, 3].includes(variant)) {
        return res.status(400).json({ error: "invalid_variant", supported: [1, 2, 3] });
    }

    activeVariation = variant;
    console.log(`[drawer/variations] active variation set to ${variant} -> favorite_teams_v${variant}.json`);

    res.json({
        variant: activeVariation,
        file: `favorite_teams_v${activeVariation}.json`,
        endpoint: "/drawer/sports_favorites",
    });
});

app.get("/drawer/sports_favorites", (req, res) => {
    try {
        const sourceScreen = String(req.query.sourceScreen || "").toLowerCase();
        const stack = String(req.query.stack || "").toLowerCase();

        res.set("Cache-Control", "no-store");

        if (!stack) {
            const queryVariant = String(req.query.variant || "").toLowerCase() || null;
            const dataFile = resolveLeagueDataFile(queryVariant);
            const effectiveVariant = queryVariant || activeVariation || "default";

            console.log(
                `[drawer/sports_favorites] sourceScreen=${sourceScreen || "-"} stack=- variant=${effectiveVariant} -> ${path.basename(dataFile)}`
            );
            return res.json(readJsonFile(dataFile));
        }

        if (!SUPPORTED_STACKS.includes(stack)) {
            console.warn(`[drawer/sports_favorites] unsupported stack=${stack}`);
            return res.status(404).json({
                error: "unsupported_stack",
                stack,
                supported: SUPPORTED_STACKS,
            });
        }

        const fileKey = STACK_FILE_ALIASES[stack] || stack;
        const stackFile = path.join(DATA_DIR, `favorite_teams_${fileKey}.json`);

        if (!fs.existsSync(stackFile)) {
            console.warn(`[drawer/sports_favorites] missing data file for stack=${stack}: ${stackFile}`);
            return res.status(404).json({ error: "stack_data_not_found", stack });
        }

        console.log(`[drawer/sports_favorites] sourceScreen=${sourceScreen || "-"} stack=${stack} -> ${path.basename(stackFile)}`);
        return res.json(readJsonFile(stackFile));
    } catch (err) {
        console.error("Failed to read favorite teams JSON:", err);
        res.status(500).json({ error: "internal_error" });
    }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/drawer/favorites", (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        return res.json(getAllFavorites(DATA_DIR));
    } catch (err) {
        console.error("Failed to read favorites.json:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

function handleWatchlist(req, res, action) {
    try {
        const channelGuid =
            req.body?.channel_guid || req.body?.external_id || req.query?.channel_guid || req.query?.external_id;

        if (!channelGuid) {
            return res.status(400).json({ error: "missing_channel_guid" });
        }

        const result = action === "favorite" ? favoriteTeam(DATA_DIR, channelGuid) : unfavoriteTeam(DATA_DIR, channelGuid);

        if (result.error) {
            const status = result.error === "team_not_found" ? 404 : 400;
            console.warn(`[watchlists] ${action} failed channel_guid=${channelGuid} -> ${result.error}`);
            return res.status(status).json(result);
        }

        console.log(
            `[watchlists] ${result.action} stack=${result.stack} channel_guid=${channelGuid} team=${result.team_name || "-"} fav_count=${result.fav_count}`
        );

        res.set("Cache-Control", "no-store");
        return res.status(200).json(buildWatchlistResponse(channelGuid, action, result));
    } catch (err) {
        console.error(`Failed to ${action} team:`, err);
        return res.status(500).json({ error: "internal_error" });
    }
}

app.post("/watchlists/v5/watches.json", (req, res) => handleWatchlist(req, res, "favorite"));
app.delete("/watchlists/v5/watches.json", (req, res) => handleWatchlist(req, res, "unfavorite"));

app.listen(PORT, () => {
    console.log(`SSFavorite mock server listening at https://mockserverfavorites.onrender.com`);
    console.log(`  GET https://mockserverfavorites.onrender.com/drawer/sports_favorites`);
    console.log(`  GET https://mockserverfavorites.onrender.com/drawer/variations`);
    console.log(`  GET https://mockserverfavorites.onrender.com/drawer/favorites`);
    console.log(`  POST https://mockserverfavorites.onrender.com/watchlists/v5/watches.json`);
    console.log(`  DELETE https://mockserverfavorites.onrender.com/watchlists/v5/watches.json`);
    console.log(`  GET https://mockserverfavorites.onrender.com/1280x720/<team>.png`);
});
